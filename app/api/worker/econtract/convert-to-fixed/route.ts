import { NextResponse } from "next/server";
import { withWorker } from "@/app/lib/contracts/workerRoute";
import { logContractEvent } from "@/app/lib/contracts/server";
import { prepareFixedContractAfterTypeChange } from "@/app/lib/contracts/typeChange";
import {
  FIELD_PIN_PATTERN,
  fieldPinLockReason,
  loadFieldPinHash,
  recordFieldPinAttempt,
  remainingFieldPinTries,
  verifyFieldPin,
} from "@/app/lib/fieldPin";
import { getRequestMeta } from "@/app/lib/attendanceAudit";

/**
 * 현장 직원 전환 (2026-10-27): 근로자 1주 계약서 화면에서 현장 직원이 PIN 을 넣으면
 *   고용구분 당근 → 고정, 서명 안 한 1주 계약서 무효, 11개월 서명대기 생성 → 그 자리에서 11개월 계약서 작성.
 * PIN 으로 할 수 있는 일은 이것 하나뿐입니다(고정 → 당근, 급여, 다른 직원 정보는 못 바꿈).
 * PIN 은 기록·로그에 남기지 않습니다. 직원별 15분 5번 / 전체 15분 20번 틀리면 막힙니다.
 */
export async function POST(request: Request) {
  return withWorker(request, async ({ supabase, employee, body }) => {
    const contractId = Number(body.contractId);
    const pin = String(body.pin ?? "").trim();

    if (!Number.isInteger(contractId) || contractId <= 0) {
      return NextResponse.json({ success: false, message: "계약서를 찾을 수 없습니다." }, { status: 400 });
    }

    if (!FIELD_PIN_PATTERN.test(pin)) {
      return NextResponse.json({ success: false, message: "PIN 은 숫자 4~8자리입니다." }, { status: 400 });
    }

    if (employee.employment_type !== "carrot") {
      return NextResponse.json({ success: false, message: "당근 근로자만 전환할 수 있습니다." }, { status: 409 });
    }

    // 지금 화면의 계약서가 이 근로자의 서명대기 1주 계약서인지
    const { data: contract } = await supabase
      .from("employment_contracts")
      .select("id, employee_id, kind, status")
      .eq("id", contractId)
      .maybeSingle();

    if (!contract || contract.employee_id !== employee.id || contract.status !== "pending" || contract.kind !== "week") {
      return NextResponse.json({ success: false, message: "전환할 1주 계약서가 없습니다. 화면을 새로고침해 주세요." }, { status: 409 });
    }

    const stored = await loadFieldPinHash(supabase);

    if (!stored) {
      return NextResponse.json(
        { success: false, message: "현장 직원 PIN 이 아직 설정되지 않았습니다. 관리자 화면 전자계약 탭에서 먼저 설정해 주세요." },
        { status: 503 }
      );
    }

    const locked = await fieldPinLockReason(supabase, employee.id);

    if (locked) {
      return NextResponse.json({ success: false, message: locked }, { status: 429 });
    }

    const { requestIp } = getRequestMeta(request);

    if (!verifyFieldPin(pin, stored.value_hash)) {
      await recordFieldPinAttempt(supabase, employee.id, false, requestIp);
      await logContractEvent(supabase, request, {
        contractId,
        employeeId: employee.id,
        eventType: "field_pin_failed",
        actor: "worker",
      });

      const remaining = await remainingFieldPinTries(supabase, employee.id);

      return NextResponse.json(
        { success: false, message: remaining > 0 ? `PIN 이 맞지 않습니다. (${remaining}번 남음)` : "PIN 을 여러 번 잘못 입력해 15분 동안 전환할 수 없습니다." },
        { status: 403 }
      );
    }

    await recordFieldPinAttempt(supabase, employee.id, true, requestIp);

    const { error: updateError } = await supabase
      .from("employees")
      .update({ employment_type: "fixed" })
      .eq("id", employee.id)
      .eq("employment_type", "carrot");

    if (updateError) {
      return NextResponse.json({ success: false, message: `고용구분 변경 실패: ${updateError.message}` }, { status: 500 });
    }

    const prepared = await prepareFixedContractAfterTypeChange(supabase, request, employee.id, {
      actor: "worker",
      voidReason: "현장 직원 PIN 으로 당근→고정 전환, 11개월 계약서 작성",
      source: "field",
    });

    if (!prepared.ok) {
      return NextResponse.json(
        { success: false, message: `고정으로 바꿨지만 11개월 계약서를 만들지 못했습니다: ${prepared.reason} 관리자에게 문의하세요.` },
        { status: 500 }
      );
    }

    await logContractEvent(supabase, request, {
      contractId: prepared.contractId,
      employeeId: employee.id,
      eventType: "field_converted",
      actor: "worker",
      detail: { fromContractId: contractId, voided: prepared.voidedIds },
    });

    return NextResponse.json({
      success: true,
      contractId: prepared.contractId,
      message: "고정(11개월) 계약서로 바꿨습니다. 11개월 근로계약서를 작성해 주세요.",
    });
  });
}
