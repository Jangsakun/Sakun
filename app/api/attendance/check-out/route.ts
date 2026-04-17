import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getDistanceInMeters } from "@/app/lib/geo";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, birthDate, phoneLast4, lat, lng, checkedAt } = body;

    if (!name || !birthDate || !phoneLast4 || !lat || !lng || !checkedAt) {
      return NextResponse.json(
        { success: false, message: "필수값 누락" },
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

    const dateOnly = checkedAt.slice(0, 10);

    const { data: existingCheckOut, error: existingError } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("employee_id", employee.id)
      .eq("record_type", "check_out")
      .gte("checked_at", `${dateOnly}T00:00:00.000Z`)
      .lte("checked_at", `${dateOnly}T23:59:59.999Z`)
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