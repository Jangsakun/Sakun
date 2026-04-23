import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const date = (searchParams.get("date") || "").trim(); // ex: 2026-04-20

    if (!date) {
      return NextResponse.json(
        { success: false, message: "date가 필요합니다." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, message: "환경변수 없음" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ✅ 직원 전체 조회
    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select("id, name")
      .eq("is_active", true);

    if (empError) {
      return NextResponse.json(
        { success: false, message: empError.message },
        { status: 500 }
      );
    }

    // ✅ 해당 날짜 포함된 주차 스케줄 조회
    const { data: schedules, error: schError } = await supabase
      .from("weekly_schedules")
      .select("*")
      .lte("week_start_date", date)
      .gte("week_end_date", date);

    if (schError) {
      return NextResponse.json(
        { success: false, message: schError.message },
        { status: 500 }
      );
    }

    // 🔥 분류
    const available: any[] = [];
    const unavailable: any[] = [];
    const notSubmitted: any[] = [];

    for (const emp of employees || []) {
      const schedule = schedules?.find(
        (s) =>
          s.name === emp.name // 현재 구조 기준 (나중에 employee_id로 바꾸면 더 좋음)
      );

      // ❌ 아예 제출 안한 사람
      if (!schedule) {
        notSubmitted.push({
          id: emp.id,
          name: emp.name,
        });
        continue;
      }

      // 🔍 해당 날짜에 출근 가능 여부 확인
      const isAvailable = schedule.schedule?.some(
        (d: any) => d.fullDate === date && d.available === true
      );

      if (isAvailable) {
        available.push({
          id: emp.id,
          name: emp.name,
        });
      } else {
        unavailable.push({
          id: emp.id,
          name: emp.name,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        available,
        unavailable,
        notSubmitted,
        summary: {
          total: employees?.length || 0,
          available: available.length,
          unavailable: unavailable.length,
          notSubmitted: notSubmitted.length,
        },
      },
    });
  } catch (error) {
    console.error("admin schedule GET error:", error);

    return NextResponse.json(
      { success: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}