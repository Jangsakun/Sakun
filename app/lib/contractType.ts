// 근로형태(시급 / 도급 / 시급+도급) 와 출퇴근 기록의 구간 종류.
//
// 왜 공용 파일인가
//   같은 규칙을 출퇴근 기록 화면 / 관리자 급여 / 근로자 급여 세 곳이 씁니다.
//   (은행제출용 다건이체가 관리자 급여 금액을 그대로 쓰므로
//    한 곳이라도 어긋나면 실제 송금액이 틀어집니다)
//
// 근로형태
//   시급(hourly)     : 근무시간 × 시급 + 주휴수당.
//   도급(piece)      : 출퇴근은 찍되 근무시간과 무관하게 하루 고정 일급. 주휴수당 없음.
//   시급+도급(hybrid): 같은 날 시급 구간 뒤에 도급 구간이 이어질 수 있음.
//                     도급만 하러 오는 날도 있음.
//   관리자가 그 날 세전급여를 직접 지정하면 시급분만 그 금액으로 대체하고, 도급 일급은 따로 더합니다.
//
// 구간 종류(attendance_records.segment_type)
//   hourly : 시급 구간.  piece : 도급 구간.
//   기존 기록은 전부 hourly 입니다.

export type ContractType = "hourly" | "piece" | "hybrid";

export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  hourly: "시급",
  piece: "도급",
  hybrid: "시급+도급",
};

export type SegmentType = "hourly" | "piece";

export const SEGMENT_TYPE_LABEL: Record<SegmentType, string> = {
  hourly: "시급",
  piece: "도급",
};

type ContractFields = {
  contract_type?: string | null;
  daily_wage?: number | string | null;
} | null | undefined;

/** 값이 없거나 모르는 값이면 시급으로 봅니다. */
export function toContractType(value: unknown): ContractType {
  if (value === "piece" || value === "hybrid") return value;
  return "hourly";
}

/** 값이 없거나 모르는 값이면 시급 구간으로 봅니다(기존 기록 호환). */
export function toSegmentType(value: unknown): SegmentType {
  return value === "piece" ? "piece" : "hourly";
}

/** 도급 전용 직원인지. (시급+도급은 false) */
export function isPieceContract(employee: ContractFields) {
  return toContractType(employee?.contract_type) === "piece";
}

/** 시급+도급 직원인지. */
export function isHybridContract(employee: ContractFields) {
  return toContractType(employee?.contract_type) === "hybrid";
}

/** 도급 일급을 쓰는 근로형태인지(도급 / 시급+도급). 일급 입력이 필요한 직원. */
export function usesDailyWage(employee: ContractFields) {
  return toContractType(employee?.contract_type) !== "hourly";
}

/**
 * 직원의 현재 도급 일급. 도급/시급+도급이 아니거나 값이 없으면 0.
 *
 * ⚠️ 이미 생긴 도급 기록의 급여는 이 값이 아니라 기록에 저장된
 *    piece_daily_wage_snapshot 으로 계산해야 합니다(일급을 나중에 바꿔도 과거 불변).
 */
export function getDailyWage(employee: ContractFields) {
  if (!usesDailyWage(employee)) return 0;

  const wage = Math.floor(Number(employee?.daily_wage) || 0);

  return wage > 0 ? wage : 0;
}
