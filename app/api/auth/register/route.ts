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
          message: "이름, 생년월일, 휴대폰 끝 4자리를 모두 입력해주세요.",
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
          message: "환경변수 없음",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 1) 먼저 동일 인원 존재 여부 확인
    const { data: existingEmployee, error: findError } = await supabase
      .from("employees")
      .select("id, name, birth_date, phone_last4")
      .eq("name", name)
      .eq("birth_date", birthDate)
      .eq("phone_last4", phoneLast4)
      .maybeSingle();

    if (findError) {
      return NextResponse.json(
        {
          success: false,
          message: "기존 회원 확인 중 오류가 발생했습니다.",
          debug: {
            message: findError.message,
            details: findError.details,
            hint: findError.hint,
            code: findError.code,
          },
        },
        { status: 500 }
      );
    }

    // 2) 이미 있으면 새로 등록하지 않고 막기
    if (existingEmployee) {
      return NextResponse.json(
        {
          success: false,
          message: "이미 등록된 회원입니다.",
          employee: {
            id: existingEmployee.id,
            name: existingEmployee.name,
            birthDate: existingEmployee.birth_date,
            phoneLast4: existingEmployee.phone_last4,
          },
        },
        { status: 409 }
      );
    }

    // 3) 없으면 신규 등록
    const { data, error } = await supabase
      .from("employees")
      .insert([
        {
          name,
          birth_date: birthDate,
          phone_last4: phoneLast4,
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: "회원 등록 실패",
          debug: {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "등록 성공",
      employee: {
        id: data.id,
        name: data.name,
        birthDate: data.birth_date,
        phoneLast4: data.phone_last4,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "route 전체 에러",
        debug: {
          text: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : null,
        },
      },
      { status: 500 }
    );
  }
}