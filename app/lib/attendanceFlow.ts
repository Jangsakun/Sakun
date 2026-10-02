// 하루 출퇴근 흐름 규칙 — 단일 기준.
//
// 근로자 화면(버튼 활성/비활성)과 출퇴근 API(저장 전 검사)가 모두 이 파일을 씁니다.
// 화면에서 숨기는 것만으로는 막히지 않으므로(버튼 연타, 오래 열어둔 화면, 직접 요청)
// 서버도 반드시 같은 규칙으로 다시 검사합니다.
// 서버 전용 의존성을 넣지 마세요(클라이언트 컴포넌트에서도 import 합니다).
//
// 허용되는 하루 흐름
//   시급(hourly) 직원 : 출근 → 퇴근                       (시급 구간만)
//   도급(piece)  직원 : 출근 → 퇴근                       (도급 구간만)
//   시급+도급(hybrid) : A) 출근 → 퇴근 → 도급 출근 → 도급 퇴근
//                       B) 도급 출근 → 도급 퇴근          (시급 없이 도급만 하는 날)
//   - 시급 근무 중(출근 후 퇴근 전)에는 도급 출근 불가
//   - 도급 기록이 하나라도 있는 날은 시급 출근 불가(도급 → 시급 순서 불가)
//   - 같은 구간 두 번째 출근 / 출근 없는 퇴근 불가
//   - 요일·공휴일로는 제한하지 않음(장사꾼은 토요일에도 시급 근무가 있음)

import { isCheckInType, isCheckOutType } from "./workTime";
import {
  toContractType,
  toSegmentType,
  type ContractType,
  type SegmentType,
} from "./contractType";

export type AttendanceAction = "check-in" | "check-out";

export type FlowRecord = {
  record_type?: string | null;
  segment_type?: string | null;
  checked_at: string;
};

export type DayFlowState = {
  hourlyIn: boolean;
  hourlyOut: boolean;
  pieceIn: boolean;
  pieceOut: boolean;
};

export function summarizeDayFlow(records: FlowRecord[]): DayFlowState {
  const has = (segment: SegmentType, test: (v: unknown) => boolean) =>
    records.some(
      (record) =>
        toSegmentType(record.segment_type) === segment &&
        test(record.record_type)
    );

  return {
    hourlyIn: has("hourly", isCheckInType),
    hourlyOut: has("hourly", isCheckOutType),
    pieceIn: has("piece", isCheckInType),
    pieceOut: has("piece", isCheckOutType),
  };
}

/** 이 직원이 이 구간을 쓸 수 있는지. 시급 직원은 시급만, 도급 직원은 도급만, 시급+도급은 둘 다. */
export function isSegmentAllowedFor(
  contractType: ContractType,
  segment: SegmentType
) {
  if (contractType === "hybrid") return true;
  return contractType === segment;
}

/** 구간을 지정하지 않은 요청(기존 [출근]/[퇴근] 버튼)이 어느 구간인지. */
export function defaultSegmentFor(contractType: ContractType): SegmentType {
  return contractType === "piece" ? "piece" : "hourly";
}

export type FlowCheck =
  | { allowed: true; confirmPieceOnly?: boolean }
  | { allowed: false; message: string };

/**
 * 지금 이 동작을 해도 되는지 판단합니다.
 *
 * confirmPieceOnly: 시급+도급 직원이 시급 출근 없이 도급 출근하는 경우.
 *                   화면에서 "오늘 시급 근무 없이 도급만 하시나요?" 확인 후 진행합니다.
 */
export function checkAttendanceAction(
  contractTypeValue: unknown,
  segment: SegmentType,
  action: AttendanceAction,
  records: FlowRecord[]
): FlowCheck {
  const contractType = toContractType(contractTypeValue);

  if (!isSegmentAllowedFor(contractType, segment)) {
    return {
      allowed: false,
      message:
        segment === "piece"
          ? "도급 출퇴근은 시급+도급 직원만 할 수 있습니다."
          : "도급 직원은 도급 출퇴근만 기록할 수 있습니다.",
    };
  }

  const state = summarizeDayFlow(records);
  const isHybrid = contractType === "hybrid";
  const pieceLabel = isHybrid ? "도급 " : "";

  if (segment === "hourly") {
    if (action === "check-in") {
      if (state.hourlyIn) {
        return {
          allowed: false,
          message: state.hourlyOut
            ? "오늘은 이미 퇴근 처리되었습니다."
            : "오늘은 이미 출근 처리되었습니다.",
        };
      }

      if (state.pieceIn || state.pieceOut) {
        return {
          allowed: false,
          message:
            "오늘은 도급 근무를 먼저 시작해서 시급 출근을 할 수 없습니다. (도급 → 시급 순서 불가)",
        };
      }

      return { allowed: true };
    }

    if (!state.hourlyIn) {
      return { allowed: false, message: "출근 기록이 없어 퇴근할 수 없습니다." };
    }

    if (state.hourlyOut) {
      return { allowed: false, message: "오늘은 이미 퇴근 처리되었습니다." };
    }

    return { allowed: true };
  }

  // 도급 구간
  if (action === "check-in") {
    if (state.pieceIn) {
      return {
        allowed: false,
        message: state.pieceOut
          ? `오늘은 이미 ${pieceLabel}퇴근 처리되었습니다.`
          : `오늘은 이미 ${pieceLabel}출근 처리되었습니다.`,
      };
    }

    if (state.hourlyIn && !state.hourlyOut) {
      return {
        allowed: false,
        message: "시급 근무 중에는 도급 출근을 할 수 없습니다. 먼저 퇴근해주세요.",
      };
    }

    return {
      allowed: true,
      confirmPieceOnly: isHybrid && !state.hourlyIn,
    };
  }

  if (!state.pieceIn) {
    return {
      allowed: false,
      message: `${pieceLabel}출근 기록이 없어 ${pieceLabel}퇴근할 수 없습니다.`,
    };
  }

  if (state.pieceOut) {
    return {
      allowed: false,
      message: `오늘은 이미 ${pieceLabel}퇴근 처리되었습니다.`,
    };
  }

  return { allowed: true };
}

export const PIECE_ONLY_CONFIRM_MESSAGE = "오늘 시급 근무 없이 도급만 하시나요?";
