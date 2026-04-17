import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { startDate, endDate } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { success: false, message: "환경변수 없음" },
        { status: 500 }
      );
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, message: "시작일과 종료일이 필요합니다." },
        { status: 400 }
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { success: false, message: "시작일은 종료일보다 늦을 수 없습니다." },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const startUtc = new Date(`${startDate}T00:00:00+09:00`).toISOString();
    const endUtc = new Date(`${endDate}T23:59:59.999+09:00`).toISOString();

    const { data, error } = await supabase
      .from("attendance_records")
      .select(`
        id,
        record_type,
        lat,
        lng,
        checked_at,
        created_at,
        employee_id,
        employees (
          id,
          name,
          birth_date,
          phone_last4
        )
      `)
      .gte("checked_at", startUtc)
      .lte("checked_at", endUtc)
      .order("checked_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, message: `조회 실패: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      records: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "관리자 조회 에러",
      },
      { status: 500 }
    );
  }
}