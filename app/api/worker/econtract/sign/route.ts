import { NextResponse } from "next/server";
import { withWorker } from "@/app/lib/contracts/workerRoute";
import { issuesForClient, prepareContract } from "@/app/lib/contracts/prepare";
import { renderContractPdf, sha256Hex } from "@/app/lib/contracts/renderPdf";
import { CONTRACT_FONT_PATH, readAsset } from "@/app/lib/contracts/assets";
import { CONTRACT_BUCKET, logContractEvent } from "@/app/lib/contracts/server";
import { maskResidentNumber } from "@/app/lib/contracts/residentNumber";
import { getRequestMeta } from "@/app/lib/attendanceAudit";

/**
 * 서명 확정.
 *
 * 순서
 *   1) 서버가 검사 모듈로 다시 검사 — 하나라도 걸리면 거부(화면 검사만 믿지 않음)
 *   2) 미리보기를 끝까지 봤는지(증거 기록), 경고를 확인했는지, 동의 체크를 했는지
 *   3) 입력값·서명·직인을 얹은 최종 PDF 생성 → SHA-256
 *   4) 비공개 저장소에 PDF·서명 이미지 저장
 *   5) 서명대기 → 서명완료 (서명 시점 입력값 전체를 스냅샷으로)
 *   6) 겹치는 이전 계약(예: 당근→고정 전환 전의 1주 계약)은 종료 처리
 *   7) 증거 기록
 */

const MAX_SIGNATURE_BYTES = 500 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function decodeSignature(dataUrl: unknown): Uint8Array | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ""));

  if (!m) return null;

  const bytes = new Uint8Array(Buffer.from(m[1], "base64"));

  if (bytes.length < 200 || bytes.length > MAX_SIGNATURE_BYTES) return null;
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) return null;

  return bytes;
}

