import {
  calcContractEnd,
  daysBetween,
  isSaturdayOnlyWeek,
  parseDateKey,
  type ContractKind,
} from "./period";
import { ageOn, checkResidentNumber } from "./residentNumber";

// 근로계약서 "작성 차단 검사" — 화면(입력 즉시)과 서버(서명 확정 직전)가 이 함수 하나를 씁니다.
// 규칙을 여기 말고 다른 곳에 따로 만들지 않습니다.

export const WORK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type WorkDay = (typeof WORK_DAYS)[number];

export const WORK_DAY_LABELS: Record<WorkDay, string> = {
  mon: "월",
  tue: "화",
  wed: "수",
  thu: "목",
  fri: "금",
  sat: "토",
};

/** 근로자가 입력하는 값. 시각은 'HH:MM'. */
export type ContractInput = {
  name: string;
  residentNumber: string;
  phone: string;
  address: string;
  startDate: string;
  /** 1주 양식만: 근무 요일(일요일 없음 — 양식에 칸이 없습니다) */
  workDays?: WorkDay[];
  /** 1주 양식만: 한 번 입력해 체크한 요일 칸에 똑같이 채웁니다 */
  workStart?: string;
  workEnd?: string;
  breakStart?: string;
  breakEnd?: string;
  /** 1주 양식만, 선택: 특이사항 */
  note?: string;
  /** 11개월 양식만, 선택: 용역 범위 "2. 기타 (   )" */
  serviceScopeOther?: string;
  /** 양식에 생년월일 칸이 생기면 주민번호 앞자리와 맞는지 봅니다(지금 양식에는 없음) */
  birthDate?: string;
};

export type ValidationContext = {
  kind: ContractKind;
  /** 오늘(KST) 'YYYY-MM-DD' */
  today: string;
  /** 연도 → 최저시급. 설정이 없으면 null */
  minimumWageForYear: (year: number) => number | null;
  /** 양식에 인쇄된 시급(장사꾼 양식은 10,320원) */
  printedHourlyWage: number;
  /** 직원 정보에 등록된 시급 */
  employeeHourlyWage: number | null;
  /**
   * 시작일을 시스템이 정한 경우(11개월 갱신 = 직전 만료일 다음 날).
   * 시작일 범위 검사(-30일~+60일)는 근로자의 오입력을 막으려는 것이므로 이때는 하지 않습니다.
   * 관리자가 만료 두 달 전에 갱신을 누르면 시작일이 60일 넘게 뒤라 서명이 막히기 때문입니다.
   */
  startDateFixed?: boolean;
  /** 직원 소속 사업장. 장사꾼 1주 계약은 토요일 시작이면 토요일 하루 계약(isSaturdayOnlyWeek) */
  workplace?: string | null;
};

export type Issue = {
  /** 문제가 있는 입력칸 이름(화면에서 칸 옆에 빨간 글씨로 표시) */
  field: keyof ContractInput | "hourlyWage";
  code: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  derived: {
    endDate: string | null;
    birthDate: string | null;
    /** 1주 양식: 1일 실근로(휴게 제외) 분 */
    dailyNetMinutes: number | null;
    breakMinutes: number | null;
    weeklyNetMinutes: number | null;
  };
};

