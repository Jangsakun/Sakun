// 출근·퇴근 API 공용 서버 헬퍼.
//
// 규칙 자체는 app/lib/attendanceFlow.ts(화면과 공용)에 있고,
// 이 파일은 "그 날 기록 읽기 / 요청한 구간 해석" 처럼 DB 를 만지는 부분만 담당합니다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { toContractType, type SegmentType } from "./contractType";
import { defaultSegmentFor, type FlowRecord } from "./attendanceFlow";

export type DayRecord = FlowRecord & {
  id: number;
  hourly_wage_snapshot: number | null;
  piece_daily_wage_snapshot: number | null;
};

/** KST 기준 그 날(checkedAt 이 속한 날)의 시작·끝 */
export function getKstDayRange(checkedAt: string | Date) {
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(checkedAt));

  return {
    dateKey,
    startUtc: `${dateKey}T00:00:00+09:00`,
    endUtc: `${dateKey}T23:59:59.999+09:00`,
  };
}

/** 그 날 이 직원의 모든 기록(시급·도급 구간 모두). */
export async function loadDayRecords(
  supabase: SupabaseClient,
  employeeId: number,
  checkedAt: string
) {
  const { startUtc, endUtc } = getKstDayRange(checkedAt);

  const { data, error } = await supabase
    .from("attendance_records")
    .select(
      "id, record_type, segment_type, checked_at, hourly_wage_snapshot, piece_daily_wage_snapshot"
    )
    .eq("employee_id", employeeId)
    .gte("checked_at", startUtc)
    .lte("checked_at", endUtc)
    .order("checked_at", { ascending: true })
    .order("id", { ascending: true });

  return { records: (data || []) as DayRecord[], error };
}

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