export async function POST(request: Request) {
  return withWorker(request, async ({ supabase, employee, body }) => {
    const contractId = Number(body.contractId);

    if (!Number.isInteger(contractId) || contractId <= 0) {
      return NextResponse.json({ success: false, message: "계약서를 찾을 수 없습니다." }, { status: 400 });
    }

    const result = await prepareContract(supabase, employee, contractId, body.input);

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status });
    }

    const { prepared } = result;
    const reject = async (message: string, detail: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
      await logContractEvent(supabase, request, {
        contractId,
        employeeId: employee.id,
        eventType: "sign_rejected",
        actor: "worker",
        detail,
      });

      return NextResponse.json({ success: false, message, ...extra }, { status: 400 });
    };

    // 1) 서버 재검사
    if (!prepared.validation.ok || !prepared.renderValues) {
      return reject(
        "고쳐야 할 칸이 있어 서명할 수 없습니다.",
        { reason: "validation", codes: prepared.validation.errors.map((e) => e.code) },
        issuesForClient(prepared.validation)
      );
    }

    // 2) 경고 확인 · 동의 · 미리보기 열람
    const warningCodes = prepared.validation.warnings.map((w) => w.code);

    if (warningCodes.length > 0 && body.warningAcknowledged !== true) {
      return reject("주민등록번호 확인 안내를 읽고 확인에 체크해주세요.", { reason: "warning_not_acknowledged", codes: warningCodes });
    }

    if (body.consent !== true) {
      return reject("\"위 내용에 동의하며 서명합니다\"에 체크해주세요.", { reason: "no_consent" });
    }

    const { data: readEvents } = await supabase
      .from("contract_signature_events")
      .select("id")
      .eq("contract_id", contractId)
      .eq("event_type", "preview_read_to_end")
      .limit(1);

    if (!readEvents || readEvents.length === 0) {
      return reject("계약서 미리보기를 끝까지 읽어주세요.", { reason: "preview_not_read" });
    }

    const signature = decodeSignature(body.signature);

    if (!signature) {
      return reject("서명을 다시 해주세요.", { reason: "signature_invalid" });
    }

    // 3) 최종 PDF
    const signedAt = new Date();
    const seal = prepared.entity.seal_path ? readAsset(prepared.entity.seal_path) : null;

    if (!seal) {
      return NextResponse.json({ success: false, message: "회사 직인이 설정되어 있지 않습니다. 관리자에게 문의하세요." }, { status: 500 });
    }

    const pdf = await renderContractPdf({
      template: prepared.template,
      templateBytes: readAsset(prepared.templateRow.file_path),
      fontBytes: readAsset(CONTRACT_FONT_PATH),
      values: prepared.renderValues,
      signaturePng: signature,
      sealPng: seal,
      signedAt,
    });
    const pdfSha = sha256Hex(pdf);

    // 4) 비공개 저장소
    const folder = `${employee.id}/${contractId}`;
    const pdfPath = `${folder}/contract-${pdfSha.slice(0, 16)}.pdf`;
    const signaturePath = `${folder}/signature-${sha256Hex(signature).slice(0, 16)}.png`;
    const storage = supabase.storage.from(CONTRACT_BUCKET);

    const upSig = await storage.upload(signaturePath, signature, { contentType: "image/png", upsert: false });
    const upPdf = await storage.upload(pdfPath, pdf, { contentType: "application/pdf", upsert: false });

    if (upSig.error || upPdf.error) {
      await storage.remove([signaturePath, pdfPath]);

      return NextResponse.json(
        { success: false, message: `계약서 저장 실패: ${(upSig.error || upPdf.error)?.message}` },
        { status: 500 }
      );
    }

    // 5) 서명완료 + 스냅샷
    const { input, validation } = prepared;
    const renderValues = prepared.renderValues;
    const meta = getRequestMeta(request);
    const snapshot = {
      name: input.name,
      // 암호화하지 않기로 결정(2026-10-14). 관리자 화면에는 residentNumberMasked 만 씁니다.
      residentNumber: renderValues.residentNumberDigits,
      residentNumberMasked: maskResidentNumber(renderValues.residentNumberDigits),
      phone: renderValues.phoneDigits,
      address: input.address,
      startDate: input.startDate,
      endDate: renderValues.endDate,
      writtenDate: renderValues.writtenDate,
      workDays: input.workDays,
      workStart: input.workStart,
      workEnd: input.workEnd,
      breakStart: input.breakStart,
      breakEnd: input.breakEnd,
      dailyNetMinutes: validation.derived.dailyNetMinutes,
      weeklyNetMinutes: validation.derived.weeklyNetMinutes,
      note: input.note,
      serviceScopeOther: input.serviceScopeOther,
      printedHourlyWage: prepared.templateRow.printed_hourly_wage,
      employeeHourlyWage: employee.hourly_wage,
      templateCode: prepared.templateRow.code,
      templateSha256: prepared.templateRow.file_sha256,
      fieldMapVersion: prepared.templateRow.field_map_version,
      entity: {
        businessName: prepared.entity.business_name,
        representative: prepared.entity.representative,
        address: prepared.entity.address,
      },
      workplace: employee.workplace_name || "장사꾼",
      warningsAcknowledged: warningCodes,
    };

    const { data: signedRows, error: signError } = await supabase
      .from("employment_contracts")
      .update({
        status: "signed",
        start_date: input.startDate,
        end_date: renderValues.endDate,
        input_snapshot: snapshot,
        signature_path: signaturePath,
        signed_pdf_path: pdfPath,
        signed_pdf_sha256: pdfSha,
        signed_at: signedAt.toISOString(),
        signer_ip: meta.requestIp,
        signer_user_agent: meta.userAgent,
      })
      .eq("id", contractId)
      .eq("status", "pending")
      .select("id");

    if (signError || !signedRows || signedRows.length === 0) {
      await storage.remove([signaturePath, pdfPath]);

      return NextResponse.json(
        { success: false, message: signError ? `서명 저장 실패: ${signError.message}` : "이미 서명했거나 무효 처리된 계약서입니다." },
        { status: signError ? 500 : 409 }
      );
    }

    // 6) 겹치는 이전 계약 종료 (직원 1명당 동시에 유효한 계약은 1건)
    const { data: endedRows } = await supabase
      .from("employment_contracts")
      .update({ status: "ended", ended_at: signedAt.toISOString(), superseded_by: contractId })
      .eq("employee_id", employee.id)
      .eq("status", "signed")
      .neq("id", contractId)
      .gte("end_date", input.startDate)
      .select("id");

    for (const row of endedRows ?? []) {
      await logContractEvent(supabase, request, {
        contractId: row.id,
        employeeId: employee.id,
        eventType: "ended",
        actor: "system",
        detail: { supersededBy: contractId },
      });
    }

    // 직원 정보: 11개월 계약은 계약 날짜를 맞추고, 첫입사일이 비어 있으면 채웁니다.
    if (prepared.contract.kind === "month11") {
      await supabase
        .from("employees")
        .update({ contract_start_date: input.startDate, contract_end_date: renderValues.endDate })
        .eq("id", employee.id);
    }

    await supabase.from("employees").update({ first_hire_date: input.startDate }).eq("id", employee.id).is("first_hire_date", null);

    // 7) 증거 기록 — 이 기록이 곧 서명 증거이므로 실패하면 알립니다.
    if (warningCodes.length > 0) {
      await logContractEvent(supabase, request, {
        contractId,
        employeeId: employee.id,
        eventType: "warning_acknowledged",
        actor: "worker",
        detail: { warningCodes, at: "sign" },
        documentSha256: pdfSha,
      });
    }

    const logged = await logContractEvent(supabase, request, {
      contractId,
      employeeId: employee.id,
      eventType: "signed",
      actor: "worker",
      detail: {
        kind: prepared.contract.kind,
        triggerReason: prepared.contract.trigger_reason,
        endedContracts: (endedRows ?? []).map((r) => r.id),
      },
      documentSha256: pdfSha,
    });

    if (!logged) console.error(`[econtract] 계약 ${contractId} 서명 기록 저장 실패`);

    return NextResponse.json({
      success: true,
      contractId,
      documentSha256: pdfSha,
      startDate: input.startDate,
      endDate: renderValues.endDate,
      message: "서명이 완료되었습니다.",
    });
  });
}
