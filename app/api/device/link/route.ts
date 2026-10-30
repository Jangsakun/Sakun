import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readDeviceLinkToken, relinkEmployeeDevice } from "@/app/lib/deviceLink";

/**
 * 1회용 연결표로 이 브라우저를 직원 기기로 연결합니다(2026-10-30).
 * 앱 안 브라우저(당근 등)에서 가입한 뒤 "출퇴근 화면 열기"로 기본 브라우저를 열면 여기로 옵니다.
 */
export async function POST(request: Request) {
  try {
    const { token, deviceId } = await request.json();
    const trimmedDeviceId = String(deviceId || "").trim();

    if (!token || !trimmedDeviceId) {
      return NextResponse.json({ success: false, message: "연결 정보가 없습니다." }, { status: 400 });
    }

    const payload = readDeviceLinkToken(String(token));

    if (!payload) {
      return NextResponse.json(
        { success: false, message: "연결 시간이 지났거나 잘못된 주소입니다. 가입 화면에서 다시 시도해주세요." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, message: "환경변수 없음" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: employee } = await supabase
      .from("employees")
      .select("id, name, phone, phone_last4, birth_date, workplace_name, employment_type, is_active")
      .eq("id", payload.e)
      .maybeSingle();

    if (!employee || employee.is_active === false) {
      return NextResponse.json({ success: false, message: "직원 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    // 같은 브라우저에서 다시 연 경우: 이미 연결돼 있으니 그대로 성공
    if (payload.d !== trimmedDeviceId) {
      // 1회용: 가입한 기기가 아직 이 직원에 연결돼 있을 때만 옮깁니다. 한 번 쓰면 연결이 새 기기로 바뀌어 다시 못 씁니다.
      const { data: original } = await supabase
        .from("employee_devices")
        .select("employee_id")
        .eq("employee_id", employee.id)
        .eq("device_id", payload.d)
        .maybeSingle();

      if (!original) {
        return NextResponse.json(
          { success: false, message: "이미 사용한 연결 주소입니다. 가입 화면에서 다시 시도해주세요." },
          { status: 400 }
        );
      }

      const relinkError = await relinkEmployeeDevice(supabase, employee.id, trimmedDeviceId);

      if (relinkError) {
        return NextResponse.json({ success: false, message: "기기 연결에 실패했습니다." }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      employee: {
        id: employee.id,
        name: employee.name,
        birthDate: employee.birth_date,
        phoneLast4: employee.phone_last4,
        workplaceName: employee.workplace_name,
        employmentType: employee.employment_type,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "기기 연결 오류" },
      { status: 500 }
    );
  }
}
