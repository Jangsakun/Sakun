// 근무시간 · 시급분 계산 — 단일 기준.
//
// 이전에는 같은 계산을 4곳이 서로 다르게 구현하고 있었습니다.
//   - 관리자 출퇴근 기록 표 : 첫 출근 → 마지막 퇴근,  점심 <= / >=, 금액 반올림
//   - 관리자 급여 관리      : 출퇴근을 순서대로 짝지어 합산(중복 퇴근 무시), 금액 버림
//   - 근로자 급여 조회      : 첫 출근 → 마지막 퇴근,  점심 <  / >,
//                            퇴근 없는 지난 날도 "지금 시각"까지 계산
//   - 근로자 홈 오늘 근무시간: 화면용 시각 보정 후 첫 출근 → 마지막 퇴근
// 그래서 같은 날의 근무시간·금액이 화면마다 달랐습니다
// (실측: 김다정 2026-05-30 / 최두나 2026-07-13 60분 차이, 하윤원 2026-08-20 60분 차이).
//
// 이 파일이 유일한 기준입니다. 위 4곳 모두 여기를 호출합니다.
// 서버 라우트와 클라이언트 컴포넌트에서 함께 쓰이므로 서버 전용 의존성을 넣지 마세요.
//
// ── 규칙은 날짜에 따라 둘 중 하나입니다 ─────────────────────────────
//   WORK_TIME_RULE_START_DATE 이전 날짜 → "legacy"
//     이미 지급이 끝난 과거 급여를 1원도 바꾸지 않기 위해, 그동안 실제 지급액을
//     만들던 관리자 급여 API 방식을 그대로 재현합니다.
//   WORK_TIME_RULE_START_DATE 이후 날짜 → "v2"
//     ① 첫 출근 → 마지막 퇴근  ② 점심 경계 포함(<=, >=)  ③ 금액 버림
//     ④ 퇴근 누락된 날은 0원 + 누락 표시(오늘만 "퇴근 전"으로 현재 시각까지 추정)

/**
 * 새 규칙(v2) 적용 시작일 (KST, 이 날짜 포함).
 *
 * ⚠️ 배포 전 사용자 확인 필요. 이 날짜 이전 기록은 절대 새 규칙으로 계산하지 않습니다.
 */
export const WORK_TIME_RULE_START_DATE = "2026-10-05";

export type WorkTimeRule = "legacy" | "v2";

/** 점심시간 (KST). 이 구간을 온전히 포함하면 60분을 차감합니다. */
export const LUNCH_START_HOUR = 12;
export const LUNCH_START_MINUTE = 30;
export const LUNCH_END_HOUR = 13;
export const LUNCH_END_MINUTE = 30;
export const LUNCH_DEDUCT_MINUTES = 60;

export type AttendanceLike = {
  record_type?: string | null;
  checked_at: string;
};

export function isCheckInType(value: unknown) {
  const normalized = String(value || "").toLowerCase().trim();

  return (
    normalized === "check-in" ||
    normalized === "check_in" ||
    normalized === "checkin" ||
    normalized === "in" ||
    normalized === "출근"
  );
}

export function isCheckOutType(value: unknown) {
  const normalized = String(value || "").toLowerCase().trim();

  return (
    normalized === "check-out" ||
    normalized === "check_out" ||
    normalized === "checkout" ||
    normalized === "out" ||
    normalized === "퇴근"
  );
}

export function createKstDateTime(
  dateKey: string,
  hour: number,
  minute: number
) {
  return new Date(
    `${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0"
    )}:00+09:00`
  );
}

/** Date → KST 'YYYY-MM-DD' */
export function toKstDateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getWorkTimeRule(dateKey: string): WorkTimeRule {
  return dateKey >= WORK_TIME_RULE_START_DATE ? "v2" : "legacy";
}

function sortByCheckedAt<T extends AttendanceLike>(records: T[]) {
  // Array.prototype.sort 는 안정 정렬이라 같은 시각이면 들어온 순서(id 순)를 유지합니다.
  return [...records].sort(
    (a, b) => new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
  );
}

/** 화면 표시용: 그 날의 첫 출근 / 마지막 퇴근 기록. */
export function selectDayBoundary<T extends AttendanceLike>(records: T[]) {
  const sorted = sortByCheckedAt(records);

  const checkIn =
    sorted.find((record) => isCheckInType(record.record_type)) || null;

  const checkOutCandidates = sorted.filter((record) =>
    isCheckOutType(record.record_type)
  );

  const checkOut =
    checkOutCandidates.length > 0
      ? checkOutCandidates[checkOutCandidates.length - 1]
      : null;

  return { sorted, checkIn, checkOut };
}

/** 점심시간을 온전히 포함하는지. 경계값 포함(<=, >=) — 13:30 정각 퇴근도 차감합니다. */
export function includesFullLunch(
  dateKey: string,
  checkInAt: Date,
  checkOutAt: Date
) {
  const lunchStart = createKstDateTime(
    dateKey,
    LUNCH_START_HOUR,
    LUNCH_START_MINUTE
  );
  const lunchEnd = createKstDateTime(dateKey, LUNCH_END_HOUR, LUNCH_END_MINUTE);

  return (
    checkInAt.getTime() <= lunchStart.getTime() &&
    checkOutAt.getTime() >= lunchEnd.getTime()
  );
}

