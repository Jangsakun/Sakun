import type { SupabaseClient } from "@supabase/supabase-js";
import { createPendingContract } from "./lifecycle";
import { logContractEvent } from "./server";
import { contractHistory, previousInput } from "./worker";

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
