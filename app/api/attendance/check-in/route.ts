import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getDistanceInMeters } from "@/app/lib/geo";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, birthDate, phoneLast4, lat, lng, checkedAt } = body;

    console.log("=== check-in 요청 시작 ===");
    console.log("받은 body:", body);
    console.log("사용자 위치:", lat, lng);
    console.log("사용자 위치 타입:", typeof lat, typeof lng);
    console.log("checkedAt:", checkedAt);

    if (!name || !birthDate || !phoneLast4 || !lat || !lng || !checkedAt) {
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

    const dateOnly = checkedAt.slice(0, 10);
    console.log("dateOnly:", dateOnly);

    const { data: existingCheckIn, error: existingError } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("employee_id", employee.id)
      .eq("record_type", "check_in")
      .gte("checked_at", `${dateOnly}T00:00:00.000Z`)
      .lte("checked_at", `${dateOnly}T23:59:59.999Z`)
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
          checked_at: checkedAt,
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