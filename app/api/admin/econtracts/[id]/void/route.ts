import { NextResponse } from "next/server";
import { createPendingContract } from "@/app/lib/contracts/lifecycle";
import { isAdminRequest, logContractEvent, serviceClient } from "@/app/lib/contracts/server";

/**
 * 계약서 무효 처리.
 *
 * 서명된 계약서는 고칠 수 없으므로, 바꿔야 하면 무효 처리하고 근로자가 새로 작성합니다.
 * 무효 처리하면 같은 근로자에게 서명대기 계약서를 바로 다시 만들어 둡니다
 * → 근로자가 다음에 앱을 열 때 계약서 페이지가 다시 뜹니다.
 *
 * 무효로 바꿀 때 DB 트리거는 상태·사유·시각 외의 칸이 바뀌면 거부합니다.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ success: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const contractId = Number(id);

  if (!Number.isInteger(contractId) || contractId <= 0) {
    return NextResponse.json({ success: false, message: "계약서를 찾을 수 없습니다." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const reason = String(body?.reason ?? "").trim();

  if (!reason) {
    return NextResponse.json({ success: false, message: "무효 사유를 입력해주세요." }, { status: 400 });
  }

  if (reason.length > 200) {
    return NextResponse.json({ success: false, message: "무효 사유는 200자 이내로 입력해주세요." }, { status: 400 });
  }

  const supabase = serviceClient();

  if (!supabase) {
    return NextResponse.json({ success: false, message: "환경변수 없음" }, { status: 500 });
  }

  const { data: contract, error: findError } = await supabase
    .from("employment_contracts")
    .select("id, employee_id, status, start_date, end_date, prefill, input_snapshot")
    .eq("id", contractId)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ success: false, message: `조회 실패: ${findError.message}` }, { status: 500 });
  }

  if (!contract) {
    return NextResponse.json({ success: false, message: "계약서를 찾을 수 없습니다." }, { status: 404 });
  }

  if (contract.status !== "pending" && contract.status !== "signed") {
    return NextResponse.json(
      { success: false, message: `이미 ${contract.status === "void" ? "무효" : "종료"} 처리된 계약서입니다.` },
      { status: 409 }
    );
  }

  // 화면에서 본 상태 그대로일 때만 바꿉니다(그 사이 서명되거나 무효가 됐으면 0행).
  const { data: updated, error: updateError } = await supabase
    .from("employment_contracts")
    .update({ status: "void", void_reason: reason, voided_at: new Date().toISOString() })
    .eq("id", contractId)
    .eq("status", contract.status)
    .select("id");

  if (updateError) {
    return NextResponse.json({ success: false, message: `무효 처리 실패: ${updateError.message}` }, { status: 500 });
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { success: false, message: "그 사이 계약서 상태가 바뀌었습니다. 새로고침 후 다시 확인해주세요." },
      { status: 409 }
    );
  }

  await logContractEvent(supabase, request, {
    contractId,
    employeeId: contract.employee_id,
    eventType: "voided",
    actor: "admin-ui",
    detail: { reason, previousStatus: contract.status },
  });

  // 같은 근로자에게 새 서명대기. 직전 입력값을 미리 채울 수 있게 넘깁니다(서명 이미지는 넘기지 않음).
  const previousInput = (contract.input_snapshot ?? contract.prefill ?? {}) as Record<string, unknown>;
  const reissue = await createPendingContract(supabase, request, {
    employeeId: contract.employee_id,
    triggerReason: "reissue",
    prefill: { ...previousInput, reissuedFrom: contractId },
    startDate: contract.start_date,
    endDate: contract.end_date,
    actor: "admin-ui",
  });

  return NextResponse.json({
    success: true,
    message: reissue.ok
      ? "무효 처리했습니다. 근로자가 다음에 앱을 열면 계약서 작성 화면이 다시 뜹니다."
      : `무효 처리했습니다. 다만 새 계약서는 만들지 않았습니다: ${reissue.reason}`,
    reissuedContractId: reissue.ok ? reissue.contractId : null,
  });
}
