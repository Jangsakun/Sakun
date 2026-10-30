// 계약 기간이 끝난 직원의 출퇴근 막기 (2026-10-30 사용자 요청)
//
// 지금 고용형태의 계약 종류(당근=1주, 고정=11개월)로 서명한 계약서가 한 번이라도 있는 직원만 검사합니다.
// 예) 당근 1주 계약만 있다가 고정으로 바뀐 직원은 11개월 계약 이력이 없으니 막지 않습니다.
// 계약서가 하나도 없는 기존 직원·서명 전 신규 가입자는
// 그대로 출퇴근할 수 있습니다(기존 동작 유지).
// 근무일 기준: 출근은 오늘, 퇴근은 새벽 06:00 전이면 전날 근무(야간 근무 규칙과 같음).
// 관리자 수동입력은 이 검사를 거치지 않습니다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { attendanceWorkDateKey } from "../workTime";
import { contractKindForEmploymentType } from "./period";
import { serviceClient } from "./server";

export const CONTRACT_EXPIRED_CODE = "contract_expired";
export const CONTRACT_EXPIRED_MESSAGE =
  "근로계약 기간이 끝났습니다. 새 근로계약서를 작성(서명)해야 출퇴근할 수 있습니다.";

type ContractPeriod = { kind?: string | null; status: string; start_date: string | null; end_date: string | null };

/** 순수 함수 — 계약 이력으로 그 근무일에 출퇴근할 수 있는지 */
export function contractGateFor(history: ContractPeriod[], workDate: string, kind?: string): "no_history" | "valid" | "expired" {
  // 서명 완료(signed) 또는 새 계약으로 넘어가 종료(ended)된 계약만 기간으로 봅니다(무효·서명대기 제외).
  const signed = history.filter((c) => (c.status === "signed" || c.status === "ended") && c.start_date && c.end_date);

  // 종류와 상관없이 그날을 포함하는 계약이 있으면 허용(예: 당근→고정 전환 직후 아직 1주 계약 기간인 날).
  if (signed.some((c) => c.start_date! <= workDate && workDate <= c.end_date!)) return "valid";

  return signed.some((c) => !kind || c.kind === kind) ? "expired" : "no_history";
}

/** 막아야 하면 거절 결과, 아니면 null. 확인에 실패하면 막지 않습니다(설정 오류로 전원이 못 찍는 일 방지). */
export async function contractGateReject(
  employeeId: number,
  recordType: "check_in" | "check_out",
  now = new Date()
): Promise<{ status: number; message: string; code: string } | null> {
  const supabase: SupabaseClient | null = serviceClient();

  if (!supabase) return null;

  const { data, error } = await supabase
    .from("employment_contracts")
    .select("kind, status, start_date, end_date")
    .eq("employee_id", employeeId);
  const { data: employee } = await supabase.from("employees").select("employment_type").eq("id", employeeId).maybeSingle();

  if (error) {
    console.error("[attendance] 계약 기간 확인 실패:", error.message);
    return null;
  }

  const workDate = attendanceWorkDateKey({ checked_at: now.toISOString(), record_type: recordType });

  return contractGateFor((data ?? []) as ContractPeriod[], workDate, contractKindForEmploymentType(employee?.employment_type)) === "expired"
    ? { status: 403, message: CONTRACT_EXPIRED_MESSAGE, code: CONTRACT_EXPIRED_CODE }
    : null;
}