export const MIN_AGE = 18;
export const MAX_WEEKLY_MINUTES = 52 * 60;
/** 시작일 오입력 방지: 오늘 기준 이만큼 이상 과거/미래면 차단 */
export const START_PAST_LIMIT_DAYS = 30;
export const START_FUTURE_LIMIT_DAYS = 60;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesOf(value: string | undefined): number | null {
  const m = TIME.exec(String(value || ""));

  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function formatWon(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

/** 필수 칸 목록. 양식마다 다릅니다(2026-10-14 확정). */
export function requiredFields(kind: ContractKind): (keyof ContractInput)[] {
  const common: (keyof ContractInput)[] = [
    "name",
    "residentNumber",
    "phone",
    "address",
    "startDate",
  ];

  return kind === "week" ? [...common, "workStart", "workEnd"] : common;
}

const FIELD_LABELS: Record<string, string> = {
  name: "성명",
  residentNumber: "주민등록번호",
  phone: "연락처",
  address: "주소",
  startDate: "계약 시작일",
  workStart: "시업 시각",
  workEnd: "종업 시각",
  breakStart: "휴게 시작",
  breakEnd: "휴게 끝",
};

export function validateContractInput(
  input: ContractInput,
  ctx: ValidationContext
): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const add = (field: Issue["field"], code: string, message: string) =>
    errors.push({ field, code, message });

  // 1. 빈칸
  for (const field of requiredFields(ctx.kind)) {
    if (!String(input[field] ?? "").trim()) {
      add(field, "blank", `${FIELD_LABELS[field] ?? field}을(를) 입력해주세요.`);
    }
  }

  // 8. 시작일
  const startOk = parseDateKey(input.startDate) !== null;

  if (String(input.startDate || "").trim() && !startOk) {
    add("startDate", "start_invalid", "계약 시작일이 올바른 날짜가 아닙니다.");
  }

  if (startOk && !ctx.startDateFixed) {
    const diff = daysBetween(ctx.today, input.startDate);

    if (diff <= -START_PAST_LIMIT_DAYS) {
      add("startDate", "start_too_old", `계약 시작일이 오늘보다 ${-diff}일 전입니다. ${START_PAST_LIMIT_DAYS}일 이상 지난 날짜는 쓸 수 없습니다.`);
    } else if (diff >= START_FUTURE_LIMIT_DAYS) {
      add("startDate", "start_too_far", `계약 시작일이 오늘보다 ${diff}일 뒤입니다. ${START_FUTURE_LIMIT_DAYS}일 이상 먼 날짜는 쓸 수 없습니다.`);
    }
  }

  const endDate = startOk ? calcContractEnd(ctx.kind, input.startDate, ctx.workplace) : null;

  // 2. 최저임금 — 계약서에 적히는 시급은 양식에 인쇄된 금액입니다.
  if (startOk) {
    const year = Number(input.startDate.slice(0, 4));
    const minimum = ctx.minimumWageForYear(year);

    if (minimum === null) {
      add("hourlyWage", "min_wage_missing", `${year}년 최저시급이 설정되어 있지 않습니다. 관리자에게 문의하세요.`);
    } else if (ctx.printedHourlyWage < minimum) {
      add("hourlyWage", "below_min_wage", `계약서의 시급 ${formatWon(ctx.printedHourlyWage)}이 ${year}년 최저시급 ${formatWon(minimum)}보다 적습니다. 관리자에게 문의하세요.`);
    }
  }

  if (ctx.employeeHourlyWage !== null && ctx.employeeHourlyWage !== ctx.printedHourlyWage) {
    add("hourlyWage", "wage_mismatch", `계약서에 인쇄된 시급(${formatWon(ctx.printedHourlyWage)})과 등록된 시급(${formatWon(ctx.employeeHourlyWage)})이 다릅니다. 관리자에게 문의하세요.`);
  }

  // 3. 주민등록번호
  let birthDate: string | null = null;

  if (String(input.residentNumber || "").trim()) {
    const rrn = checkResidentNumber(input.residentNumber, ctx.today);

    if (rrn.error) add("residentNumber", "rrn_invalid", rrn.error);
    if (rrn.warning) warnings.push({ field: "residentNumber", code: "rrn_checksum", message: rrn.warning });

    birthDate = rrn.birthDate;

    if (birthDate && input.birthDate && input.birthDate !== birthDate) {
      add("birthDate", "birth_mismatch", "생년월일이 주민등록번호 앞자리와 다릅니다.");
    }

    // 4. 만 18세 미만 (계약 시작일 기준)
    if (birthDate && startOk) {
      const age = ageOn(birthDate, input.startDate);

      if (age !== null && age < MIN_AGE) {
        add("residentNumber", "under_18", `만 ${MIN_AGE}세 미만은 별도 서류가 필요합니다. 관리자에게 문의하세요.`);
      }
    }
  }

  // 9. 휴대폰번호
  if (String(input.phone || "").trim()) {
    const digits = String(input.phone).replace(/[\s-]/g, "");

    if (!/^010\d{8}$/.test(digits)) {
      add("phone", "phone_invalid", "연락처는 010으로 시작하는 11자리 휴대폰번호여야 합니다.");
    }
  }

  // 5~7. 근무시간 — 1주 양식만(11개월 양식에는 근무시간 칸이 없습니다)
  let dailyNetMinutes: number | null = null;
  let breakMinutes: number | null = null;
  let weeklyNetMinutes: number | null = null;

  if (ctx.kind === "week") {
    const days = (input.workDays || []).filter((d) => (WORK_DAYS as readonly string[]).includes(d));

    if (days.length === 0) {
      add("workDays", "no_work_days", "근무 요일을 하나 이상 선택해주세요.");
    } else if (startOk && isSaturdayOnlyWeek(input.startDate, ctx.workplace) && (days.length !== 1 || days[0] !== "sat")) {
      add("workDays", "saturday_only", "토요일에 시작하는 계약은 토요일 하루 계약입니다. 근무 요일은 토요일만 선택해주세요.");
    }

    const start = minutesOf(input.workStart);
    const end = minutesOf(input.workEnd);

    if (input.workStart && start === null) add("workStart", "time_invalid", "시업 시각 형식이 올바르지 않습니다.");
    if (input.workEnd && end === null) add("workEnd", "time_invalid", "종업 시각 형식이 올바르지 않습니다.");

    if (start !== null && end !== null && end <= start) {
      add("workEnd", "end_before_start", "종업 시각은 시업 시각보다 늦어야 합니다.");
    }

    const bStart = minutesOf(input.breakStart);
    const bEnd = minutesOf(input.breakEnd);
    const hasBreakStart = String(input.breakStart || "").trim() !== "";
    const hasBreakEnd = String(input.breakEnd || "").trim() !== "";

    if (hasBreakStart !== hasBreakEnd) {
      add(hasBreakStart ? "breakEnd" : "breakStart", "blank", "휴게 시작과 끝을 함께 입력해주세요.");
    }

    if (hasBreakStart && bStart === null) add("breakStart", "time_invalid", "휴게 시작 시각 형식이 올바르지 않습니다.");
    if (hasBreakEnd && bEnd === null) add("breakEnd", "time_invalid", "휴게 끝 시각 형식이 올바르지 않습니다.");

    breakMinutes = 0;

    if (bStart !== null && bEnd !== null) {
      if (bEnd <= bStart) {
        add("breakEnd", "break_order", "휴게 끝은 휴게 시작보다 늦어야 합니다.");
      } else if (start !== null && end !== null && (bStart < start || bEnd > end)) {
        add("breakStart", "break_outside", "휴게시간은 근무시간 안에 있어야 합니다.");
      } else {
        breakMinutes = bEnd - bStart;
      }
    }

    if (start !== null && end !== null && end > start) {
      dailyNetMinutes = end - start - breakMinutes;

      // 6. 휴게시간 (근로기준법 제54조)
      if (dailyNetMinutes >= 8 * 60 && breakMinutes < 60) {
        add("breakStart", "break_short_8h", "하루 8시간 이상 근무하면 휴게시간이 1시간 이상이어야 합니다.");
      } else if (dailyNetMinutes >= 4 * 60 && breakMinutes < 30) {
        add("breakStart", "break_short_4h", "하루 4시간 이상 근무하면 휴게시간이 30분 이상이어야 합니다.");
      }

      // 7. 주 52시간
      weeklyNetMinutes = dailyNetMinutes * days.length;

      if (weeklyNetMinutes > MAX_WEEKLY_MINUTES) {
        add("workDays", "over_52h", `주 근무시간이 ${(weeklyNetMinutes / 60).toFixed(1).replace(/\.0$/, "")}시간입니다. 주 52시간을 넘을 수 없습니다.`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    derived: { endDate, birthDate, dailyNetMinutes, breakMinutes, weeklyNetMinutes },
  };
}

/** 계약서 "근로시간 ○시간" 칸에 쓸 값. 30분 단위가 아니면 소수 둘째 자리까지. */
export function formatNetHours(minutes: number) {
  const hours = minutes / 60;

  return Number.isInteger(hours)
    ? String(hours)
    : String(Math.round(hours * 100) / 100);
}
