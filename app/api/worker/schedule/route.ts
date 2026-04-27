import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return null;
  }

  return createClient(supabaseUrl, anonKey);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      name,
      residentNumber,
      phone,
      weekStartDate,
      weekEndDate,
      schedule,
    } = body;

    const trimmedName = String(name || "").trim();
    const trimmedResidentNumber = String(residentNumber || "").trim();
    const trimmedPhone = String(phone || "").trim();

    if (
      !trimmedName ||
      !trimmedResidentNumber ||
      !trimmedPhone ||
      !weekStartDate ||
      !weekEndDate
    ) {
      return NextResponse.json(
        { success: false, message: "필수값 누락" },
        { status: 400 }
      );
    }

    if (!Array.isArray(schedule) || schedule.length === 0) {
      return NextResponse.json(
        { success: false, message: "스케줄 없음" },
        { status: 400 }
      );
    }

    const supabase = createSupabase();

    if (!supabase) {
      return NextResponse.json(
        { success: false, message: "환경변수 없음" },
        { status: 500 }
      );
    }

    // 직원 찾기
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select("id, name")
      .eq("name", trimmedName)
      .eq("resident_number", trimmedResidentNumber)
      .maybeSingle();

    if (empError || !employee) {
      return NextResponse.json(
        { success: false, message: "직원 없음" },
        { status: 404 }
      );
    }

    const normalizedSchedule = schedule.map((item: any) => ({
      day: String(item.day || ""),
      label: String(item.label || ""),
      fullDate: String(item.fullDate || ""),
      available: Boolean(item.available),
    }));

    // 기존 스케줄 있는지 확인
    const { data: existing, error: findError } = await supabase
      .from("weekly_schedules")
      .select("id")
      .eq("name", trimmedName)
      .eq("week_start_date", weekStartDate)
      .eq("week_end_date", weekEndDate)
      .maybeSingle();

    if (findError) {
      return NextResponse.json(
        { success: false, message: "조회 실패" },
        { status: 500 }
      );
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from("weekly_schedules")
        .update({
          employee_id: employee.id,
          name: trimmedName,
          week_start_date: weekStartDate,
          week_end_date: weekEndDate,
          schedule: normalizedSchedule,
        })
        .eq("id", existing.id);

      if (updateError) {
        return NextResponse.json(
          { success: false, message: "수정 실패" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "스케줄 수정 완료",
      });
    }

    // 신규 생성
    const { error: insertError } = await supabase
      .from("weekly_schedules")
      .insert([
        {
          employee_id: employee.id,
          name: trimmedName,
          week_start_date: weekStartDate,
          week_end_date: weekEndDate,
          schedule: normalizedSchedule,
        },
      ]);

    if (insertError) {
      return NextResponse.json(
        { success: false, message: "생성 실패" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "스케줄 제출 완료",
    });
  } catch (error) {
    console.error("worker schedule POST error:", error);

    return NextResponse.json(
      { success: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}