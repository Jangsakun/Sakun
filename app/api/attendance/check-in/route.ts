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

  const nineStart = 8 * 60 + 45; // 08:45
  const nineEnd = 9 * 60 + 10; // 09:10
  const nineThirtyStart = 9 * 60 + 11; // 09:11
  const nineThirtyEnd = 9 * 60 + 30; // 09:30

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
    const { name, birthDate, phoneLast4, lat, lng, checkedAt, accuracy } = body;

    console.log("=== check-in 요청 시작 ===");
    console.log("받은 body:", body);
    console.log("사용자 위치:", lat, lng);
    console.log("사용자 위치 타입:", typeof lat, typeof lng);
    console.log("checkedAt:", checkedAt);
    console.log("accuracy:", accuracy);

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
        accuracy,
      });

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

    // 기본 허용 반경
    const allowedRadiusM = 150;

    // GPS 오차를 조금 감안한 예외 허용 반경
    const bufferRadiusM = 200;

    // accuracy 기준
    const maxAllowedAccuracyM = 80;
    const hardBlockAccuracyM = 120;

    console.log("회사 위치:", companyLat, companyLng);
    console.log("허용 반경:", allowedRadiusM);
    console.log("버퍼 반경:", bufferRadiusM);
    console.log("정확도 통과 기준:", maxAllowedAccuracyM);
    console.log("정확도 강제 차단 기준:", hardBlockAccuracyM);

    const distance = getDistanceInMeters(
      parsedLat,
      parsedLng,
      companyLat,
      companyLng
    );

    console.log("계산된 거리:", distance);

    if (parsedAccuracy !== null && parsedAccuracy > hardBlockAccuracyM) {
      console.log("GPS 정확도 너무 낮음:", parsedAccuracy);

      return NextResponse.json(
        {
          success: false,
          message:
            "GPS 정확도가 낮습니다. 건물 밖이나 창가에서 다시 시도해주세요.",
        },
        { status: 400 }
      );
    }

    let isAllowed = false;

    if (distance <= allowedRadiusM) {
      isAllowed = true;
      console.log("기본 반경 통과");
    } else if (
      distance <= bufferRadiusM &&
      parsedAccuracy !== null &&
      parsedAccuracy <= maxAllowedAccuracyM
    ) {
      isAllowed = true;
      console.log("버퍼 반경 + 정확도 조건으로 통과");
    }

    if (!isAllowed) {
      console.log("반경 밖으로 판단됨:", {
        distance: Math.round(distance),
        accuracy: parsedAccuracy,
      });

      return NextResponse.json(
        {
          success: false,
          message:
            parsedAccuracy === null
              ? `회사 반경 밖입니다. 현재 거리: ${Math.round(distance)}m`
              : `회사 반경 밖입니다. 현재 거리: ${Math.round(distance)}m / GPS 정확도: ${Math.round(parsedAccuracy)}m`,
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

    const insertPayload: Record<string, unknown> = {
      employee_id: employee.id,
      record_type: "check_in",
      lat: parsedLat,
      lng: parsedLng,
      checked_at: normalizedCheckedAtIso,
    };

    // attendance_records 테이블에 accuracy / distance 컬럼이 있으면 같이 저장됨
    // 아직 컬럼이 없으면 아래 2줄은 주석 처리하고 먼저 배포해도 됨
    insertPayload.accuracy = parsedAccuracy;
    insertPayload.distance = Math.round(distance);

    const { error: insertError } = await supabase
      .from("attendance_records")
      .insert([insertPayload]);

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
      message:
        parsedAccuracy === null
          ? `출근 기록 저장 성공 (회사와 거리 ${Math.round(distance)}m)`
          : `출근 기록 저장 성공 (회사와 거리 ${Math.round(distance)}m / GPS 정확도 ${Math.round(parsedAccuracy)}m)`,
      normalizedCheckedAt: normalizedCheckedAtIso,
      distance: Math.round(distance),
      accuracy: parsedAccuracy,
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