/**
 * legacy 규칙: 기존 관리자 급여 API(pairSessions + calculateDailyWorkedMinutes)를
 * 그대로 옮긴 것입니다. 한 글자라도 바꾸면 과거 지급액이 달라지므로 수정하지 마세요.
 *
 * 출근을 만나면 열고, 다음 퇴근에서 닫아 한 구간으로 짝짓습니다.
 * 열린 출근이 있는 동안 들어온 두 번째 출근, 열린 출근 없이 들어온 퇴근은 버립니다.
 */
function calcLegacyWorkedMinutes<T extends AttendanceLike>(
  dateKey: string,
  sorted: T[]
) {
  const sessions: { checkIn: T; checkOut: T }[] = [];
  let openCheckIn: T | null = null;

  for (const item of sorted) {
    if (isCheckInType(item.record_type)) {
      if (!openCheckIn) {
        openCheckIn = item;
      }
      continue;
    }

    if (isCheckOutType(item.record_type)) {
      if (openCheckIn) {
        const inTime = new Date(openCheckIn.checked_at).getTime();
        const outTime = new Date(item.checked_at).getTime();

        if (outTime > inTime) {
          sessions.push({ checkIn: openCheckIn, checkOut: item });
        }

        openCheckIn = null;
      }
    }
  }

  let totalMinutes = 0;

  for (const session of sessions) {
    const diffMs =
      new Date(session.checkOut.checked_at).getTime() -
      new Date(session.checkIn.checked_at).getTime();

    if (diffMs > 0) {
      totalMinutes += Math.floor(diffMs / 1000 / 60);
    }
  }

  if (sessions.length === 0) {
    return { workedMinutes: 0, lunchDeducted: false };
  }

  const lunchDeducted = includesFullLunch(
    dateKey,
    new Date(sessions[0].checkIn.checked_at),
    new Date(sessions[sessions.length - 1].checkOut.checked_at)
  );

  if (lunchDeducted) {
    totalMinutes = Math.max(0, totalMinutes - LUNCH_DEDUCT_MINUTES);
  }

  return { workedMinutes: totalMinutes, lunchDeducted };
}

/** v2 규칙: 첫 출근 → 마지막 퇴근, 점심 경계 포함. */
function calcSpanMinutes(dateKey: string, checkInAt: Date, checkOutAt: Date) {
  const diffMs = checkOutAt.getTime() - checkInAt.getTime();

  if (diffMs <= 0) {
    return { workedMinutes: 0, lunchDeducted: false };
  }

  let workedMinutes = Math.floor(diffMs / 1000 / 60);
  const lunchDeducted = includesFullLunch(dateKey, checkInAt, checkOutAt);

  if (lunchDeducted) {
    workedMinutes = Math.max(0, workedMinutes - LUNCH_DEDUCT_MINUTES);
  }

  return { workedMinutes, lunchDeducted };
}

export type DayWorkResult<T extends AttendanceLike = AttendanceLike> = {
  rule: WorkTimeRule;
  /** 급여 계산에 쓰는 근무시간(분). 계산할 수 없는 날은 0. */
  workedMinutes: number;
  lunchDeducted: boolean;
  /** 화면 표시용 첫 출근 / 마지막 퇴근 기록 */
  checkIn: T | null;
  checkOut: T | null;
  /** 출근은 있는데 퇴근이 없는 지난 날(또는 오늘이지만 추정을 요청하지 않은 경우). 0원. */
  missingCheckOut: boolean;
  /** 오늘 퇴근 전이라 현재 시각까지로 추정한 값. 확정 금액이 아닙니다. */
  estimated: boolean;
};

/**
 * 하루 근무시간을 계산합니다. DB 에 저장된 checked_at 을 그대로 씁니다
 * (출근 시각 보정은 기록 시점에 이미 적용되어 저장됩니다. 관리자 수기 수정값이 최종값).
 *
 * @param options.now 주면, dateKey 가 now 의 KST 날짜(=오늘)이고 퇴근 전일 때
 *                    현재 시각까지로 추정합니다(estimated=true). 지난 날에는 쓰지 않습니다.
 * @param options.rule 비교 검증용. 날짜와 무관하게 이 규칙으로 계산합니다. 화면·급여에서는 쓰지 마세요.
 */
export function calcDayWork<T extends AttendanceLike>(
  dateKey: string,
  records: T[],
  options: { now?: Date; rule?: WorkTimeRule } = {}
): DayWorkResult<T> {
  const rule = options.rule ?? getWorkTimeRule(dateKey);
  const { sorted, checkIn, checkOut } = selectDayBoundary(records);

  const base = {
    rule,
    checkIn,
    checkOut,
    missingCheckOut: false,
    estimated: false,
  };

  if (!checkIn) {
    return { ...base, workedMinutes: 0, lunchDeducted: false };
  }

  if (!checkOut) {
    const isToday = options.now && toKstDateKey(options.now) === dateKey;

    if (isToday) {
      return {
        ...base,
        estimated: true,
        ...calcSpanMinutes(dateKey, new Date(checkIn.checked_at), options.now!),
      };
    }

    return {
      ...base,
      missingCheckOut: true,
      workedMinutes: 0,
      lunchDeducted: false,
    };
  }

  const minutes =
    rule === "legacy"
      ? calcLegacyWorkedMinutes(dateKey, sorted)
      : calcSpanMinutes(
          dateKey,
          new Date(checkIn.checked_at),
          new Date(checkOut.checked_at)
        );

  return { ...base, ...minutes };
}

/** 시급분 금액. 원 단위 버림. (기존 관리자 급여 API 와 같은 식 — 부동소수 결과까지 동일) */
export function calcHourlyPay(workedMinutes: number, hourlyWage: number) {
  return Math.floor((workedMinutes / 60) * hourlyWage);
}
