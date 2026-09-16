// 은행제출용 다건이체 양식 (오빅스 기준).
//
// 양식 규칙
//   헤더 행 없음. 데이터가 1행부터 시작.
//   A열 은행명       공식 표기와 정확히 일치해야 함
//   B열 계좌번호     텍스트 서식 필수. 숫자로 저장되면 앞자리 0 이 잘려 이체 사고
//   C열 이체금액     정수만. 소수점이 있으면 은행 업로드가 통째로 실패
//   D열 받는분 통장표시  최대 10자
//   E열 내 통장 메모    최대 14자 (이번 요청에서는 비움)
//
// 금액은 여기서 계산하지 않습니다. payrollSummary 가 합산한 netPay 를 받아 씁니다.

import type { PayrollEmployeeSummary } from "./payrollSummary";

/** 은행이 받아주는 공식 표기. 이 목록에 없는 값은 업로드가 거부됩니다. */
export const OFFICIAL_BANK_NAMES = [
  "국민",
  "경남",
  "광주",
  "기업",
  "농협",
  "아이엠뱅크",
  "부산",
  "산업",
  "저축",
  "새마을금고",
  "수협",
  "신한",
  "신협",
  "씨티",
  "KEB하나",
  "우리",
  "우체국",
  "전북",
  "SC",
  "제주",
  "HSBC",
  "케이뱅크",
  "카카오뱅크",
  "토스뱅크",
] as const;

/**
 * DB 에 저장된 은행명 → 공식 표기.
 *
 * 공식 표기와 이미 같은 값은 넣지 않아도 통과합니다. 여기에는 다르게 적힌 것만 넣습니다.
 * 직원관리에서 사람이 직접 입력하는 값이라 "○○은행" 처럼 쓰는 경우까지 같이 받아둡니다.
 */
export const BANK_NAME_MAP: Record<string, string> = {
  // 실제 DB 에 있던 값
  하나: "KEB하나",

  // 흔히 같이 쓰는 표기
  하나은행: "KEB하나",
  KEB하나은행: "KEB하나",
  국민은행: "국민",
  농협은행: "농협",
  단위농협: "농협",
  신한은행: "신한",
  우리은행: "우리",
  기업은행: "기업",
  전북은행: "전북",
  부산은행: "부산",
  경남은행: "경남",
  광주은행: "광주",
  제주은행: "제주",
  산업은행: "산업",
  수협은행: "수협",
  씨티은행: "씨티",
  한국씨티은행: "씨티",
  SC제일은행: "SC",
  제일은행: "SC",
  대구: "아이엠뱅크",
  대구은행: "아이엠뱅크",
  iM뱅크: "아이엠뱅크",
  카카오: "카카오뱅크",
  토스: "토스뱅크",
  케이: "케이뱅크",
  새마을: "새마을금고",
  저축은행: "저축",

  // 증권사 계좌. 공식 표기 목록에는 없지만 사용자가 허용 결정함(2026-09-16).
  // 은행 업로드에서 거부되면 해당 직원은 수기 이체가 필요합니다.
  카카오페이증권: "카카오페이증권",
};

export const ROWS_PER_FILE = 50;
export const RECEIVER_MEMO_MAX = 10;
export const SENDER_MEMO_MAX = 14;

export type BankTransferRow = {
  bankName: string;
  accountNumber: string;
  amount: number;
  receiverMemo: string;
  senderMemo: string;
};

export type ExcludedEmployee = {
  employeeName: string;
  reason: string;
  detail?: string;
};

export type BankTransferBuildResult = {
  rows: BankTransferRow[];
  excluded: ExcludedEmployee[];
  /** 50건 단위로 나눈 묶음. 파일 하나당 하나. */
  chunks: BankTransferRow[][];
};

/** 공식 표기로 바꿉니다. 바꿀 수 없으면 null — 조용히 틀린 값을 넣지 않습니다. */
export function toOfficialBankName(rawBankName: unknown): string | null {
  const name = String(rawBankName ?? "").trim();

  if (!name || name === "-") return null;

  if ((OFFICIAL_BANK_NAMES as readonly string[]).includes(name)) {
    return name;
  }

  const mapped = BANK_NAME_MAP[name];

  if (mapped) return mapped;

  // 공백 차이만 있는 경우까지는 받아줍니다.
  const compact = name.replace(/\s+/g, "");

  if ((OFFICIAL_BANK_NAMES as readonly string[]).includes(compact)) {
    return compact;
  }

  return BANK_NAME_MAP[compact] ?? null;
}

/** 하이픈 등 구분자를 제거하고 숫자만 남깁니다. */
export function toDigitsOnly(value: unknown) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

/** 글자수 제한. 은행 양식이 초과분을 거부하므로 잘라서 넣습니다. */
export function truncate(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * 직원별 합산 결과를 은행 이체 행으로 바꿉니다.
 *
 * 제외 대상은 버리지 않고 excluded 로 돌려줍니다. 화면에서 반드시 보여줘야
 * 그 직원만 급여가 안 나가는 사고를 막을 수 있습니다.
 */
export function buildBankTransferRows({
  summaries,
  senderMemo = "",
}: {
  summaries: PayrollEmployeeSummary[];
  senderMemo?: string;
}): BankTransferBuildResult {
  const rows: BankTransferRow[] = [];
  const excluded: ExcludedEmployee[] = [];

  summaries.forEach((summary) => {
    const accountNumber = toDigitsOnly(summary.accountNumber);
    const rawBankName = String(summary.bankName ?? "").trim();
    const bankName = toOfficialBankName(rawBankName);

    if (!rawBankName || rawBankName === "-") {
      excluded.push({
        employeeName: summary.employeeName,
        reason: "은행명 없음",
      });
      return;
    }

    if (!accountNumber) {
      excluded.push({
        employeeName: summary.employeeName,
        reason: "계좌번호 없음",
      });
      return;
    }

    if (!bankName) {
      excluded.push({
        employeeName: summary.employeeName,
        reason: "은행명이 공식 표기에 없음",
        detail: rawBankName,
      });
      return;
    }

    // 원 단위 미만 반올림. 소수점이 남으면 은행 업로드가 실패합니다.
    const amount = Math.round(Number(summary.netPay) || 0);

    if (amount <= 0) {
      excluded.push({
        employeeName: summary.employeeName,
        reason: "이체금액 0원",
      });
      return;
    }

    rows.push({
      bankName,
      accountNumber,
      amount,
      receiverMemo: truncate(summary.employeeName, RECEIVER_MEMO_MAX),
      senderMemo: truncate(senderMemo, SENDER_MEMO_MAX),
    });
  });

  const chunks: BankTransferRow[][] = [];

  for (let index = 0; index < rows.length; index += ROWS_PER_FILE) {
    chunks.push(rows.slice(index, index + ROWS_PER_FILE));
  }

  return { rows, excluded, chunks };
}

/** 급여이체_YYYYMM_1.xlsx — 기간 시작월 기준. */
export function buildTransferFileName(startDate: string, index: number) {
  const yyyymm = String(startDate || "").slice(0, 7).replace("-", "");

  return `급여이체_${yyyymm}_${index + 1}.xlsx`;
}
