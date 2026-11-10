import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ShiftType = "open" | "day" | "night";
type WorkplaceName = "장사꾼" | "헤모즈";

function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function normalizeWorkplace(value: unknown): WorkplaceName {
  const normalized = String(value || "").trim();

  if (normalized === "헤모즈") {
    return "헤모즈";
  }

  return "장사꾼";
}

function normalizeShift(value: unknown): ShiftType {
  const normalized = String(value || "").toLowerCase().trim();

  if (normalized === "open" || normalized === "오픈") {
    return "open";
  }

  if (normalized === "night" || normalized === "야간") {
    return "night";
  }

  return "day";
}

function getShiftLabel(shift: ShiftType) {
  if (shift === "open") return "오픈";
  if (shift === "night") return "야간";
  return "주간";
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

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function addDaysKey(key: string, days: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** date 가 속한 주(월~일) 날짜 7개 */
function weekDatesOf(date: string) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=일
  const monday = addDaysKey(date, dow === 0 ? -6 : 1 - dow);
  return Array.from({ length: 7 }, (_, i) => addDaysKey(monday, i));
}

type WeekContract = { employee_id: number; start_date: string | null; end_date: string | null; input_snapshot: { workDays?: unknown } | null };

/**
 * 당근 근로자의 그 주 스케줄 = 서명한 1주 근로계약서에서 고른 근무 요일(2026-11-10 사용자 요청).
 * 계약 기간 안 + 계약서 근무 요일인 날만 출근(주간)으로 봅니다. 스케줄 조회 화면은 고정 직원과 같은 방식으로 표시합니다.
 */
function carrotContractSchedule(contracts: WeekContract[], weekDates: string[]) {
  return weekDates.map((fullDate) => {
    const weekday = WEEKDAY_KEYS[new Date(`${fullDate}T00:00:00Z`).getUTCDay()];
    const available = contracts.some((c) => {
      const days = Array.isArray(c.input_snapshot?.workDays) ? (c.input_snapshot!.workDays as unknown[]) : [];
      return !!c.start_date && !!c.end_date && c.start_date <= fullDate && fullDate <= c.end_date && days.includes(weekday);
    });
    const dayLabel = WEEKDAY_LABELS[WEEKDAY_KEYS.indexOf(weekday)];

    return normalizeScheduleItem({ day: dayLabel, dayLabel, label: fullDate.slice(5), fullDate, available, shift: "day" });
  });
}

function getScheduleForDate(schedule: any[], date: string) {
  return schedule.find((item) => item.fullDate === date) || null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = (searchParams.get("date") || "").trim();
    const workplace = normalizeWorkplace(searchParams.get("workplace"));

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
      .select("id, name, gender, workplace_name, employment_type, schedule_group")
      .eq("is_active", true)
      .eq("workplace_name", workplace);

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

    // 당근: 서명한(또는 다음 계약으로 끝난) 1주 계약서 중 이번 주와 겹치는 것
    const weekDates = weekDatesOf(date);
    const carrotIds = (employees || []).filter((e) => e.employment_type === "carrot").map((e) => e.id);
    const contractsByEmployee = new Map<number, WeekContract[]>();

    if (carrotIds.length > 0) {
      const { data: contracts, error: contractError } = await supabase
        .from("employment_contracts")
        .select("employee_id, start_date, end_date, input_snapshot")
        .in("employee_id", carrotIds)
        .eq("kind", "week")
        .in("status", ["signed", "ended"])
        .lte("start_date", weekDates[6])
        .gte("end_date", weekDates[0]);

      if (contractError) {
        console.error("당근 계약서 조회 실패:", contractError.message);
      }

      for (const c of (contracts || []) as WeekContract[]) {
        contractsByEmployee.set(c.employee_id, [...(contractsByEmployee.get(c.employee_id) || []), c]);
      }
    }

    const available: any[] = [];
    const unavailable: any[] = [];
    const notSubmitted: any[] = [];

    for (const emp of employees || []) {
      const employeeSchedules = (schedules || [])
        .filter((s) => {
          if (s.employee_id && emp.id) {
            return String(s.employee_id) === String(emp.id);
          }

          return s.name === emp.name;
        })
        .sort((a, b) =>
          String(b.week_end_date || "").localeCompare(
            String(a.week_end_date || "")
          )
        );

      // 당근은 스케줄을 내지 않습니다(2026-10-30). 예전에 낸 스케줄은 쓰지 않고,
      // 1주 근로계약서에서 고른 근무 요일을 스케줄로 씁니다(2026-11-10). 계약서가 없는 주는 출근 기록으로만 당근 칸에 나옵니다.
      const carrotContracts = emp.employment_type === "carrot" ? contractsByEmployee.get(emp.id) || [] : [];
      const scheduleRow =
        emp.employment_type === "carrot"
          ? carrotContracts.length > 0
            ? { schedule: carrotContractSchedule(carrotContracts, weekDates) }
            : null
          : employeeSchedules[0] || null;

      const weeklySchedule = Array.isArray(scheduleRow?.schedule)
        ? scheduleRow.schedule.map((item: any) => normalizeScheduleItem(item))
        : [];

      if (!scheduleRow) {
        notSubmitted.push({
          id: emp.id,
          name: emp.name,
          gender: emp.gender,
          workplaceName: emp.workplace_name || workplace,
          workplace_name: emp.workplace_name || workplace,
          employmentType: emp.employment_type || "fixed",
          employment_type: emp.employment_type || "fixed",
          scheduleGroup: emp.schedule_group || "",
          schedule_group: emp.schedule_group || "",
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
        workplaceName: emp.workplace_name || workplace,
        workplace_name: emp.workplace_name || workplace,
        employmentType: emp.employment_type || "fixed",
        employment_type: emp.employment_type || "fixed",
        scheduleGroup: emp.schedule_group || "",
        schedule_group: emp.schedule_group || "",
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
        workplace,
        available,
        unavailable,
        notSubmitted,
        summary: {
          total: employees?.length || 0,
          available: available.length,
          unavailable: unavailable.length,
          // 당근은 스케줄을 내지 않으므로 미제출 수에서 뺍니다.
          notSubmitted: notSubmitted.filter((emp) => emp.employment_type !== "carrot").length,
          dayAvailable: available.filter((emp) => emp.shift === "day").length,
          nightAvailable: available.filter((emp) => emp.shift === "night")
            .length,
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
      .select("id, name, gender, is_active, workplace_name, employment_type, schedule_group");

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

    const { data: existingSchedules, error: findError } = await supabase
      .from("weekly_schedules")
      .select("id, week_end_date")
      .eq("employee_id", finalEmployeeId)
      .eq("week_start_date", weekStartDate)
      .order("week_end_date", { ascending: false })
      .limit(1);

    const existingSchedule = existingSchedules?.[0] || null;

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