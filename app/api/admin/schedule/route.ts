import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ShiftType = "day" | "night";

function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function normalizeShift(value: unknown): ShiftType {
  const normalized = String(value || "").toLowerCase().trim();

  if (normalized === "night" || normalized === "야간") {
    return "night";
  }

  return "day";
}

function getShiftLabel(shift: ShiftType) {
  return shift === "night" ? "야간" : "주간";
}

function normalizeScheduleItem(item: any) {
  const shift = normalizeShift(item?.shift || item?.shiftType || item?.shiftLabel);

  return {
    day: String(item?.day || item?.dayLabel || ""),
    label: String(item?.label || item?.dateLabel || ""),
    dayLabel: String(item?.dayLabel || item?.day || ""),
    dateLabel: String(item?.dateLabel || item?.label || ""),
    fullDate: String(item?.fullDate || ""),
    available: Boolean(item?.available),
    shift,
    shiftType: shift,
    shiftLabel: getShiftLabel(shift),
  };
}

function getScheduleForDate(schedule: any[], date: string) {
  return schedule.find((item) => item.fullDate === date) || null;
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
      const scheduleRow = schedules?.find((s) => {
        if (s.employee_id && emp.id) {
          return String(s.employee_id) === String(emp.id);
        }

        return s.name === emp.name;
      });

      const weeklySchedule = Array.isArray(scheduleRow?.schedule)
        ? scheduleRow.schedule.map((item: any) => normalizeScheduleItem(item))
        : [];

      if (!scheduleRow) {
        notSubmitted.push({
          id: emp.id,
          name: emp.name,
          gender: emp.gender,
          schedule: [],
          selectedDateSchedule: null,
          shift: null,
          shiftType: null,
          shiftLabel: "",
        });
        continue;
      }

      const selectedDateSchedule = getScheduleForDate(weeklySchedule, date);
      const isAvailable = selectedDateSchedule?.available === true;
      const selectedShift = isAvailable
        ? normalizeShift(
            selectedDateSchedule?.shift ||
              selectedDateSchedule?.shiftType ||
              selectedDateSchedule?.shiftLabel
          )
        : null;

      const employeePayload = {
        id: emp.id,
        name: emp.name,
        gender: emp.gender,
        schedule: weeklySchedule,
        selectedDateSchedule,
        shift: selectedShift,
        shiftType: selectedShift,
        shiftLabel: selectedShift ? getShiftLabel(selectedShift) : "",
      };

      if (isAvailable) {
        available.push(employeePayload);
      } else {
        unavailable.push(employeePayload);
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
          dayAvailable: available.filter((emp) => emp.shift === "day").length,
          nightAvailable: available.filter((emp) => emp.shift === "night").length,
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

    const { employeeId, name, gender, weekStartDate, weekEndDate, schedule } =
      body;

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

    let employeeQuery = supabase
      .from("employees")
      .select("id, name, gender, is_active");

    if (employeeId) {
      employeeQuery = employeeQuery.eq("id", employeeId);
    } else {
      employeeQuery = employeeQuery.eq("name", trimmedName);
    }

    const { data: employee, error: employeeError } =
      await employeeQuery.maybeSingle();

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

    const finalEmployeeId = employee.id;
    const finalGender = employee.gender || trimmedGender;

    const normalizedSchedule = schedule.map((item: any) =>
      normalizeScheduleItem(item)
    );

    const { data: existingSchedule, error: findError } = await supabase
      .from("weekly_schedules")
      .select("id")
      .eq("employee_id", finalEmployeeId)
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
          employee_id: finalEmployeeId,
          name: employee.name || trimmedName,
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
          name: employee.name || trimmedName,
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
