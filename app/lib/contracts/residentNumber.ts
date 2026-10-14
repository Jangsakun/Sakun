import { formatDateKey, parseDateKey } from "./period";

// 주민등록번호 / 외국인등록번호 검사.
// 원본 번호를 로그·에러 메시지에 넣지 않습니다. 메시지는 "무엇이 왜 틀렸는지"만 말합니다.

export type ResidentNumberCheck = {
  /** 하이픈·공백을 뺀 13자리. 형식이 틀리면 지금까지 숫자만 남긴 값. */
  digits: string;
  /** 서명을 막는 오류. 비어 있으면 통과. */
  error: string | null;
  /** 진행은 되지만 확인이 필요한 경고(검증번호 불일치). */
  warning: string | null;
  /** 번호로 계산한 생년월일. 형식 오류면 null. */
  birthDate: string | null;
  isForeigner: boolean;
};

const WEIGHTS = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];

export function normalizeResidentNumber(value: string) {
  return String(value || "").replace(/[\s-]/g, "");
}

/** 화면·관리자·로그용 표시. 예) 900101-1****** */
export function maskResidentNumber(value: string) {
  const digits = normalizeResidentNumber(value).replace(/\D/g, "");

  if (digits.length < 7) return "";

  return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`;
}

/** 표시용. 예) 900101-1234567 (계약서 PDF 에만 씁니다) */
export function formatResidentNumber(digits: string) {
  return digits.length === 13 ? `${digits.slice(0, 6)}-${digits.slice(6)}` : digits;
}

function centuryOf(seventh: number): number | null {
  if ([1, 2, 5, 6].includes(seventh)) return 1900;
  if ([3, 4, 7, 8].includes(seventh)) return 2000;
  return null;
}

/**
 * 검증번호(마지막 자리) 계산.
 * 2020년 10월 이후 발급·변경된 번호는 이 계산이 맞지 않으므로 경고로만 씁니다.
 * 외국인등록번호(7번째 자리 5~8)는 예전 방식대로 +2 보정합니다.
 */
function checksumMatches(digits: string, isForeigner: boolean) {
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  let check = (11 - (sum % 11)) % 10;

  if (isForeigner) check = (check + 2) % 10;

  return check === Number(digits[12]);
}

export function checkResidentNumber(value: string, today: string): ResidentNumberCheck {
  const raw = normalizeResidentNumber(value);
  const result: ResidentNumberCheck = {
    digits: raw.replace(/\D/g, ""),
    error: null,
    warning: null,
    birthDate: null,
    isForeigner: false,
  };

  if (!raw) {
    result.error = "주민등록번호를 입력해주세요.";
    return result;
  }

  if (!/^\d{13}$/.test(raw)) {
    result.error = "주민등록번호는 숫자 13자리여야 합니다.";
    return result;
  }

  const seventh = Number(raw[6]);
  const century = centuryOf(seventh);

  if (century === null) {
    result.error = "주민등록번호 뒤 첫 자리는 1~8 이어야 합니다.";
    return result;
  }

  result.isForeigner = seventh >= 5;

  const yy = Number(raw.slice(0, 2));
  const mm = raw.slice(2, 4);
  const dd = raw.slice(4, 6);
  const birthKey = `${century + yy}-${mm}-${dd}`;
  const birth = parseDateKey(birthKey);

  if (!birth) {
    result.error = "주민등록번호 앞 6자리가 실제 있는 날짜가 아닙니다.";
    return result;
  }

  result.birthDate = formatDateKey(birth);

  const todayDate = parseDateKey(today);

  if (todayDate && birth.getTime() > todayDate.getTime()) {
    result.error = "주민등록번호의 생년월일이 오늘보다 뒤입니다.";
    return result;
  }

  if (!checksumMatches(raw, result.isForeigner)) {
    result.warning =
      "주민등록번호를 다시 확인해 주세요. (2020년 10월 이후 발급·변경된 번호라면 맞는 번호일 수 있습니다)";
  }

  return result;
}

/** 기준일 기준 만 나이. */
export function ageOn(birthDate: string, onDate: string): number | null {
  const b = parseDateKey(birthDate);
  const d = parseDateKey(onDate);

  if (!b || !d) return null;

  let age = d.getFullYear() - b.getFullYear();
  const beforeBirthday =
    d.getMonth() < b.getMonth() ||
    (d.getMonth() === b.getMonth() && d.getDate() < b.getDate());

  if (beforeBirthday) age -= 1;

  return age;
}
