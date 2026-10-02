// 하루 급여(시급분 + 도급분) — 단일 기준.
//
// 관리자 급여 API / 관리자 출퇴근 기록 표 / 근로자 급여조회가 모두 이 파일을 씁니다.
// (은행 다건이체·급여대장·기간 합산은 관리자 급여 API 금액을 그대로 더하므로 자동 반영)
//
//   시급분: 시급 구간(segment_type=hourly) 기록만으로 app/lib/workTime.ts 규칙 그대로 계산
//   도급분: 도급 구간(segment_type=piece) 출근+퇴근이 모두 있으면 일급 스냅샷 전액
//          (근무시간 무관, 10분이어도 전액). 퇴근이 없으면 0원 + 누락 표시.
//   관리자 세전급여 직접지정이 있으면 그 날 "시급분만" 그 금액으로 대체.
//   도급 일급은 직접지정과 무관하게 항상 따로 계산해서 더합니다. (2026-10-02 결정 변경)
//     예: 지정 100,000 + 도급 일급 50,000 = 그 날 150,000
//
// 서버 전용 의존성을 넣지 마세요(관리자 화면 클라이언트 컴포넌트도 import 합니다).

import { toSegmentType } from "./contractType";
import {
  calcDayWork,
  calcHourlyPay,
  isCheckInType,
  isCheckOutType,
  toKstDateKey,
  type DayWorkResult,
} from "./workTime";

/**
 * 주휴수당 "주 15시간" 판정에 도급 구간 시간도 넣을지.
 * false(현재 결정): 시급 구간 시간만 셉니다. 주휴수당 금액도 시급분 기준입니다.
 * true 로 바꾸면 판정 시간에만 도급 구간의 실제 경과 시간이 더해집니다(금액 계산식은 그대로).
 */
export const WEEKLY_ALLOWANCE_INCLUDES_PIECE_MINUTES = false;

/** 시급 스냅샷이 전혀 없을 때 쓰는 기본 시급(기존 코드와 같은 값). */
export const DEFAULT_HOURLY_WAGE = 10320;

export type PayRecord = {
  id?: number | string;
  record_type?: string | null;
  segment_type?: string | null;
  checked_at: string;
  hourly_wage_snapshot?: number | string | null;
  piece_daily_wage_snapshot?: number | string | null;
};

// ─────────────────────────────────────────────────────────────
// 도급분 계산 — 규칙이 바뀌면(예: 연장·휴일근로 가산) 이 함수만 교체합니다.
// ─────────────────────────────────────────────────────────────

export type PieceDayResult<T extends PayRecord = PayRecord> = {
  /** 그 날 도급 구간 기록이 하나라도 있는지 */
  hasPiece: boolean;
  checkIn: T | null;
  checkOut: T | null;
  /** 도급분 금액(원). 출근+퇴근이 모두 있을 때만. */
  amount: number;
  /** 도급 출근은 있는데 퇴근이 없는 지난 날 → 미지급, 관리자 화면 누락 표시 */
  missingCheckOut: boolean;
  /** 오늘 도급 근무 중(퇴근 전) */
  inProgress: boolean;
  /** 도급 구간 실제 경과 시간(분). 지급액과 무관, 표시용. */
  elapsedMinutes: number | null;
  /** 기록에 일급 스냅샷이 없어 직원의 현재 일급으로 대신 계산했는지 */
  usedFallbackWage: boolean;
};

