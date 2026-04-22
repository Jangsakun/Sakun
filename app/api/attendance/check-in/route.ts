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
    dateOnly: kstDateOnly,
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

function normalizeCheckInTime(checkedAt: string): Date {
  const originalDate = new Date(checkedAt);
  const { year, month, day, hour, minute } = getKstDateParts(originalDate);

  const totalMinutes = hour * 60 + minute;

  const nineStart = 8 * 60 + 45;     // 08:45
  const nineEnd = 9 * 60 + 10;       // 09:10
  const nineThirtyStart = 9 * 60 + 11; // 09:11
  const nineThirtyEnd = 9 * 60 + 30;   // 09:30

  if (totalMinutes >= nineStart && totalMinutes <= nineEnd) {
    return toKstDateFromParts(year, month, day, 9, 0, 0);
  }

  if (totalMinutes >= nineThirtyStart && totalMinutes <= nineThirtyEnd) {
    return toKstDateFromParts(year, month, day, 9, 30, 0);
  }

  return originalDate;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, birthDate, phoneLast4, lat, lng, checkedAt } = body;

    console.log("=== check-in 요청 시작 ===");
    console.log("받은 body:", body);
    console.log("사용자 위치:", lat, lng);
    console.log("사용자 위치 타입:", typeof lat, typeof lng);
    console.log("checkedAt:", checkedAt);

    if (
      !name ||
      !birthDate ||
      !phoneLast4 ||
      lat === undefined ||
      lng === undefined ||
      !checkedAt
    ) {
      console.log("필수값 누락:", {
        name,
        birthDate,
        phoneLast4,
        lat,
        lng,
        checkedAt,
      });

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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.log("환경변수 없음");
      return NextResponse.json(
        { success: false, message: "환경변수 없음" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const companyLat = 35.85925533483926;
    const companyLng = 127.1046071646124;
    const allowedRadiusM = 150;

    console.log("회사 위치:", companyLat, companyLng);
    console.log("허용 반경:", allowedRadiusM);

    const distance = getDistanceInMeters(lat, lng, companyLat, companyLng);

    console.log("계산된 거리:", distance);

    if (distance > allowedRadiusM) {
      console.log("반경 밖으로 판단됨:", Math.round(distance));

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

    console.log("조회된 employee:", employee);
    console.log("employeeError:", employeeError);

    if (employeeError || !employee) {
      return NextResponse.json(
        { success: false, message: "직원 정보를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const normalizedCheckedAt = normalizeCheckInTime(checkedAt);
    const normalizedCheckedAtIso = normalizedCheckedAt.toISOString();

    console.log("보정 전 checkedAt:", checkedAt);
    console.log("보정 후 checkedAt:", normalizedCheckedAtIso);

    const { startUtc, endUtc, dateOnly } = getKstDayRangeFromIso(checkedAt);
    console.log("KST dateOnly:", dateOnly);
    console.log("KST startUtc:", startUtc);
    console.log("KST endUtc:", endUtc);

    const { data: existingCheckIn, error: existingError } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("employee_id", employee.id)
      .eq("record_type", "check_in")
      .gte("checked_at", startUtc)
      .lte("checked_at", endUtc)
      .limit(1);

    console.log("existingCheckIn:", existingCheckIn);
    console.log("existingError:", existingError);

    if (existingError) {
      return NextResponse.json(
        { success: false, message: "기존 출근 기록 확인 실패" },
        { status: 500 }
      );
    }

    if (existingCheckIn && existingCheckIn.length > 0) {
      console.log("이미 출근 처리된 상태");
      return NextResponse.json(
        { success: false, message: "오늘은 이미 출근 처리되었습니다." },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase
      .from("attendance_records")
      .insert([
        {
          employee_id: employee.id,
          record_type: "check_in",
          lat,
          lng,
          checked_at: normalizedCheckedAtIso,
        },
      ]);

    console.log("insertError:", insertError);

    if (insertError) {
      return NextResponse.json(
        {
          success: false,
          message: `출근 기록 저장 실패: ${insertError.message}`,
        },
        { status: 500 }
      );
    }

    console.log("출근 기록 저장 성공");
    console.log("=== check-in 요청 끝 ===");

    return NextResponse.json({
      success: true,
      message: `출근 기록 저장 성공 (회사와 거리 ${Math.round(distance)}m)`,
      normalizedCheckedAt: normalizedCheckedAtIso,
    });
  } catch (error) {
    console.error("check-in API catch error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "출근 API 에러",
      },
      { status: 500 }
    );
  }
}