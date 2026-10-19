import { serviceClient } from "@/app/lib/contracts/server";

// 서버 전용. 출퇴근 실패 기록(attendance_failures).
//
// 출근·퇴근 API 를 withAttendanceFailureLog 로 감싸면, 실패 응답(success:false)이 나갈 때마다
// 이유를 남깁니다. 기존 출퇴근 로직은 그대로 두고 응답만 봅니다.
// 기록 저장이 실패해도 출퇴근 응답에는 영향이 없습니다. 좌표는 저장하지 않습니다(거리만).

type RecordType = "check_in" | "check_out";

export type FailureEntry = {
  recordType: RecordType;
  source: "server" | "client";
  reason: string;
  message?: string | null;
  httpStatus?: number | null;
  identity?: { name?: unknown; birthDate?: unknown; phoneLast4?: unknown };
  segment?: unknown;
  nearestWorkplace?: string | null;
  distance?: number | null;
  accuracy?: number | null;
  userAgent?: string | null;
};

const toInt = (v: unknown) => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : Math.round(n);
};

/** 화면 안내 문구 → 짧은 이유 코드(집계용) */
export function failureReason(message: string, httpStatus: number): string {
  if (message.includes("반경 밖")) return "out_of_radius";
  if (message.includes("GPS 정확도")) return "low_accuracy";
  if (message.includes("필수값")) return "missing_fields";
  if (message.includes("위치값")) return "bad_location";
  if (message.includes("직원")) return "employee_not_found";
  if (message.includes("이미")) return "already_recorded";
  if (message.includes("퇴근 가능")) return "checkout_time_blocked";
  if (message.includes("출근 기록이 없어")) return "no_check_in";
  if (message.includes("도급")) return "segment_rule";
  if (httpStatus >= 500) return "server_error";
  return "other";
}

export async function logAttendanceFailure(entry: FailureEntry) {
  try {
    const supabase = serviceClient();
    if (!supabase) return;

    const name = String(entry.identity?.name ?? "").trim().slice(0, 40);
    const birthDate = String(entry.identity?.birthDate ?? "").trim();
    const phoneLast4 = String(entry.identity?.phoneLast4 ?? "").trim();
    let employeeId: number | null = null;

    if (name && birthDate && phoneLast4) {
      const { data } = await supabase
        .from("employees")
        .select("id")
        .eq("name", name)
        .eq("birth_date", birthDate)
        .eq("phone_last4", phoneLast4)
        .order("id", { ascending: false })
        .limit(1);

      employeeId = (data?.[0]?.id as number | undefined) ?? null;
    }

    const segment = entry.segment === "hourly" || entry.segment === "piece" ? entry.segment : null;

    const { error } = await supabase.from("attendance_failures").insert({
      employee_id: employeeId,
      employee_name: name || null,
      record_type: entry.recordType,
      segment_type: segment,
      source: entry.source,
      http_status: entry.httpStatus ?? null,
      reason: entry.reason.slice(0, 40),
      message: entry.message ? String(entry.message).slice(0, 300) : null,
      nearest_workplace: entry.nearestWorkplace ?? null,
      distance_m: toInt(entry.distance),
      accuracy_m: toInt(entry.accuracy),
      user_agent: entry.userAgent ? entry.userAgent.slice(0, 300) : null,
    });

    if (error) console.error("[attendance-failure] 기록 실패:", error.code);
  } catch (error) {
    console.error("[attendance-failure]", error instanceof Error ? error.name : "unknown");
  }
}

/**
 * 출근·퇴근 API 감싸기. 응답이 실패면 기록합니다.
 * nearest: 요청 좌표 → 가장 가까운 사업장과 거리(각 API 의 사업장 목록을 그대로 씀)
 */
export async function withAttendanceFailureLog(
  request: Request,
  recordType: RecordType,
  nearest: (lat: number, lng: number) => { name: string; distance: number },
  handler: (request: Request) => Promise<Response>
): Promise<Response> {
  const body = ((await request.clone().json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const response = await handler(request);

  if (response.ok) return response;

  const json = (await response.clone().json().catch(() => null)) as { success?: boolean; message?: string } | null;

  if (json?.success === true) return response;

  const message = String(json?.message ?? "");
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const place = Number.isFinite(lat) && Number.isFinite(lng) && body.lat !== undefined ? nearest(lat, lng) : null;

  await logAttendanceFailure({
    recordType,
    source: "server",
    reason: failureReason(message, response.status),
    message,
    httpStatus: response.status,
    identity: { name: body.name, birthDate: body.birthDate, phoneLast4: body.phoneLast4 },
    segment: body.segment,
    nearestWorkplace: place?.name ?? null,
    distance: place?.distance ?? null,
    accuracy: body.accuracy as number | null,
    userAgent: request.headers.get("user-agent"),
  });

  return response;
}
