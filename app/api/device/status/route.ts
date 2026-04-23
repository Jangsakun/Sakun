import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { deviceId } = body;

    if (!deviceId) {
      return NextResponse.json(
        { success: false, message: "deviceId 없음" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from("employee_devices")
      .select(
        `
        employee_id,
        employees (
          id,
          name,
          birth_date,
          phone_last4
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
  },
});
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "서버 에러",
      },
      { status: 500 }
    );
  }
}