import { NextResponse } from "next/server";
import { withWorker } from "@/app/lib/contracts/workerRoute";
import { loadMinimumWages, todayKst } from "@/app/lib/contracts/worker";
import { logContractEvent } from "@/app/lib/contracts/server";
import { maskResidentNumber } from "@/app/lib/contracts/residentNumber";
import { getTemplate } from "@/app/lib/contracts/templates";

/**
 * 작성할 계약서(서명대기) 내용과 미리 채울 값.
 *
 * 주민번호는 가린 값으로만 보냅니다. 근로자가 그대로 두면 서버가 DB 값을 씁니다.
 * 11개월 갱신은 시작일이 직전 만료일 다음 날로 정해져 있어 근로자가 바꿀 수 없습니다.
 */
export async function POST(request: Request) {
  return withWorker(request, async ({ supabase, employee, body }) => {
    const { data: contract } = await supabase
      .from("employment_contracts")
      .select("id, kind, status, trigger_reason, start_date, end_date, prefill, template:contract_templates(code, title, printed_hourly_wage), entity:contract_entities(business_name, representative, address)")
      .eq("employee_id", employee.id)
      .eq("status", "pending")
      .maybeSingle();

    if (!contract) {
      return NextResponse.json({ success: true, contract: null });
    }

    const template = contract.template as unknown as { code: string; title: string; printed_hourly_wage: number };
    const fieldMap = getTemplate(template.code);

    if (!fieldMap) {
      return NextResponse.json({ success: false, message: "계약서 양식을 찾을 수 없습니다. 관리자에게 문의하세요." }, { status: 500 });
    }

    const prefill = (contract.prefill ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
    const storedRrn = employee.resident_number || "";
    const prefillRrn = str(prefill.residentNumber) || storedRrn;

    // 주민번호는 가린 값만. 직전 계약 번호가 DB 번호와 다르면(재작성 등) 그 값도 가려서 보냅니다.
    const residentNumber = prefillRrn ? maskResidentNumber(prefillRrn) : "";

    const minimumWage = await loadMinimumWages(supabase);
    const thisYear = Number(todayKst().slice(0, 4));
    const minimumWages: Record<number, number | null> = {};

    for (const y of [thisYear - 1, thisYear, thisYear + 1]) minimumWages[y] = minimumWage(y);

    const fixedStartDate = contract.trigger_reason === "renewal" ? contract.start_date : null;

    await logContractEvent(supabase, request, {
      contractId: contract.id,
      employeeId: employee.id,
      eventType: "page_opened",
      actor: "worker",
    });

    return NextResponse.json({
      success: true,
      contract: {
        id: contract.id,
        kind: contract.kind,
        triggerReason: contract.trigger_reason,
        title: template.title,
        printedHourlyWage: template.printed_hourly_wage,
        employeeHourlyWage: employee.hourly_wage,
        minimumWages,
        fixedStartDate,
        today: todayKst(),
        entity: contract.entity,
        workplace: employee.workplace_name || "장사꾼",
        prefill: {
          name: str(prefill.name) || employee.name,
          residentNumber,
          // 가린 값을 그대로 두면 "등록된 번호 사용"이라는 표시
          residentNumberIsMasked: Boolean(residentNumber),
          phone: str(prefill.phone) || str(employee.phone),
          address: str(prefill.address),
          startDate: fixedStartDate || str(prefill.startDate) || todayKst(),
          workDays: Array.isArray(prefill.workDays) ? prefill.workDays : ["mon", "tue", "wed", "thu", "fri"],
          workStart: str(prefill.workStart) || "09:00",
          workEnd: str(prefill.workEnd) || "18:00",
          breakStart: str(prefill.breakStart) || "12:00",
          breakEnd: str(prefill.breakEnd) || "13:00",
          note: str(prefill.note),
          serviceScopeOther: str(prefill.serviceScopeOther),
        },
      },
    });
  });
}
