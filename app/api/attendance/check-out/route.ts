import { NextResponse } from "next/server";
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
  };
}

function toKstDateFromParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
) {
  const utcMillis = Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0);
  return new Date(utcMillis);
}

function formatTimeLabel(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getNextCheckoutWindowLabel(hour: number, minute: number) {
  let nextHour = hour;
  let nextMinute = 0;

  if (minute >= 11 && minute <= 29) {
    nextMinute = 30;
  } else if (minute >= 41) {
    nextHour += 1;
    nextMinute = 0;
  }

  return formatTimeLabel(nextHour, nextMinute);
}

function getEmployeeWorkplaceName(employee: any) {
  return String(
    employee?.workplace_name ||
      employee?.workplace ||
      employee?.workplace_label ||
      "장사꾼"
  ).trim();
}

function isHemozEarlyCheckoutWindow(date: Date) {
  const { hour, minute } = getKstDateParts(date);
  const totalMinutes = hour * 60 + minute;

  return totalMinutes >= 12 * 60 + 30 && totalMinutes <= 12 * 60 + 40;
}

function isCheckoutAllowedAtKst(date: Date, workplaceName: string) {
  const { hour, minute } = getKstDateParts(date);
  const totalMinutes = hour * 60 + minute;

  if (workplaceName === "헤모즈" && isHemozEarlyCheckoutWindow(date)) {
    return { allowed: true, message: "" };
  }

  if (totalMinutes < 12 * 60 + 30) {
    return {
      allowed: false,
      message: "12시 30분 이후부터 퇴근 가능합니다.",
    };
  }

  const ok =
    (minute >= 0 && minute <= 10) || (minute >= 30 && minute <= 40);

  if (ok) {
    return { allowed: true, message: "" };
  }

  return {
    allowed: false,
    message: `퇴근 가능 시간이 아닙니다. 다음 가능 시간: ${getNextCheckoutWindowLabel(
      hour,
      minute
    )}`,
  };
}

function normalizeCheckOutTime(checkedAt: string, workplaceName: string): Date {
  const originalDate = new Date(checkedAt);
  const { year, month, day, hour, minute } = getKstDateParts(originalDate);
  const totalMinutes = hour * 60 + minute;

  if (
    workplaceName === "헤모즈" &&
    totalMinutes >= 12 * 60 + 30 &&
    totalMinutes <= 12 * 60 + 40
  ) {
    return toKstDateFromParts(year, month, day, 12, 30);
  }

  if (minute <= 10) {
    return toKstDateFromParts(year, month, day, hour, 0);
  }

  if (minute <= 40) {
    return toKstDateFromParts(year, month, day, hour, 30);
  }

  return toKstDateFromParts(year, month, day, hour + 1, 0);
}

function getKstDayRangeFromIso(isoString: string) {
  const date = new Date(isoString);
  const { year, month, day } = getKstDateParts(date);

  const d = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;

  return {
    startUtc: `${d}T00:00:00+09:00`,
    endUtc: `${d}T23:59:59.999+09:00`,
  };
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
        { success: false, message: "위치값 오류" },
        { status: 400 }
      );
    }

    if (parsedAccuracy !== null && Number.isNaN(parsedAccuracy)) {
      return NextResponse.json(
        { success: false, message: "GPS 정확도 오류" },
        { status: 400 }
      );
    }

    const checkedDate = new Date(checkedAt);
    if (Number.isNaN(checkedDate.getTime())) {
      return NextResponse.json(
        { success: false, message: "시간값 오류" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const nearestWorkplace = getNearestWorkplaceDistance(parsedLat, parsedLng);
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

    let ok = false;

    if (distance <= MAX_DISTANCE) {
      ok = true;
    } else if (
      distance <= BUFFER_DISTANCE &&
      parsedAccuracy !== null &&
      parsedAccuracy <= MAX_ACCURACY
    ) {
      ok = true;
    }

    if (!ok) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsedAccuracy === null
              ? `회사 반경 밖 (${nearestWorkplace.name} 기준 ${Math.round(
                  distance
                )}m)`
              : `회사 반경 밖 (${nearestWorkplace.name} 기준 ${Math.round(
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
        { success: false, message: "직원 없음" },
        { status: 404 }
      );
    }

    const workplaceName = getEmployeeWorkplaceName(employee);

    const hourlyWage = Number(employee.hourly_wage || 0);
    const hourlyWageSnapshot = hourlyWage > 0 ? hourlyWage : 10320;

    const checkoutRule = isCheckoutAllowedAtKst(checkedDate, workplaceName);
    if (!checkoutRule.allowed) {
      return NextResponse.json(
        { success: false, message: checkoutRule.message },
        { status: 400 }
      );
    }

    const { startUtc, endUtc } = getKstDayRangeFromIso(checkedAt);

    const { data: existing } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("employee_id", employee.id)
      .eq("record_type", "check_out")
      .gte("checked_at", startUtc)
      .lte("checked_at", endUtc)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, message: "이미 퇴근됨" },
        { status: 400 }
      );
    }

    const normalizedCheckedAt = normalizeCheckOutTime(
      checkedAt,
      workplaceName
    ).toISOString();

    const payload: any = {
      employee_id: employee.id,
      record_type: "check_out",
      lat: parsedLat,
      lng: parsedLng,
      checked_at: normalizedCheckedAt,
      accuracy: parsedAccuracy,
      distance: Math.round(distance),
      hourly_wage_snapshot: hourlyWageSnapshot,
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
      message: `퇴근 완료 (${nearestWorkplace.name} 기준 ${Math.round(
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
        message: error instanceof Error ? error.message : "퇴근 API 에러",
      },
      { status: 500 }
    );
  }
}
