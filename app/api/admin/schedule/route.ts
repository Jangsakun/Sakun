import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { name, birthDate, phoneLast4, weekStartDate, weekEndDate, schedule } =
      body;

    const trimmedName = String(name || "").trim();
    const trimmedBirthDate = String(birthDate || "").trim();
    const trimmedPhoneLast4 = String(phoneLast4 || "").trim();

    if (
      !trimmedName ||
      !trimmedBirthDate ||
      !trimmedPhoneLast4 ||
      !weekStartDate ||
      !weekEndDate
    ) {
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

    const supabase = createSupabaseAdmin();

    if (!supabase) {
      return NextResponse.json(
        { success: false, message: "환경변수 없음" },
        { status: 500 }
      );
    }

    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select("id, name, birth_date, phone_last4, gender, is_active")
      .eq("name", trimmedName)
      .eq("birth_date", trimmedBirthDate)
      .eq("phone_last4", trimmedPhoneLast4)
      .maybeSingle();

    if (empError) {
      return NextResponse.json(
        {
          success: false,
          message: "직원 확인 중 오류가 발생했습니다.",
          debug: empError.message,
        },
        { status: 500 }
      );
    }

    if (!employee) {
      return NextResponse.json(
        {
          success: false,
          message: "직원 정보를 찾을 수 없습니다.",
        },
        { status: 404 }
      );
    }

    const normalizedSchedule = schedule.map((item: any) => ({
      day: String(item.day || item.dayLabel || ""),
      label: String(item.label || item.dateLabel || ""),
      dayLabel: String(item.dayLabel || item.day || ""),
      dateLabel: String(item.dateLabel || item.label || ""),
      fullDate: String(item.fullDate || ""),
      available: Boolean(item.available),
    }));

    const { data: existingSchedule, error: findError } = await supabase
      .from("weekly_schedules")
      .select("id")
      .eq("name", trimmedName)
      .eq("birth_date", trimmedBirthDate)
      .eq("phone_last4", trimmedPhoneLast4)
      .eq("week_start_date", weekStartDate)
      .eq("week_end_date", weekEndDate)
      .maybeSingle();

    if (findError) {
      return NextResponse.json(
        {
          success: false,
          message: "기존 스케줄 확인 중 오류가 발생했습니다.",
          debug: findError.message,
        },
        { status: 500 }
      );
    }

    if (existingSchedule) {
      const { error: updateError } = await supabase
        .from("weekly_schedules")
        .update({
          employee_id: employee.id,
          name: trimmedName,
          birth_date: trimmedBirthDate,
          phone_last4: trimmedPhoneLast4,
          gender: employee.gender || null,
          week_start_date: weekStartDate,
          week_end_date: weekEndDate,
          schedule: normalizedSchedule,
        })
        .eq("id", existingSchedule.id);

      if (updateError) {
        return NextResponse.json(
          {
            success: false,
            message: "스케줄 수정 실패",
            debug: updateError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "스케줄이 수정되었습니다.",
      });
    }

    const { error: insertError } = await supabase.from("weekly_schedules").insert([
      {
        employee_id: employee.id,
        name: trimmedName,
        birth_date: trimmedBirthDate,
        phone_last4: trimmedPhoneLast4,
        gender: employee.gender || null,
        week_start_date: weekStartDate,
        week_end_date: weekEndDate,
        schedule: normalizedSchedule,
      },
    ]);

    if (insertError) {
      return NextResponse.json(
        {
          success: false,
          message: "스케줄 생성 실패",
          debug: insertError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "스케줄 제출이 완료되었습니다.",
    });
  } catch (error) {
    console.error("worker schedule POST error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "서버 오류",
        debug: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}