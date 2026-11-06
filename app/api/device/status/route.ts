import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 폰 저장값(localStorage)이 지워져도 다시 연결되도록 기기 ID를 서버 쿠키에 한 벌 더 둡니다(2026-11-06).
// 화면이 보낸 ID가 연결돼 있지 않으면 쿠키의 ID로 다시 찾고, 찾으면 그 ID를 돌려줘 화면이 저장값을 되살립니다.
const DEVICE_COOKIE = "sakun_device";
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

async function findDevice(supabase: SupabaseClient, deviceId: string) {
  return supabase
    .from("employee_devices")
    .select(
      `
        employee_id,
        employees (
          id,
          name,
          birth_date,
          phone_last4,
          workplace_name,
          employment_type
        )
      `
    )
    .eq("device_id", deviceId)
    .maybeSingle();
}

export async function POST(request: NextRequest) {
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

    let linkedDeviceId = String(deviceId);
    let { data, error } = await findDevice(supabase, linkedDeviceId);

    const cookieDeviceId = request.cookies.get(DEVICE_COOKIE)?.value;

    if (!error && !data && cookieDeviceId && cookieDeviceId !== linkedDeviceId) {
      ({ data, error } = await findDevice(supabase, cookieDeviceId));
      if (data) linkedDeviceId = cookieDeviceId;
    }

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

    const response = NextResponse.json({
      success: true,
      exists: true,
      // 쿠키로 되살린 경우 화면이 이 값으로 저장값을 바꿉니다.
      deviceId: linkedDeviceId,
      employee: {
        id: employeeData.id,
        name: employeeData.name,
        birthDate: employeeData.birth_date,
        phoneLast4: employeeData.phone_last4,

        // 근로자 화면에서 사용하는 근무지 정보
        workplaceName: employeeData.workplace_name || "장사꾼",

        // 혹시 다른 코드가 DB 형식으로 읽는 경우를 위한 값
        workplace_name: employeeData.workplace_name || "장사꾼",

        // 당근이면 근로자 화면에서 스케줄 제출을 숨깁니다(2026-10-30)
        employmentType: employeeData.employment_type || "fixed",
      },
    });

    response.cookies.set(DEVICE_COOKIE, linkedDeviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_COOKIE_MAX_AGE,
    });

    return response;
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