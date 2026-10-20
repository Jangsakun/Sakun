import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function generateReconnectCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let i = 0; i < length; i += 1) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }

  return result;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const employeeId = Number(body?.employeeId);

    if (!employeeId || Number.isNaN(employeeId)) {
      return NextResponse.json(
        {
          success: false,
          message: "employeeId가 올바르지 않습니다.",
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
          message: "환경변수가 없습니다.",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id, name, is_active")
      .eq("id", employeeId)
      .single();

    if (employeeError || !employee) {
      return NextResponse.json(
        {
          success: false,
          message: "직원을 찾을 수 없습니다.",
        },
        { status: 404 }
      );
    }

    if (employee.is_active === false) {
      return NextResponse.json(
        {
          success: false,
          message: "비활성 직원은 재연결 코드를 발급할 수 없습니다.",
        },
        { status: 400 }
      );
    }

    const reconnectCode = generateReconnectCode(6);
    // 유효시간 없음(2026-10-20 사용자 결정, 이전 10분). 만료 시각 칸은 "발급된 코드가 살아 있음" 표시와
    // 등록 쪽 만료 검사에 그대로 쓰이므로 먼 미래로 둡니다. 1회 사용 후 삭제·재발급 시 덮어쓰기는 그대로.
    const expiresAtDate = new Date("9999-12-31T23:59:59Z");
    const expiresAt = expiresAtDate.toISOString();

    const { error: updateError } = await supabase
      .from("employees")
      .update({
        reconnect_code: reconnectCode,
        reconnect_expires_at: expiresAt,
      })
      .eq("id", employeeId);

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          message: updateError.message || "재연결 코드 저장 실패",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      reconnectCode,
      expiresAt,
      message: `${employee.name} 직원의 재연결 코드가 발급되었습니다.`,
    });
  } catch (error) {
    console.error("reconnect issue error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "재연결 코드 발급 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}