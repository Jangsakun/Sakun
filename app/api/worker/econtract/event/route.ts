import { NextResponse } from "next/server";
import { withWorker } from "@/app/lib/contracts/workerRoute";
import { logContractEvent } from "@/app/lib/contracts/server";

/**
 * 근로자 화면에서 생기는 증거 기록(작성 시작, 미리보기 끝까지 열람, 경고 확인).
 * 서명 완료·거부는 서버가 서명 처리 중에 직접 남기므로 여기서 받지 않습니다.
 */
const ALLOWED = new Set(["input_started", "preview_read_to_end", "warning_acknowledged"]);

export async function POST(request: Request) {
  return withWorker(request, async ({ supabase, employee, body }) => {
    const contractId = Number(body.contractId);
    const type = String(body.type ?? "");

    if (!Number.isInteger(contractId) || !ALLOWED.has(type)) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }

    const { data: contract } = await supabase
      .from("employment_contracts")
      .select("id, employee_id, status")
      .eq("id", contractId)
      .maybeSingle();

    if (!contract || contract.employee_id !== employee.id || contract.status !== "pending") {
      return NextResponse.json({ success: false, message: "계약서를 찾을 수 없습니다." }, { status: 404 });
    }

    const sha = String(body.documentSha256 ?? "");
    const codes = Array.isArray(body.warningCodes) ? body.warningCodes.map(String).slice(0, 10) : [];

    const saved = await logContractEvent(supabase, request, {
      contractId,
      employeeId: employee.id,
      eventType: type as "input_started" | "preview_read_to_end" | "warning_acknowledged",
      actor: "worker",
      // 주민번호는 넣지 않습니다. 경고 종류 코드만 남깁니다.
      detail: type === "warning_acknowledged" ? { warningCodes: codes } : {},
      documentSha256: /^[0-9a-f]{64}$/.test(sha) ? sha : null,
    });

    return NextResponse.json({ success: saved });
  });
}
