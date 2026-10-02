import { NextResponse } from "next/server";
import { checkAttendanceAction } from "@/app/lib/attendanceFlow";
import { loadDayRecords, resolveRequestedSegment } from "@/app/lib/attendanceServer";
import { getDailyWage, toContractType } from "@/app/lib/contractType";
import { createClient } from "@supabase/supabase-js";
import { getDistanceInMeters } from "@/app/lib/geo";

const WORKPLACES = [
  {
    name: "장사꾼",
    lat: 35.85925533483926,
    lng: 127.1046071646124,
  },
  {
    name: "헤모즈",
    lat: 35.8107177466899,
    lng: 127.094791615869,
  },
  {
    name: "깨소금",
    lat: 35.8066759247072,
    lng: 127.121648527169,
  },
  {
    name: "로엔티크",
    lat: 35.8826859288948,
    lng: 127.033338413219,
  },
];

function getKstDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(date);

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value || "00";

  return {
    year: Number(getPart("year")),
    month: Number(getPart("month")),
    day: Number(getPart("day")),
    hour: Number(getPart("hour")),
    minute: Number(getPart("minute")),
    second: Number(getPart("second")),
  };
}

function toKstDateFromParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
) {
  const utcMillis = Date.UTC(year, month - 1, day, hour - 9, minute, second, 0);
  return new Date(utcMillis);
}

function normalizeCheckInTime(
  checkedAt: string,
  workplaceName?: string | null
): Date {
  const originalDate = new Date(checkedAt);
  const { year, month, day, hour, minute } = getKstDateParts(originalDate);

  const totalMinutes = hour * 60 + minute;
  const workplace = String(workplaceName || "장사꾼").trim();

  // 깨소금 전용 출근시간 보정
  //
  // 08:00 이전       -> 08:00
  // 매시 :15 ~ :30  -> 해당 시각 :30
  // 매시 :45 ~ :59  -> 다음 정각
  // 그 외 시간       -> 실제 출근시간 그대로
  if (workplace === "깨소금") {
    if (totalMinutes < 8 * 60) {
      return toKstDateFromParts(year, month, day, 8, 0, 0);
    }

    if (minute >= 15 && minute <= 30) {
      return toKstDateFromParts(year, month, day, hour, 30, 0);
    }

    if (minute >= 45) {
      return toKstDateFromParts(year, month, day, hour + 1, 0, 0);
    }

    return originalDate;
  }

  // 헤모즈 조기 출근 보정
  if (
    workplace === "헤모즈" &&
    totalMinutes >= 6 * 60 + 45 &&
    totalMinutes <= 7 * 60 + 10
  ) {
    return toKstDateFromParts(year, month, day, 7, 0, 0);
  }

  // 기존 장사꾼 / 헤모즈 출근 보정
  if (totalMinutes >= 8 * 60 + 45 && totalMinutes <= 9 * 60 + 10) {
    return toKstDateFromParts(year, month, day, 9, 0, 0);
  }

  if (totalMinutes >= 9 * 60 + 11 && totalMinutes <= 9 * 60 + 30) {
    return toKstDateFromParts(year, month, day, 9, 30, 0);
  }

  if (totalMinutes >= 17 * 60 + 50 && totalMinutes <= 18 * 60 + 10) {
    return toKstDateFromParts(year, month, day, 18, 0, 0);
  }

  return originalDate;
}

