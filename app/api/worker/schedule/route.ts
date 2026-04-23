import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ScheduleItem = {
  dayLabel?: string;
  dateLabel?: string;
  fullDate?: string;
  available?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      name,
      birthDate,
      phoneLast4,
      weekStartDate,
      weekEndDate,
      schedule,
    } = body;

    if (!name || !birthDate || !phoneLast4 || !weekStartDate || !weekEndDate) {
      return NextResponse.json(
        {
          success: false,
          message: "필수값이 누락되었습니다.",
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(schedule) || schedule.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "제출할 스케줄이 없습니다.",
        },
        { status: 400 }
      );
    }

    const cleanedSchedule = (schedule as ScheduleItem[])
      .filter((item) => item && item.available === true)
      .map((item) => ({
        dayLabel: String(item.dayLabel || "").trim(),
        dateLabel: String(item.dateLabel || "").trim(),
        fullDate: String(item.fullDate || "").trim(),
        available: true,
      }))
      .filter(
        (item) => item.dayLabel && item.dateLabel && item.fullDate
      );

    if (cleanedSchedule.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "출근 가능 요일이 없습니다.",
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

    const { data: existingSchedule, error: existingError } = await supabase
      .from("weekly_schedules")
      .select("id")
      .eq("name", name)
      .eq("birth_date", birthDate)
      .eq("phone_last4", phoneLast4)
      .eq("week_start_date", weekStartDate)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          success: false,
          message: existingError.message,
        },
        { status: 500 }
      );
    }

    if (existingSchedule) {
      return NextResponse.json(
        {
          success: false,
          message: "이미 이번 주 스케줄을 제출했습니다.",
        },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase
      .from("weekly_schedules")
      .insert([
        {
          name,
          birth_date: birthDate,
          phone_last4: phoneLast4,
          week_start_date: weekStartDate,
          week_end_date: weekEndDate,
          schedule: cleanedSchedule,
          status: "submitted",
        },
      ]);

    if (insertError) {
      return NextResponse.json(
        {
          success: false,
          message: insertError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "이번 주 스케줄이 저장되었습니다.",
    });
  } catch (error) {
    console.error("worker schedule POST error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "스케줄 저장 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}