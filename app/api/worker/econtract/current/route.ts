import { NextResponse } from "next/server";
import { withWorker } from "@/app/lib/contracts/workerRoute";
import { loadMinimumWages, todayKst } from "@/app/lib/contracts/worker";
import { logContractEvent } from "@/app/lib/contracts/server";
import { maskResidentNumber } from "@/app/lib/contracts/residentNumber";
import { getTemplate } from "@/app/lib/contracts/templates";
import { allowedWeekContractDays } from "@/app/lib/contracts/period";

/**
 * 사업장별 근무시간 기본값(2026-10-15 사용자 지정). 직전 계약서에 적은 값이 있으면 그 값이 우선입니다.
 * 빈칸("")은 근로자가 직접 입력합니다. 목록에 없는 사업장은 헤모즈·깨소금과 같이 휴게시간만 채웁니다.
 */
const WORK_TIME_DEFAULTS: Record<string, { workStart: string; workEnd: string; breakStart: string; breakEnd: string }> = {
  장사꾼: { workStart: "09:30", workEnd: "18:00", breakStart: "12:30", breakEnd: "13:30" },
  로엔티크: { workStart: "09:00", workEnd: "18:00", breakStart: "12:30", breakEnd: "13:30" },
  헤모즈: { workStart: "", workEnd: "", breakStart: "12:30", breakEnd: "13:30" },
  깨소금: { workStart: "", workEnd: "", breakStart: "12:30", breakEnd: "13:30" },
};
const WORK_TIME_FALLBACK = { workStart: "", workEnd: "", breakStart: "12:30", breakEnd: "13:30" };

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
    const workplace = employee.workplace_name || "장사꾼";
    const timeDefaults = WORK_TIME_DEFAULTS[workplace] ?? WORK_TIME_FALLBACK;
    const startDate = fixedStartDate || str(prefill.startDate) || todayKst();

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
        workplace,
        prefill: {
          name: str(prefill.name) || employee.name,
          residentNumber,
          // 가린 값을 그대로 두면 "등록된 번호 사용"이라는 표시
          residentNumberIsMasked: Boolean(residentNumber),
          phone: str(prefill.phone) || str(employee.phone),
          address: str(prefill.address),
          startDate,
          // 1주 계약: 계약 기간 안의 요일만 미리 채웁니다(직전 계약 요일 중 기간 안의 것, 없으면 기간 안 전부).
          workDays: (() => {
            if (contract.kind !== "week") return Array.isArray(prefill.workDays) ? prefill.workDays : [];
            const allowed = allowedWeekContractDays(startDate, workplace);
            const kept = Array.isArray(prefill.workDays) ? (prefill.workDays as string[]).filter((d) => allowed.includes(d)) : [];
            return kept.length > 0 ? kept : allowed;
          })(),
          workStart: str(prefill.workStart) || timeDefaults.workStart,
          workEnd: str(prefill.workEnd) || timeDefaults.workEnd,
          breakStart: str(prefill.breakStart) || timeDefaults.breakStart,
          breakEnd: str(prefill.breakEnd) || timeDefaults.breakEnd,
          note: str(prefill.note),
          serviceScopeOther: str(prefill.serviceScopeOther),
        },
      },
    });
  });
}