function getNearestWorkplaceDistance(parsedLat: number, parsedLng: number) {
  const distances = WORKPLACES.map((workplace) => {
    const distance = getDistanceInMeters(
      parsedLat,
      parsedLng,
      workplace.lat,
      workplace.lng
    );

    return {
      ...workplace,
      distance,
    };
  });

  return distances.reduce((nearest, current) => {
    return current.distance < nearest.distance ? current : nearest;
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, birthDate, phoneLast4, lat, lng, checkedAt, accuracy } = body;

    if (
      !name ||
      !birthDate ||
      !phoneLast4 ||
      lat === undefined ||
      lng === undefined ||
      !checkedAt
    ) {
      return NextResponse.json(
        { success: false, message: "필수값 누락" },
        { status: 400 }
      );
    }

    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    const parsedAccuracy =
      accuracy === undefined || accuracy === null || accuracy === ""
        ? null
        : Number(accuracy);

    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      return NextResponse.json(
        { success: false, message: "위치값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (parsedAccuracy !== null && Number.isNaN(parsedAccuracy)) {
      return NextResponse.json(
        { success: false, message: "GPS 정확도값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const checkedDate = new Date(checkedAt);
    if (Number.isNaN(checkedDate.getTime())) {
      return NextResponse.json(
        { success: false, message: "checkedAt 값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const nearestWorkplace = getNearestWorkplaceDistance(
      parsedLat,
      parsedLng
    );
    const distance = nearestWorkplace.distance;

    const MAX_DISTANCE = 150;
    const BUFFER_DISTANCE = 200;
    const MAX_ACCURACY = 80;
    const BLOCK_ACCURACY = 120;

    if (parsedAccuracy !== null && parsedAccuracy > BLOCK_ACCURACY) {
      return NextResponse.json(
        {
          success: false,
          message: "GPS 정확도가 낮습니다. 다시 시도해주세요.",
        },
        { status: 400 }
      );
    }

    let isAllowed = false;

    if (distance <= MAX_DISTANCE) {
      isAllowed = true;
    } else if (
      distance <= BUFFER_DISTANCE &&
      parsedAccuracy !== null &&
      parsedAccuracy <= MAX_ACCURACY
    ) {
      isAllowed = true;
    }

    if (!isAllowed) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsedAccuracy === null
              ? `회사 반경 밖입니다. (${nearestWorkplace.name} 기준 ${Math.round(
                  distance
                )}m)`
              : `회사 반경 밖입니다. (${nearestWorkplace.name} 기준 ${Math.round(
                  distance
                )}m / 정확도 ${Math.round(parsedAccuracy)}m)`,
        },
        { status: 400 }
      );
    }

    const { data: employee } = await supabase
      .from("employees")
      .select("*")
      .eq("name", name)
      .eq("birth_date", birthDate)
      .eq("phone_last4", phoneLast4)
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (!employee) {
      return NextResponse.json(
        { success: false, message: "직원 정보를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const employeeWorkplace = String(
      employee.workplace_name ||
        employee.workplace ||
        employee.workplace_label ||
        "장사꾼"
    ).trim();

    // 시급 구간 / 도급 구간 중 어느 출근인지. 값이 없으면 직원 근로형태의 기본 구간.
    const requested = resolveRequestedSegment(body.segment, employee.contract_type);
    if ("error" in requested) {
      return NextResponse.json(
        { success: false, message: requested.error },
        { status: 400 }
      );
    }
    const segment = requested.segment;

    const { records: dayRecords, error: dayError } = await loadDayRecords(
      supabase,
      employee.id,
      checkedAt
    );

    if (dayError) {
      return NextResponse.json(
        { success: false, message: `오늘 기록 조회 실패: ${dayError.message}` },
        { status: 500 }
      );
    }

    // 화면과 같은 규칙으로 다시 검사합니다.
    // (시급+도급이 아닌 직원의 도급 출근, 시급 근무 중 도급 출근, 도급 후 시급 출근, 두 번째 출근)
    const flow = checkAttendanceAction(
      employee.contract_type,
      segment,
      "check-in",
      dayRecords
    );
    if (!flow.allowed) {
      return NextResponse.json(
        { success: false, message: flow.message },
        { status: 409 }
      );
    }

    // 도급 출근은 시각을 보정하지 않습니다(보정하면 시급 퇴근보다 앞설 수 있음).
    const normalizedCheckedAt =
      segment === "hourly"
        ? normalizeCheckInTime(checkedAt, employeeWorkplace).toISOString()
        : checkedDate.toISOString();

    const hourlyWage = Number(employee.hourly_wage || 0);
    const hourlyWageSnapshot = hourlyWage > 0 ? hourlyWage : 10320;

    // 도급 기록에는 그 날 기준 일급을 저장합니다. 나중에 일급을 바꿔도 과거 급여는 그대로입니다.
    // 일급이 설정돼 있지 않으면 비워 둡니다(관리자 화면에서 확인).
    const dailyWage = getDailyWage(employee);

    const payload: any = {
      employee_id: employee.id,
      record_type: "check_in",
      segment_type: segment,
      lat: parsedLat,
      lng: parsedLng,
      checked_at: normalizedCheckedAt,
      accuracy: parsedAccuracy,
      distance: Math.round(distance),
      hourly_wage_snapshot: hourlyWageSnapshot,
      piece_daily_wage_snapshot:
        segment === "piece" && dailyWage > 0 ? dailyWage : null,
    };

    const { error } = await supabase
      .from("attendance_records")
      .insert([payload]);

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${segment === "piece" && toContractType(employee.contract_type) === "hybrid" ? "도급 " : ""}출근 완료 (${nearestWorkplace.name} 기준 ${Math.round(
        distance
      )}m)`,
      distance: Math.round(distance),
      accuracy: parsedAccuracy,
      normalizedCheckedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "출근 API 에러",
      },
      { status: 500 }
    );
  }
}