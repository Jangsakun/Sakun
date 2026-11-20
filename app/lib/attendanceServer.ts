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
import { contractGateReject } from "./contracts/attendanceGate";
import { serviceClient } from "./contracts/server";
import { isTimeRuleExempt } from "./timeRuleExempt";

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
  // 당근 근로자는 위치 없이 기록합니다(null). attendanceCarrot.ts
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  distance: number | null;
};

export type RecordAttendanceResult =
  | { ok: true; recordId: number; checkedAt: string }
  | { ok: false; status: number; message: string; code?: string };

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
  // 계약 기간이 끝났으면 기록하지 않습니다(2026-10-30). contracts/attendanceGate.ts
  const gate = await contractGateReject(input.employeeId, input.recordType);

  if (gate) return { ok: false, ...gate };

  // 시각 보정 제외 직원은 버튼을 누른 시각을 그대로 씁니다(timeRuleExempt.ts).
  const exempt = input.segment === "hourly" && isTimeRuleExempt(input.employeeId);
  const pressedAt = new Date();

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
    // 퇴근 가능 시간 제한(AT422)은 하루 흐름 검사를 통과한 뒤에만 나옵니다 → 제외 직원은 직접 저장.
    if (exempt && error.code === "AT422" && input.recordType === "check_out") {
      return insertExemptCheckOut(input, pressedAt);
    }

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

  await keepZeroHourlyWage(input.employeeId, Number(row.record_id), input.segment);

  if (exempt) {
    const kept = await keepPressedTime(Number(row.record_id), pressedAt);

    if (kept) return { ok: true, recordId: Number(row.record_id), checkedAt: pressedAt.toISOString() };
  }

  return {
    ok: true,
    recordId: Number(row.record_id),
    checkedAt: new Date(row.checked_at).toISOString(),
  };
}

/** 보정된 저장 시각을 실제 누른 시각으로 되돌립니다. 실패하면 보정 시각 그대로 둡니다. */
async function keepPressedTime(recordId: number, pressedAt: Date) {
  const supabase = serviceClient();

  if (!supabase) return false;

  const { error } = await supabase
    .from("attendance_records")
    .update({ checked_at: pressedAt.toISOString() })
    .eq("id", recordId);

  if (error) {
    console.error("[attendance] 보정 제외 시각 반영 실패:", error.message);
    return false;
  }

  return true;
}

/**
 * 퇴근 가능 시간이 아닐 때 제외 직원의 퇴근을 직접 저장합니다.
 * 하루 흐름 규칙은 DB 함수가 이미 통과시킨 상태이고, 중복은 DB 고유 제약이 막습니다.
 * 시급 스냅샷은 같은 날 출근 기록 값을 이어 씁니다(DB 함수와 같은 방식).
 */
async function insertExemptCheckOut(input: RecordAttendanceInput, pressedAt: Date): Promise<RecordAttendanceResult> {
  const supabase = serviceClient();

  if (!supabase) return { ok: false, status: 500, message: "기록 저장 실패: 서버 설정 오류" };

  const { data: checkIn } = await supabase
    .from("attendance_records")
    .select("hourly_wage_snapshot")
    .eq("employee_id", input.employeeId)
    .eq("segment_type", "hourly")
    .eq("record_type", "check_in")
    .lte("checked_at", pressedAt.toISOString())
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("attendance_records")
    .insert({
      employee_id: input.employeeId,
      record_type: "check_out",
      segment_type: "hourly",
      lat: input.lat,
      lng: input.lng,
      accuracy: input.accuracy,
      distance: input.distance,
      checked_at: pressedAt.toISOString(),
      hourly_wage_snapshot: checkIn?.hourly_wage_snapshot ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, status: 409, message: "오늘은 이미 처리된 기록이 있습니다. 화면을 새로고침해주세요." };
    }

    return { ok: false, status: 500, message: `기록 저장 실패: ${error?.message ?? "결과 없음"}` };
  }

  await keepZeroHourlyWage(input.employeeId, Number(data.id), "hourly");

  return { ok: true, recordId: Number(data.id), checkedAt: pressedAt.toISOString() };
}

/**
 * 직원 시급이 0원(월급제 등)이면 방금 저장한 시급 구간 기록도 0원으로 맞춥니다(2026-11-17).
 * DB 함수 record_attendance() 는 시급 0을 "없음"으로 보고 10320을 넣기 때문입니다
 * (이종원: 11/10~ 기록이 10320으로 저장돼 급여가 잘못 나감).
 * 실패해도 출퇴근 자체는 막지 않고 로그만 남깁니다.
 */
async function keepZeroHourlyWage(employeeId: number, recordId: number, segment: SegmentType) {
  if (segment !== "hourly") return;

  const supabase = serviceClient();

  if (!supabase) return;

  try {
    const { data: employee } = await supabase.from("employees").select("hourly_wage").eq("id", employeeId).maybeSingle();

    if (employee?.hourly_wage === null || employee?.hourly_wage === undefined || Number(employee.hourly_wage) !== 0) return;

    const { error } = await supabase.from("attendance_records").update({ hourly_wage_snapshot: 0 }).eq("id", recordId);

    if (error) console.error("[attendance] 시급 0원 반영 실패:", error.message);
  } catch (error) {
    console.error("[attendance] 시급 0원 반영 실패:", error);
  }
}
