import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recordAttendance, resolveRequestedSegment } from "./attendanceServer";
import { toContractType } from "./contractType";

// 서버 전용. 당근 근로자 출퇴근 — 위치 검사 없이 기록 (2026-10-27 사용자 결정).
//
// 출근·퇴근 API 맨 앞에서 부릅니다. 당근이 아니면 null 을 돌려주고, API 는 기존 흐름(반경·GPS 정확도 검사)을
// 그대로 탑니다. 당근 여부는 DB 직원 정보(employment_type)로 판단합니다.
// 위치는 저장하지 않습니다(null). 시각 보정·퇴근 가능 시간·하루 흐름 규칙·중복 방지는 DB 함수가 그대로 적용합니다.

export async function recordCarrotWithoutLocation(
  body: Record<string, unknown>,
  recordType: "check_in" | "check_out"
): Promise<Response | null> {
  const name = body.name;
  const birthDate = body.birthDate;
  const phoneLast4 = body.phoneLast4;

  // 필수값이 없으면 기존 흐름이 기존 안내로 거절합니다.
  if (!name || !birthDate || !phoneLast4) return null;

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  const { data: employee } = await supabase
    .from("employees")
    .select("*")
    .eq("name", name)
    .eq("birth_date", birthDate)
    .eq("phone_last4", phoneLast4)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!employee || employee.employment_type !== "carrot") return null;

  const requested = resolveRequestedSegment(body.segment, employee.contract_type);

  if ("error" in requested) {
    return NextResponse.json({ success: false, message: requested.error }, { status: 400 });
  }

  const segment = requested.segment;
  const saved = await recordAttendance(supabase, {
    employeeId: employee.id,
    recordType,
    segment,
    lat: null,
    lng: null,
    accuracy: null,
    distance: null,
  });

  if (!saved.ok) {
    return NextResponse.json({ success: false, message: saved.message }, { status: saved.status });
  }

  const piece = segment === "piece" && toContractType(employee.contract_type) === "hybrid" ? "도급 " : "";
  const action = recordType === "check_in" ? "출근" : "퇴근";

  return NextResponse.json({
    success: true,
    message: `${piece}${action} 완료 (${employee.workplace_name || "장사꾼"})`,
    distance: null,
    accuracy: null,
    normalizedCheckedAt: saved.checkedAt,
  });
}
