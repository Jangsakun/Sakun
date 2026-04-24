import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const date = (searchParams.get("date") || "").trim();

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

    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select("id, name, gender")
      .eq("is_active", true);

    if (empError) {
      return NextResponse.json(
        { success: false, message: empError.message },
        { status: 500 }
      );
    }

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

    const available: any[] = [];
    const unavailable: any[] = [];
    const notSubmitted: any[] = [];

    for (const emp of employees || []) {
      const schedule = schedules?.find((s) => s.name === emp.name);

      if (!schedule) {
        notSubmitted.push({
          id: emp.id,
          name: emp.name,
          gender: emp.gender,
        });
        continue;
      }

      const isAvailable = schedule.schedule?.some(
        (d: any) => d.fullDate === date && d.available === true
      );

      if (isAvailable) {
        available.push({
          id: emp.id,
          name: emp.name,
          gender: emp.gender,
        });
      } else {
        unavailable.push({
          id: emp.id,
          name: emp.name,
          gender: emp.gender,
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