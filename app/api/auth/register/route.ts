import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, birthDate, phoneLast4 } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          success: false,
          message: "환경변수 없음",
          debug: {
            hasUrl: !!supabaseUrl,
            hasKey: !!supabaseAnonKey,
          },
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
          message: "Supabase insert 실패",
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