export function calcPieceDay<T extends PayRecord>(
  records: T[],
  options: { fallbackDailyWage?: number; now?: Date; dateKey?: string } = {}
): PieceDayResult<T> {
  const pieceRecords = [...records]
    .filter((record) => toSegmentType(record.segment_type) === "piece")
    .sort(
      (a, b) =>
        new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
    );

  const checkIn =
    pieceRecords.find((record) => isCheckInType(record.record_type)) || null;
  const checkOut =
    [...pieceRecords].reverse().find((record) => isCheckOutType(record.record_type)) ||
    null;

  const empty: PieceDayResult<T> = {
    hasPiece: pieceRecords.length > 0,
    checkIn,
    checkOut,
    amount: 0,
    missingCheckOut: false,
    inProgress: false,
    elapsedMinutes: null,
    usedFallbackWage: false,
  };

  if (!checkIn) {
    return empty;
  }

  if (!checkOut) {
    const dateKey = options.dateKey ?? toKstDateKey(checkIn.checked_at);
    const isToday = !!options.now && toKstDateKey(options.now) === dateKey;

    return { ...empty, inProgress: isToday, missingCheckOut: !isToday };
  }

  const snapshot =
    Number(checkIn.piece_daily_wage_snapshot || 0) ||
    Number(checkOut.piece_daily_wage_snapshot || 0);
  const fallback = Math.floor(Number(options.fallbackDailyWage) || 0);
  const amount = snapshot > 0 ? snapshot : fallback > 0 ? fallback : 0;

  return {
    ...empty,
    amount,
    elapsedMinutes: Math.max(
      0,
      Math.floor(
        (new Date(checkOut.checked_at).getTime() -
          new Date(checkIn.checked_at).getTime()) /
          60000
      )
    ),
    usedFallbackWage: !(snapshot > 0),
  };
}

// ─────────────────────────────────────────────────────────────
// 하루 합계
// ─────────────────────────────────────────────────────────────

/** 그 날 시급: 시급 구간 기록의 스냅샷 → 직원 현재 시급 → 기본값 (기존 getWageForDay 와 같은 순서) */
export function getHourlyWageForDay(
  hourlyRecords: PayRecord[],
  fallbackHourlyWage?: number | null
) {
  const snapshot = hourlyRecords
    .map((record) => Number(record.hourly_wage_snapshot || 0))
    .find((wage) => wage > 0);

  if (snapshot) return snapshot;

  const fallback = Number(fallbackHourlyWage || 0);

  return fallback > 0 ? fallback : DEFAULT_HOURLY_WAGE;
}

export type DayPayResult<T extends PayRecord = PayRecord> = {
  hourly: DayWorkResult<T> & { wage: number; pay: number; hasHourly: boolean };
  piece: PieceDayResult<T>;
  /** 자동 계산 금액 = 자동 시급분 + 도급분 */
  autoPay: number;
  /** 관리자 직접지정 금액(없으면 null). 있으면 그 날 시급분만 대체 */
  override: number | null;
  /** 실제 그 날 기본급 = 시급분(직접지정 ?? 자동) + 도급분 */
  basePay: number;
  /** 기본급 중 시급분 = 직접지정 금액 ?? 자동 시급분. 주휴수당 평균시급 계산에 씁니다. */
  hourlyPortion: number;
  /** 기본급 중 도급분(직접지정과 무관). 주휴수당에 들어가지 않습니다. */
  piecePortion: number;
  /** 주휴수당 15시간 판정에 쓰는 시간(분) — WEEKLY_ALLOWANCE_INCLUDES_PIECE_MINUTES 반영 */
  allowanceMinutes: number;
};

export function calcDayPay<T extends PayRecord>(
  dateKey: string,
  records: T[],
  options: {
    fallbackHourlyWage?: number | null;
    fallbackDailyWage?: number | null;
    override?: number | null;
    now?: Date;
  } = {}
): DayPayResult<T> {
  const hourlyRecords = records.filter(
    (record) => toSegmentType(record.segment_type) === "hourly"
  );

  const work = calcDayWork(dateKey, hourlyRecords, { now: options.now });
  const wage = getHourlyWageForDay(hourlyRecords, options.fallbackHourlyWage);
  const hourlyPay = calcHourlyPay(work.workedMinutes, wage);

  const piece = calcPieceDay(records, {
    fallbackDailyWage: options.fallbackDailyWage ?? 0,
    now: options.now,
    dateKey,
  });

  const autoPay = hourlyPay + piece.amount;
  const override =
    options.override === undefined || options.override === null
      ? null
      : Number(options.override);
  const hourlyPortion = override !== null ? override : hourlyPay;
  const basePay = hourlyPortion + piece.amount;

  const allowanceMinutes =
    work.workedMinutes +
    (WEEKLY_ALLOWANCE_INCLUDES_PIECE_MINUTES ? piece.elapsedMinutes ?? 0 : 0);

  return {
    hourly: { ...work, wage, pay: hourlyPay, hasHourly: hourlyRecords.length > 0 },
    piece,
    autoPay,
    override,
    basePay,
    hourlyPortion,
    piecePortion: piece.amount,
    allowanceMinutes,
  };
}
