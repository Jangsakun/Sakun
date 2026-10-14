import { addDays, format, getISODay, isValid, parse } from "date-fns";
import { calcRenewalDates } from "@/app/lib/contractRenewal";

// 근로계약 기간 계산. 화면(미리보기)과 서버(서명 확정)가 같은 함수를 씁니다.

export type ContractKind = "week" | "month11";

const DATE_KEY = "yyyy-MM-dd";

/** 'YYYY-MM-DD' → Date(그 날 자정, 로컬). 없는 날짜·형식 오류는 null. */
export function parseDateKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;

  const date = parse(value, DATE_KEY, new Date(2000, 0, 1));

  if (!isValid(date) || format(date, DATE_KEY) !== value) return null;

  return date;
}

export function formatDateKey(date: Date): string {
  return format(date, DATE_KEY);
}

/** 두 날짜 사이 일수(b - a). 형식이 틀리면 NaN. */
export function daysBetween(a: string, b: string): number {
  const da = parseDateKey(a);
  const db = parseDateKey(b);

  if (!da || !db) return NaN;

  return Math.round(
    (Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) -
      Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) /
      86400000
  );
}

/**
 * 1주 계약 종료일.
 *   주의 기준: 월요일 시작 ~ 일요일 끝
 *   월~금 시작 → 그 주 금요일 (금요일 시작이면 당일)
 *   토·일 시작 → 다음 주 금요일
 */
export function calcWeekContractEnd(start: string): string | null {
  const date = parseDateKey(start);

  if (!date) return null;

  const isoDay = getISODay(date); // 1=월 … 7=일
  const daysToFriday = isoDay <= 5 ? 5 - isoDay : 12 - isoDay;

  return formatDateKey(addDays(date, daysToFriday));
}

/**
 * 11개월 계약 종료일. 기존 "11개월 갱신" 버튼과 똑같은 계산을 씁니다.
 * (갱신 버튼은 "기존 만료일"을 받으므로 시작일 전날을 넘깁니다.)
 */
export function calcElevenMonthContractEnd(start: string): string | null {
  const date = parseDateKey(start);

  if (!date) return null;

  return calcRenewalDates(formatDateKey(addDays(date, -1)))?.newEnd ?? null;
}

export function calcContractEnd(kind: ContractKind, start: string) {
  return kind === "week"
    ? calcWeekContractEnd(start)
    : calcElevenMonthContractEnd(start);
}

/** 고용구분 → 계약 종류. 관리자·근로자가 고르지 않고 자동으로 정합니다. */
export function contractKindForEmploymentType(
  employmentType: string | null | undefined
): ContractKind {
  return employmentType === "carrot" ? "week" : "month11";
}
