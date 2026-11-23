import type { SupabaseClient } from "@supabase/supabase-js";
import { createPendingContract } from "./lifecycle";
import { contractKindForEmploymentType } from "./period";
import type { ContractInput, ValidationContext } from "./validation";

// 서버 전용. 근로자 앱의 계약서 API 가 공통으로 쓰는 것들.
//
// 근로자 확인은 출근 기록과 같은 방식(이름 + 생년월일 + 휴대폰 뒤 4자리)입니다.
// 기기 확인은 하지 않기로 했습니다(2026-10-14 사용자 결정).

export type WorkerIdentity = { name: string; birthDate: string; phoneLast4: string };

export type WorkerEmployee = {
  id: number;
  name: string;
  birth_date: string | null;
  phone: string | null;
  resident_number: string | null;
  workplace_name: string | null;
  employment_type: string | null;
  contract_type: string | null;
  hourly_wage: number | null;
  is_active: boolean;
  first_hire_date: string | null;
};

export function readIdentity(body: unknown): WorkerIdentity | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = String(b.name ?? "").trim();
  const birthDate = String(b.birthDate ?? "").trim();
  const phoneLast4 = String(b.phoneLast4 ?? "").trim();

  if (!name || !birthDate || !phoneLast4) return null;

  return { name, birthDate, phoneLast4 };
}

export async function findWorker(
  supabase: SupabaseClient,
  identity: WorkerIdentity
): Promise<WorkerEmployee | null> {
  const { data } = await supabase
    .from("employees")
    .select("id, name, birth_date, phone, resident_number, workplace_name, employment_type, contract_type, hourly_wage, is_active, first_hire_date")
    .eq("name", identity.name)
    .eq("birth_date", identity.birthDate)
    .eq("phone_last4", identity.phoneLast4)
    .limit(2);

  // 같은 이름·생년월일·뒤 4자리가 둘이면 누구인지 알 수 없으므로 거부합니다.
  if (!data || data.length !== 1) return null;

  return data[0] as WorkerEmployee;
}

/** 오늘(KST) 'YYYY-MM-DD' */
export function todayKst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

type ContractRow = {
  id: number;
  status: string;
  kind: string;
  start_date: string | null;
  end_date: string | null;
  input_snapshot: Record<string, unknown> | null;
  prefill: Record<string, unknown> | null;
};

/** 계약서 관리 대상이 된 근로자인지(계약서 행이 하나라도 있는지). 기존 직원은 없음. */
export async function contractHistory(supabase: SupabaseClient, employeeId: number) {
  const { data } = await supabase
    .from("employment_contracts")
    .select("id, status, kind, start_date, end_date, input_snapshot, prefill")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  return (data ?? []) as ContractRow[];
}

/** 직전 서명 계약서의 입력값(미리 채우기용). 서명 이미지·생성 정보는 빼고 넘깁니다. */
export function previousInput(history: ContractRow[]): Record<string, unknown> {
  const last = history.find((c) => (c.status === "signed" || c.status === "ended") && c.input_snapshot);

  if (!last?.input_snapshot) return {};

  const { name, residentNumber, phone, address, workDays, workStart, workEnd, breakStart, breakEnd, note, serviceScopeOther } =
    last.input_snapshot as Record<string, unknown>;

  return { name, residentNumber, phone, address, workDays, workStart, workEnd, breakStart, breakEnd, note, serviceScopeOther };
}

/**
 * 근로자 앱이 열릴 때 / 출근 버튼을 누를 때 "서명할 계약서가 있는지".
 * onCheckIn 이면 "당근 근로자의 1주 계약이 끝났는데 다시 출근"을 감지해 서명대기를 만듭니다.
 */
export async function contractRequirement(
  supabase: SupabaseClient,
  request: Request,
  employee: WorkerEmployee,
  options: { onCheckIn: boolean }
): Promise<{ required: boolean; contractId: number | null; kind: string | null }> {
  const history = await contractHistory(supabase, employee.id);
  const pending = history.find((c) => c.status === "pending");

  if (pending) return { required: true, contractId: pending.id, kind: pending.kind };

  // 기존 직원(계약서 행이 하나도 없음)은 대상이 아닙니다.
  if (history.length === 0 || !options.onCheckIn) {
    return { required: false, contractId: null, kind: null };
  }

  if (contractKindForEmploymentType(employee.employment_type) !== "week") {
    return { required: false, contractId: null, kind: null };
  }

  const today = todayKst();
  const valid = history.some(
    (c) => c.status === "signed" && c.start_date && c.end_date && c.start_date <= today && today <= c.end_date
  );

  if (valid) return { required: false, contractId: null, kind: null };

  const created = await createPendingContract(supabase, request, {
    employeeId: employee.id,
    triggerReason: "week_expired",
    prefill: previousInput(history),
    actor: "worker",
  });

  return created.ok
    ? { required: true, contractId: created.contractId, kind: "week" }
    : { required: false, contractId: null, kind: null };
}

/** 연도별 최저시급 표(검사 함수에 넘기기 위해 미리 다 읽어 둡니다). */
export async function loadMinimumWages(supabase: SupabaseClient) {
  const { data } = await supabase.from("minimum_wages").select("year, hourly_wage");
  const map = new Map<number, number>((data ?? []).map((r) => [r.year as number, r.hourly_wage as number]));

  return (year: number) => map.get(year) ?? null;
}

/** 근로자가 보낸 입력값을 검사 모듈 형식으로 정리합니다(알 수 없는 칸은 버림). */
export function readContractInput(raw: unknown): ContractInput {
  const b = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => String(v ?? "").trim();

  return {
    name: str(b.name),
    residentNumber: str(b.residentNumber),
    phone: str(b.phone),
    address: str(b.address),
    startDate: str(b.startDate),
    workDays: Array.isArray(b.workDays) ? (b.workDays.map(String) as ContractInput["workDays"]) : [],
    workStart: str(b.workStart),
    workEnd: str(b.workEnd),
    breakStart: str(b.breakStart),
    breakEnd: str(b.breakEnd),
    note: str(b.note).slice(0, 20),
    serviceScopeOther: str(b.serviceScopeOther).slice(0, 40),
  };
}

export function validationContext(
  kind: "week" | "month11",
  printedHourlyWage: number,
  employee: WorkerEmployee,
  minimumWageForYear: (year: number) => number | null,
  startDateFixed = false
): ValidationContext {
  return {
    kind,
    today: todayKst(),
    minimumWageForYear,
    printedHourlyWage,
    employeeHourlyWage: employee.hourly_wage ?? null,
    startDateFixed,
    workplace: employee.workplace_name || "장사꾼",
  };
}
