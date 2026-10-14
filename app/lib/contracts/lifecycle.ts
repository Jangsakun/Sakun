import type { SupabaseClient } from "@supabase/supabase-js";
import { contractKindForEmploymentType, type ContractKind } from "./period";
import { logContractEvent } from "./server";

// 서버 전용. "이 직원에게 서명할 계약서가 필요하다"를 서명대기 행으로 만듭니다.
//
// 계약서 페이지를 띄울지는 이 서명대기 행이 있는지로 정합니다.
// 기존 직원에게는 행을 만들지 않으므로(2026-10-14 결정) 기존 흐름은 그대로입니다.

export type TriggerReason = "signup" | "type_change" | "renewal" | "week_expired" | "reissue";

export type ContractTarget =
  | {
      ok: true;
      employee: { id: number; name: string; workplace_name: string; employment_type: string; contract_type: string };
      entityId: number;
      templateId: number;
      kind: ContractKind;
    }
  | { ok: false; reason: string };

/**
 * 계약서 대상인지 판단합니다.
 *   대상: 계약 명의가 연결된 사업장(1차: 장사꾼·깨소금·로엔티크) + 근로형태 시급 또는 시급+도급
 *   제외: 헤모즈 등 연결 안 된 사업장, 도급
 */
export async function resolveContractTarget(
  supabase: SupabaseClient,
  employeeId: number
): Promise<ContractTarget> {
  const { data: employee, error } = await supabase
    .from("employees")
    .select("id, name, workplace_name, employment_type, contract_type, is_active")
    .eq("id", employeeId)
    .maybeSingle();

  if (error) return { ok: false, reason: `직원 조회 실패: ${error.message}` };
  if (!employee) return { ok: false, reason: "직원을 찾을 수 없습니다." };
  if (employee.is_active === false) return { ok: false, reason: "비활성 직원입니다." };
  if (employee.contract_type === "piece") return { ok: false, reason: "도급 직원은 계약서 대상이 아닙니다." };

  const workplace = employee.workplace_name || "장사꾼";
  const { data: mapping } = await supabase
    .from("workplace_contract_entity")
    .select("entity_id")
    .eq("workplace_name", workplace)
    .maybeSingle();

  if (!mapping) return { ok: false, reason: `${workplace} 사업장은 아직 계약서 대상이 아닙니다.` };

  const kind = contractKindForEmploymentType(employee.employment_type);
  const { data: template } = await supabase
    .from("contract_templates")
    .select("id")
    .eq("entity_id", mapping.entity_id)
    .eq("kind", kind)
    .eq("is_active", true)
    .maybeSingle();

  if (!template) return { ok: false, reason: "사용할 계약서 양식이 없습니다." };

  return {
    ok: true,
    employee: {
      id: employee.id,
      name: employee.name,
      workplace_name: workplace,
      employment_type: employee.employment_type || "fixed",
      contract_type: employee.contract_type || "hourly",
    },
    entityId: mapping.entity_id,
    templateId: template.id,
    kind,
  };
}

/**
 * 서명대기 계약서를 만듭니다. 이미 서명대기가 있으면 새로 만들지 않고 그것을 돌려줍니다.
 */
export async function createPendingContract(
  supabase: SupabaseClient,
  request: Request | null,
  options: {
    employeeId: number;
    triggerReason: TriggerReason;
    prefill?: Record<string, unknown>;
    startDate?: string | null;
    endDate?: string | null;
    actor: "worker" | "admin-ui" | "system";
  }
): Promise<{ ok: true; contractId: number; created: boolean } | { ok: false; reason: string }> {
  const target = await resolveContractTarget(supabase, options.employeeId);

  if (!target.ok) return target;

  const { data: existing } = await supabase
    .from("employment_contracts")
    .select("id")
    .eq("employee_id", options.employeeId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) return { ok: true, contractId: existing.id, created: false };

  const { data: inserted, error } = await supabase
    .from("employment_contracts")
    .insert({
      employee_id: target.employee.id,
      employee_name: target.employee.name,
      workplace_name: target.employee.workplace_name,
      entity_id: target.entityId,
      template_id: target.templateId,
      kind: target.kind,
      status: "pending",
      trigger_reason: options.triggerReason,
      start_date: options.startDate ?? null,
      end_date: options.endDate ?? null,
      prefill: options.prefill ?? {},
    })
    .select("id")
    .maybeSingle();

  if (error || !inserted) {
    // 동시에 두 요청이 들어와 서명대기 하나만 허용하는 제약에 걸린 경우
    if (error?.code === "23505") {
      const { data: again } = await supabase
        .from("employment_contracts")
        .select("id")
        .eq("employee_id", options.employeeId)
        .eq("status", "pending")
        .maybeSingle();

      if (again) return { ok: true, contractId: again.id, created: false };
    }

    return { ok: false, reason: `서명대기 계약서 생성 실패: ${error?.message ?? "저장된 행 없음"}` };
  }

  await logContractEvent(supabase, request, {
    contractId: inserted.id,
    employeeId: target.employee.id,
    eventType: "created",
    actor: options.actor,
    detail: { triggerReason: options.triggerReason, kind: target.kind },
  });

  return { ok: true, contractId: inserted.id, created: true };
}
