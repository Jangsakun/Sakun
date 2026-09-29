// 계약형태(시급 / 도급).
//
// 왜 공용 파일인가
//   같은 규칙을 출퇴근 기록 화면 / 관리자 급여 / 근로자 급여 세 곳이 씁니다.
//   (은행제출용 다건이체가 관리자 급여 금액을 그대로 쓰므로
//    한 곳이라도 어긋나면 실제 송금액이 틀어집니다)
//
// 규칙
//   시급(hourly): 근무시간 × 시급 + 주휴수당. 기존과 동일.
//   도급(piece) : 출근 기록이 있는 날마다 일당(daily_wage). 퇴근 기록 불필요. 주휴수당 없음.
//   관리자가 그 날 세전급여를 직접 지정했다면 계약형태보다 그 금액이 우선합니다.

export type ContractType = "hourly" | "piece";

export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  hourly: "시급",
  piece: "도급",
};

type ContractFields = {
  contract_type?: string | null;
  daily_wage?: number | string | null;
} | null | undefined;

/** 값이 없거나 모르는 값이면 시급으로 봅니다. */
export function toContractType(value: unknown): ContractType {
  return value === "piece" ? "piece" : "hourly";
}

export function isPieceContract(employee: ContractFields) {
  return toContractType(employee?.contract_type) === "piece";
}

/** 도급 직원의 하루 일당. 도급이 아니거나 값이 없으면 0. */
export function getDailyWage(employee: ContractFields) {
  if (!isPieceContract(employee)) return 0;

  const wage = Math.floor(Number(employee?.daily_wage) || 0);

  return wage > 0 ? wage : 0;
}
