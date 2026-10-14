import type { SupabaseClient } from "@supabase/supabase-js";
import { checkResidentNumber } from "./residentNumber";
import { getTemplate, type ContractTemplate } from "./templates";
import { validateContractInput, type ContractInput, type ValidationResult } from "./validation";
import { loadMinimumWages, readContractInput, todayKst, validationContext, type WorkerEmployee } from "./worker";
import { resolveResidentNumber } from "./workerRoute";
import type { RenderValues } from "./renderPdf";

// 서버 전용. 미리보기와 서명 확정이 "같은 검사, 같은 값"으로 PDF 를 만들도록 한 곳에 모읍니다.

export type PreparedContract = {
  contract: {
    id: number;
    employee_id: number;
    kind: "week" | "month11";
    trigger_reason: string;
    start_date: string | null;
    template_id: number;
    entity_id: number;
    prefill: Record<string, unknown>;
  };
  template: ContractTemplate;
  templateRow: { code: string; file_path: string; file_sha256: string; printed_hourly_wage: number; field_map_version: number };
  entity: { business_name: string; representative: string; address: string; seal_path: string | null };
  input: ContractInput;
  validation: ValidationResult;
  renderValues: RenderValues | null;
  today: string;
};

export async function prepareContract(
  supabase: SupabaseClient,
  employee: WorkerEmployee,
  contractId: number,
  rawInput: unknown
): Promise<{ ok: true; prepared: PreparedContract } | { ok: false; status: number; message: string }> {
  const { data: contract } = await supabase
    .from("employment_contracts")
    .select("id, employee_id, kind, status, trigger_reason, start_date, template_id, entity_id, prefill, templateRow:contract_templates(code, file_path, file_sha256, printed_hourly_wage, field_map_version), entity:contract_entities(business_name, representative, address, seal_path)")
    .eq("id", contractId)
    .maybeSingle();

  // 남의 계약서이거나 없는 계약서는 똑같이 "없음"으로 답합니다.
  if (!contract || contract.employee_id !== employee.id) {
    return { ok: false, status: 404, message: "계약서를 찾을 수 없습니다." };
  }

  if (contract.status !== "pending") {
    return { ok: false, status: 409, message: "이미 서명했거나 무효 처리된 계약서입니다. 앱을 다시 열어주세요." };
  }

  const templateRow = contract.templateRow as unknown as PreparedContract["templateRow"];
  const template = getTemplate(templateRow.code);

  // 코드의 필드맵과 DB 양식 정보가 같은 원본을 가리키는지 확인합니다.
  if (!template || template.sha256 !== templateRow.file_sha256 || template.fieldMapVersion !== templateRow.field_map_version) {
    return { ok: false, status: 500, message: "계약서 양식 설정이 맞지 않습니다. 관리자에게 문의하세요." };
  }

  const input = readContractInput(rawInput);
  const prefill = (contract.prefill ?? {}) as Record<string, unknown>;

  input.residentNumber = resolveResidentNumber(input.residentNumber, employee, prefill.residentNumber);

  // 11개월 갱신은 시작일이 직전 만료일 다음 날로 고정입니다.
  const startDateFixed = contract.trigger_reason === "renewal" && Boolean(contract.start_date);

  if (startDateFixed) {
    input.startDate = contract.start_date!;
  }

  // 1주 양식이 아니면 근무시간 칸은 쓰지 않습니다.
  if (contract.kind !== "week") {
    input.workDays = [];
    input.workStart = input.workEnd = input.breakStart = input.breakEnd = input.note = "";
  } else {
    input.serviceScopeOther = "";
  }

  const minimumWage = await loadMinimumWages(supabase);
  const validation = validateContractInput(
    input,
    validationContext(contract.kind as "week" | "month11", templateRow.printed_hourly_wage, employee, minimumWage, startDateFixed)
  );

  const today = todayKst();
  const renderValues: RenderValues | null = validation.ok
    ? {
        name: input.name,
        residentNumberDigits: checkResidentNumber(input.residentNumber, today).digits,
        phoneDigits: input.phone.replace(/\D/g, ""),
        address: input.address,
        startDate: input.startDate,
        endDate: validation.derived.endDate!,
        writtenDate: today,
        workDays: input.workDays,
        workStart: input.workStart,
        workEnd: input.workEnd,
        breakStart: input.breakStart,
        breakEnd: input.breakEnd,
        dailyNetMinutes: validation.derived.dailyNetMinutes,
        note: input.note,
        serviceScopeOther: input.serviceScopeOther,
      }
    : null;

  return {
    ok: true,
    prepared: {
      contract: {
        id: contract.id,
        employee_id: contract.employee_id,
        kind: contract.kind as "week" | "month11",
        trigger_reason: contract.trigger_reason,
        start_date: contract.start_date,
        template_id: contract.template_id,
        entity_id: contract.entity_id,
        prefill,
      },
      template,
      templateRow,
      entity: contract.entity as unknown as PreparedContract["entity"],
      input,
      validation,
      renderValues,
      today,
    },
  };
}

/** 화면에 보낼 오류·경고. 주민번호 원본은 들어가지 않습니다(검사 모듈 메시지에 번호가 없음). */
export function issuesForClient(validation: ValidationResult) {
  return {
    errors: validation.errors.map(({ field, code, message }) => ({ field, code, message })),
    warnings: validation.warnings.map(({ field, code, message }) => ({ field, code, message })),
  };
}
