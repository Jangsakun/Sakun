import type { SupabaseClient } from "@supabase/supabase-js";
import { createPendingContract } from "./lifecycle";
import { logContractEvent } from "./server";
import { contractHistory, previousInput } from "./worker";
import { currentWeekStartKst } from "@/app/lib/weeklyAllowanceHistory";

/**
 * 당근 → 고정(11개월) 전환 때 주휴수당을 "대상"으로 바꿉니다(2026-11-17 사용자 요청).
 * 전환한 주부터 적용합니다(지난주 이체분은 그대로). 주휴수당 변경 이력도 남깁니다.
 * 이미 "대상"이면 아무것도 하지 않습니다.
 */
export async function markWeeklyAllowanceTarget(supabase: SupabaseClient, employeeId: number) {
  const { data: before } = await supabase
    .from("employees")
    .select("weekly_allowance_status")
    .eq("id", employeeId)
    .maybeSingle();

  // 저장값이 비어 있으면 당근 기본값(비대상)으로 봅니다(직원 목록 API 와 같은 규칙).
  const oldStatus = String(before?.weekly_allowance_status || "").trim() || "비대상";

  if (!before || oldStatus === "대상") return { changed: false };

  const { error } = await supabase.from("employees").update({ weekly_allowance_status: "대상" }).eq("id", employeeId);

  if (error) {
    console.error("[typeChange] 주휴수당 대상 변경 실패:", error.message);
    return { changed: false };
  }

  const { error: historyError } = await supabase.from("weekly_allowance_status_changes").insert({
    employee_id: employeeId,
    old_status: oldStatus,
    new_status: "대상",
    effective_week_start: currentWeekStartKst(),
  });

  if (historyError) console.error("[typeChange] 주휴수당 변경 이력 저장 실패:", historyError.message);

  return { changed: true };
}

// 서버 전용. 당근 → 고정 전환 후 계약서 정리.
//   서명 안 한 1주 계약서는 무효 처리하고(그대로 두면 createPendingContract 가 그걸 돌려줘서
//   11개월 계약서가 안 만들어짐) 11개월 서명대기를 만듭니다. 서명된 1주 계약은 11개월 서명 때 종료됩니다.
// 관리자 직원관리 전환(api/admin/employees/[id])과 현장 직원 전환(api/worker/econtract/convert-to-fixed)이 같이 씁니다.
// 고용구분(employees.employment_type)을 바꾸는 것은 부르는 쪽이 먼저 합니다.

export async function prepareFixedContractAfterTypeChange(
  supabase: SupabaseClient,
  request: Request | null,
  employeeId: number,
  options: { actor: "admin-ui" | "worker"; voidReason: string; source: "admin" | "field" }
): Promise<{ ok: true; contractId: number; voidedIds: number[] } | { ok: false; reason: string }> {
  const history = await contractHistory(supabase, employeeId);

  // 계약서 기록이 없는 기존 직원은 대상이 아닙니다(2026-10-14 결정).
  if (history.length === 0) return { ok: false, reason: "계약서 대상이 아닌 직원입니다." };

  const voidedIds: number[] = [];

  for (const stale of history.filter((c) => c.status === "pending" && c.kind === "week")) {
    const { data: voided } = await supabase
      .from("employment_contracts")
      .update({ status: "void", void_reason: options.voidReason, voided_at: new Date().toISOString() })
      .eq("id", stale.id)
      .eq("status", "pending")
      .select("id");

    if (voided && voided.length > 0) {
      voidedIds.push(stale.id);
      await logContractEvent(supabase, request, {
        contractId: stale.id,
        employeeId,
        eventType: "voided",
        actor: options.actor,
        detail: { reason: "type_change", source: options.source, previousStatus: "pending" },
      });
    }
  }

  const pending = await createPendingContract(supabase, request, {
    employeeId,
    triggerReason: "type_change",
    prefill: previousInput(history),
    actor: options.actor,
  });

  if (!pending.ok) return pending;

  return { ok: true, contractId: pending.contractId, voidedIds };
}
