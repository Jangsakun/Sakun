import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getDistanceInMeters } from "@/app/lib/geo";

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

function getKstDayRangeFromIso(isoString: string) {
  const date = new Date(isoString);
  const { year, month, day } = getKstDateParts(date);

  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  const kstDateOnly = `${year}-${monthText}-${dayText}`;

  return {
    startUtc: `${kstDateOnly}T00:00:00+09:00`,
    endUtc: `${kstDateOnly}T23:59:59.999+09:00`,
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

/**
 * 🔥 출근 시간 반올림 로직 (핵심)
 */
function normalizeCheckInTime(checkedAt: string): Date {
  const originalDate = new Date(checkedAt);
  const { year, month, day, hour, minute } = getKstDateParts(originalDate);

  const totalMinutes = hour * 60 + minute;

  // 9시
  if (totalMinutes >= 8 * 60 + 45 && totalMinutes <= 9 * 60 + 10) {
    return toKstDateFromParts(year, month, day, 9, 0, 0);
  }

  // 9시30
  if (totalMinutes >= 9 * 60 + 11 && totalMinutes <= 9 * 60 + 30) {
    return toKstDateFromParts(year, month, day, 9, 30, 0);
  }

  // 🔥 야간 출근 (17:50 ~ 18:10 → 18:00)
  if (totalMinutes >= 17 * 60 + 50 && totalMinutes <= 18 * 60 + 10) {
    return toKstDateFromParts(year, month, day, 18, 0, 0);
  }

  return originalDate;
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

    const companyLat = 35.85925533483926;
    const companyLng = 127.1046071646124;

    const distance = getDistanceInMeters(
      parsedLat,
      parsedLng,
      companyLat,
      companyLng
    );

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
              ? `회사 반경 밖입니다. (${Math.round(distance)}m)`
              : `회사 반경 밖입니다. (${Math.round(distance)}m / 정확도 ${Math.round(parsedAccuracy)}m)`,
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

    const normalizedCheckedAt = normalizeCheckInTime(checkedAt).toISOString();

    const { startUtc, endUtc } = getKstDayRangeFromIso(checkedAt);

    const { data: existing } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("employee_id", employee.id)
      .eq("record_type", "check_in")
      .gte("checked_at", startUtc)
      .lte("checked_at", endUtc)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, message: "오늘은 이미 출근 처리되었습니다." },
        { status: 400 }
      );
    }

    const payload: any = {
      employee_id: employee.id,
      record_type: "check_in",
      lat: parsedLat,
      lng: parsedLng,
      checked_at: normalizedCheckedAt,
      accuracy: parsedAccuracy,
      distance: Math.round(distance),
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
      message: `출근 완료 (${Math.round(distance)}m)`,
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