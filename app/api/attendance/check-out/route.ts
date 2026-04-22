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

function isCheckoutAllowedAtKst(date: Date) {
  const { hour, minute } = getKstDateParts(date);

  if (hour < 18) {
    return {
      allowed: true,
      message: "",
    };
  }

  const isAllowedWindow =
    (minute >= 0 && minute <= 10) || (minute >= 30 && minute <= 40);

  if (isAllowedWindow) {
    return {
      allowed: true,
      message: "",
    };
  }

  const nextAvailable = getNextCheckoutWindowLabel(hour, minute);

  return {
    allowed: false,
    message: `지금은 퇴근 가능한 시간이 아닙니다. 18시 이후에는 30분 단위 10분 동안만 퇴근할 수 있습니다. 다음 퇴근 가능 시간: ${nextAvailable}`,
  };
}

function getKstDayRangeFromIso(isoString: string) {
  const date = new Date(isoString);
  const { year, month, day } = getKstDateParts(date);

  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  const kstDateOnly = `${year}-${monthText}-${dayText}`;

  return {
    dateOnly: kstDateOnly,
    startUtc: `${kstDateOnly}T00:00:00+09:00`,
    endUtc: `${kstDateOnly}T23:59:59.999+09:00`,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, birthDate, phoneLast4, lat, lng, checkedAt } = body;

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

    const checkedDate = new Date(checkedAt);

    if (Number.isNaN(checkedDate.getTime())) {
      return NextResponse.json(
        { success: false, message: "checkedAt 값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const checkoutRule = isCheckoutAllowedAtKst(checkedDate);

    if (!checkoutRule.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: checkoutRule.message,
        },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { success: false, message: "환경변수 없음" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const companyLat = 35.85925533483926;
    const companyLng = 127.1046071646124;
    const allowedRadiusM = 150;

    const distance = getDistanceInMeters(lat, lng, companyLat, companyLng);

    if (distance > allowedRadiusM) {
      return NextResponse.json(
        {
          success: false,
          message: `회사 반경 밖입니다. 현재 거리: ${Math.round(distance)}m`,
        },
        { status: 400 }
      );
    }

    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("*")
      .eq("name", name)
      .eq("birth_date", birthDate)
      .eq("phone_last4", phoneLast4)
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (employeeError || !employee) {
      return NextResponse.json(
        { success: false, message: "직원 정보를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const { startUtc, endUtc } = getKstDayRangeFromIso(checkedAt);

    const { data: existingCheckOut, error: existingError } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("employee_id", employee.id)
      .eq("record_type", "check_out")
      .gte("checked_at", startUtc)
      .lte("checked_at", endUtc)
      .limit(1);

    if (existingError) {
      return NextResponse.json(
        { success: false, message: "기존 퇴근 기록 확인 실패" },
        { status: 500 }
      );
    }

    if (existingCheckOut && existingCheckOut.length > 0) {
      return NextResponse.json(
        { success: false, message: "오늘은 이미 퇴근 처리되었습니다." },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase
      .from("attendance_records")
      .insert([
        {
          employee_id: employee.id,
          record_type: "check_out",
          lat,
          lng,
          checked_at: checkedAt,
        },
      ]);

    if (insertError) {
      return NextResponse.json(
        {
          success: false,
          message: `퇴근 기록 저장 실패: ${insertError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `퇴근 기록 저장 성공 (회사와 거리 ${Math.round(distance)}m)`,
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