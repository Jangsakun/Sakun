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

    const supabase = createSupabaseAdmin();

    if (!supabase) {
      return NextResponse.json(
        { success: false, message: "환경변수 없음" },
        { status: 500 }
      );
    }

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

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      employeeId,
      name,
      gender,
      weekStartDate,
      weekEndDate,
      schedule,
    } = body;

    const trimmedName = String(name || "").trim();
    const trimmedGender = gender ? String(gender).trim() : null;

    if (!trimmedName) {
      return NextResponse.json(
        { success: false, message: "직원 이름이 필요합니다." },
        { status: 400 }
      );
    }

    if (!weekStartDate || !weekEndDate) {
      return NextResponse.json(
        { success: false, message: "주차 시작일과 종료일이 필요합니다." },
        { status: 400 }
      );
    }

    if (!Array.isArray(schedule)) {
      return NextResponse.json(
        { success: false, message: "스케줄 형식이 올바르지 않습니다." },
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

    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id, name, gender, is_active")
      .eq("name", trimmedName)
      .maybeSingle();

    if (employeeError) {
      return NextResponse.json(
        {
          success: false,
          message: "직원 확인 중 오류가 발생했습니다.",
          debug: employeeError.message,
        },
        { status: 500 }
      );
    }

    if (!employee) {
      return NextResponse.json(
        { success: false, message: "직원을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const finalEmployeeId = employeeId || employee.id;
    const finalGender = employee.gender || trimmedGender;

    const normalizedSchedule = schedule.map((item: any) => ({
      day: String(item.day || ""),
      label: String(item.label || ""),
      fullDate: String(item.fullDate || ""),
      available: Boolean(item.available),
    }));

    const { data: existingSchedule, error: findError } = await supabase
      .from("weekly_schedules")
      .select("id")
      .eq("name", trimmedName)
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
          name: trimmedName,
          gender: finalGender,
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

    const { error: insertError } = await supabase
      .from("weekly_schedules")
      .insert([
        {
          employee_id: finalEmployeeId,
          name: trimmedName,
          gender: finalGender,
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
      message: "스케줄이 생성되었습니다.",
    });
  } catch (error) {
    console.error("admin schedule PATCH error:", error);

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