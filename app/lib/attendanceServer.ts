// 출근·퇴근 API 공용 서버 헬퍼.
//
// 저장은 DB 함수 record_attendance() 하나로 합니다
// (supabase/migrations/20261003110000_record_attendance_function.sql).
//   - 시각: 요청이 보낸 값이 아니라 DB 시각(now())
//   - 시급 구간: 기존 시각 보정 규칙 + 퇴근 가능 시간 제한 (DB 시각 기준)
//   - 도급 구간: 보정·제한 없음
//   - 직원별 잠금 안에서 하루 흐름 규칙 검사 → 버튼 연타·동시 요청에도 1건만 저장
// 하루 흐름 규칙은 app/lib/attendanceFlow.ts(화면 버튼)와 같아야 합니다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { toContractType, type SegmentType } from "./contractType";
import { defaultSegmentFor } from "./attendanceFlow";

/**
 * 요청 본문의 segment 값을 해석합니다.
 * 값이 없으면(기존 [출근]/[퇴근] 버튼, 구버전 화면) 직원 근로형태의 기본 구간입니다.
 *   시급·시급+도급 → hourly,  도급 → piece
 */
export function resolveRequestedSegment(
  value: unknown,
  employeeContractType: unknown
): { segment: SegmentType } | { error: string } {
  if (value === undefined || value === null || value === "") {
    return { segment: defaultSegmentFor(toContractType(employeeContractType)) };
  }

  if (value === "hourly" || value === "piece") {
    return { segment: value };
  }

  return { error: "구간 종류 값이 올바르지 않습니다." };
}

type RecordAttendanceInput = {
  employeeId: number;
  recordType: "check_in" | "check_out";
  segment: SegmentType;
  lat: number;
  lng: number;
  accuracy: number | null;
  distance: number;
};

export type RecordAttendanceResult =
  | { ok: true; recordId: number; checkedAt: string }
  | { ok: false; status: number; message: string };

/** DB 함수가 돌려주는 거절 코드 → HTTP 상태 */
const REJECT_STATUS: Record<string, number> = {
  AT400: 400,
  AT404: 404,
  AT409: 409,
  AT422: 400,
};

export async function recordAttendance(
  supabase: SupabaseClient,
  input: RecordAttendanceInput
): Promise<RecordAttendanceResult> {
  const { data, error } = await supabase.rpc("record_attendance", {
    p_employee_id: input.employeeId,
    p_record_type: input.recordType,
    p_segment_type: input.segment,
    p_lat: input.lat,
    p_lng: input.lng,
    p_accuracy: input.accuracy,
    p_distance: input.distance,
  });

  if (error) {
    const status = REJECT_STATUS[error.code || ""];

    if (status) {
      return { ok: false, status, message: error.message };
    }

    return {
      ok: false,
      status: 500,
      message: `기록 저장 실패: ${error.message}`,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row?.record_id) {
    return { ok: false, status: 500, message: "기록 저장 결과를 받지 못했습니다." };
  }

  return {
    ok: true,
    recordId: Number(row.record_id),
    checkedAt: new Date(row.checked_at).toISOString(),
  };
}
