import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, birthDate, phoneLast4 } = body;

    if (!name || !birthDate || !phoneLast4) {
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

    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const dateOnly = kstNow.toISOString().slice(0, 10);

    const startUtc = new Date(`${dateOnly}T00:00:00+09:00`).toISOString();
    const endUtc = new Date(`${dateOnly}T23:59:59.999+09:00`).toISOString();

    const { data: records, error: recordsError } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("employee_id", employee.id)
      .gte("checked_at", startUtc)
      .lte("checked_at", endUtc)
      .order("checked_at", { ascending: true });

    if (recordsError) {
      return NextResponse.json(
        { success: false, message: "오늘 기록 조회 실패" },
        { status: 500 }
      );
    }

    const checkIn = records.find((r) => r.record_type === "check_in");
    const checkOut = records.find((r) => r.record_type === "check_out");

    return NextResponse.json({
      success: true,
      today: {
        checkIn: checkIn ? checkIn.checked_at : null,
        checkOut: checkOut ? checkOut.checked_at : null,
        records,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "오늘 기록 API 에러",
      },
      { status: 500 }
    );
  }
}