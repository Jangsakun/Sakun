import { NextResponse } from "next/server";
import { logAttendanceFailure } from "@/app/lib/attendanceFailureLog";

/**
 * 근로자 화면 → 서버까지 오지 못한 출퇴근 실패 기록(휴대폰 위치 기능 오류).
 *   geoErrorCode: 1 권한 거부 / 2 위치 확인 불가 / 3 시간 초과 (브라우저 GeolocationPositionError)
 * 원인 확인용 기록만 남기고 아무것도 바꾸지 않습니다.
 */
const GEO_REASON: Record<number, string> = { 1: "geo_permission_denied", 2: "geo_unavailable", 3: "geo_timeout" };

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const recordType = body.recordType === "check_out" ? "check_out" : body.recordType === "check_in" ? "check_in" : null;

  if (!recordType) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  await logAttendanceFailure({
    recordType,
    source: "client",
    reason: GEO_REASON[Number(body.geoErrorCode)] ?? "geo_error",
    message: typeof body.message === "string" ? body.message : null,
    identity: { name: body.name, birthDate: body.birthDate, phoneLast4: body.phoneLast4 },
    segment: body.segment,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ success: true });
}
