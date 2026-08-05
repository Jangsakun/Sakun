import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { deviceId } = body;

    if (!deviceId) {
      return NextResponse.json(
        {
          success: false,
          message: "deviceId 없음",
        },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          message: "Supabase 환경변수 없음",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase
      .from("employee_devices")
      .select(
        `
        employee_id,
        employees (
          id,
          name,
          birth_date,
          phone_last4,
          workplace_name
        )
      `
      )
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: "조회 실패",
          debug: error.message,
        },
        { status: 500 }
      );
    }

    const employeeData = Array.isArray(data?.employees)
      ? data.employees[0]
      : data?.employees;

    if (!data || !employeeData) {
      return NextResponse.json({
        success: true,
        exists: false,
      });
    }

    return NextResponse.json({
      success: true,
      exists: true,
      employee: {
        id: employeeData.id,
        name: employeeData.name,
        birthDate: employeeData.birth_date,
        phoneLast4: employeeData.phone_last4,

        // 근로자 화면에서 사용하는 근무지 정보
        workplaceName: employeeData.workplace_name || "장사꾼",

        // 혹시 다른 코드가 DB 형식으로 읽는 경우를 위한 값
        workplace_name: employeeData.workplace_name || "장사꾼",
      },
    });
  } catch (error) {
    console.error("device status API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "서버 에러",
        debug: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}