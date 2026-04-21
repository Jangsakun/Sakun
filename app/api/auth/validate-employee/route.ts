import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, birthDate, phoneLast4 } = body;

    if (!name || !birthDate || !phoneLast4) {
      return NextResponse.json(
        {
          success: false,
          exists: false,
          message: "이름, 생년월일, 휴대폰 뒤 4자리가 필요합니다.",
        },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          success: false,
          exists: false,
          message: "Supabase 환경변수가 없습니다.",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data, error } = await supabase
      .from("employees")
      .select("id, name")
      .eq("name", name)
      .eq("birth_date", birthDate)
      .eq("phone_last4", phoneLast4)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          exists: false,
          message: error.message,
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({
        success: true,
        exists: false,
        message: "삭제되었거나 존재하지 않는 직원입니다.",
      });
    }

    return NextResponse.json({
      success: true,
      exists: true,
      employee: data,
      message: "유효한 직원입니다.",
    });
  } catch (error) {
    console.error("validate employee error:", error);

    return NextResponse.json(
      {
        success: false,
        exists: false,
        message: "직원 검증 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}