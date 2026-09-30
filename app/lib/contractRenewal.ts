import { addDays, addMonths, format, isValid, parse } from "date-fns";

// 근로계약 11개월 갱신 날짜 계산.
// 확인창(브라우저)과 실제 저장(서버)이 같은 함수를 써야 화면에 본 날짜와
// 저장되는 날짜가 어긋나지 않습니다.

export const RENEWAL_MONTHS = 11;

const DATE_KEY = "yyyy-MM-dd";

/** 'YYYY-MM-DD' 를 그 날 자정(로컬)으로 읽습니다. 형식이 틀리면 null. */
function parseDateKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = parse(value, DATE_KEY, new Date(2000, 0, 1));

  // 2026-02-30 같은 없는 날짜는 parse 가 다음 달로 넘기지 않고 Invalid 를 줍니다.
  if (!isValid(date) || format(date, DATE_KEY) !== value) return null;

  return date;
}

export type RenewalDates = {
  newStart: string;
  newEnd: string;
};

/**
 * 기존 만료일로 다음 계약기간을 계산합니다.
 *
 *   새 시작일 = 기존 만료일 + 1일
 *   새 만료일 = 새 시작일 + 11개월 - 1일
 *     예) 2026-10-01 시작 → 2027-08-31 만료
 *
 * 월말 보정: 11개월 뒤 달에 시작일과 같은 날이 없으면(예: 3/31 → 2월에는 31일이 없음)
 * 그 달 말일을 만료일로 합니다.
 *     예) 2026-03-31 시작 → 2027-02-28 만료
 *         2027-03-31 시작 → 2028-02-29 만료(윤년)
 * 민법 제160조(기간의 역에 의한 계산)와 같은 방식입니다.
 *
 * 형식이 틀리면 null 을 돌려줍니다.
 */
export function calcRenewalDates(previousEnd: string): RenewalDates | null {
  const end = parseDateKey(previousEnd);

  if (!end) return null;

  const newStart = addDays(end, 1);

  // date-fns 의 addMonths 는 없는 날짜를 그 달 말일로 맞춥니다(3/31 + 11개월 = 2/28).
  const sameDayLater = addMonths(newStart, RENEWAL_MONTHS);
  const clamped = sameDayLater.getDate() !== newStart.getDate();

  // 같은 날짜가 있으면 그 전날이 만료일, 없어서 말일로 맞춰졌으면 그 말일이 만료일.
  const newEnd = clamped ? sameDayLater : addDays(sameDayLater, -1);

  return {
    newStart: format(newStart, DATE_KEY),
    newEnd: format(newEnd, DATE_KEY),
  };
}

/** 확인창 문구. 화면과 테스트가 같은 문구를 쓰도록 한 곳에 둡니다. */
export function renewalConfirmText(previousEnd: string, dates: RenewalDates) {
  return `기존 만료일 ${previousEnd} → 새 계약 ${dates.newStart} ~ ${dates.newEnd}`;
}
