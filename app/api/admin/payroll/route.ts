import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type EmployeeNested =
  | {
      id: number;
      name: string;
      hourly_wage?: number | null;
      weekly_allowance_status?: string | null;
    }
  | {
      id: number;
      name: string;
      hourly_wage?: number | null;
      weekly_allowance_status?: string | null;
    }[]
  | null;

type AttendanceRecord = {
  id: number;
  record_type: string;
  checked_at: string;
  employee_id: number;
  employees: EmployeeNested;
};

type DailyWorkRow = {
  employeeId: number;
  employeeName: string;
  date: string;
  hours: number;
  wage: number;
  weeklyAllowanceStatus: string;
};

type WeeklyPayrollRow = {
  employeeId: number;
  employeeName: string;
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  hourlyWage: number;
  weeklyAllowanceStatus: string;
};

type WorkSession = {
  checkIn: AttendanceRecord;
  checkOut: AttendanceRecord;
};

function formatKST(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getKSTHourMinute(date: Date) {
  const hhmm = date.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const [hourText, minuteText] = hhmm.split(":");
  return {
    hour: Number(hourText),
    minute: Number(minuteText),
    totalMinutes: Number(hourText) * 60 + Number(minuteText),
  };
}

function createKSTDateTime(dateKey: string, hour: number, minute: number) {
  const safeHour = String(hour).padStart(2, "0");
  const safeMinute = String(minute).padStart(2, "0");
  return new Date(`${dateKey}T${safeHour}:${safeMinute}:00+09:00`);
}

function normalizeCheckInTime(value: string) {
  const source = new Date(value);
  const dateKey = formatKST(source);
  const { totalMinutes } = getKSTHourMinute(source);

  const start0900Window = 8 * 60 + 45;
  const end0910Window = 9 * 60 + 10;
  const start0911Window = 9 * 60 + 11;
  const end0930Window = 9 * 60 + 30;

  if (totalMinutes >= start0900Window && totalMinutes <= end0910Window) {
    return createKSTDateTime(dateKey, 9, 0);
  }

  if (totalMinutes >= start0911Window && totalMinutes <= end0930Window) {
    return createKSTDateTime(dateKey, 9, 30);
  }

  return source;
}

function normalizeCheckOutTime(value: string) {
  const source = new Date(value);
  const dateKey = formatKST(source);
  const { hour, minute } = getKSTHourMinute(source);

  if (hour >= 18) {
    if (minute <= 10) {
      return createKSTDateTime(dateKey, hour, 0);
    }

    if (minute <= 40) {
      return createKSTDateTime(dateKey, hour, 30);
    }

    return createKSTDateTime(dateKey, hour + 1, 0);
  }

  return source;
}

function isCheckInType(value: string) {
  const normalized = String(value || "").toLowerCase().trim();
  return (
    normalized === "check_in" ||
    normalized === "checkin" ||
    normalized === "in" ||
    normalized === "출근"
  );
}

function isCheckOutType(value: string) {
  const normalized = String(value || "").toLowerCase().trim();
  return (
    normalized === "check_out" ||
    normalized === "checkout" ||
    normalized === "out" ||
    normalized === "퇴근"
  );
}

function roundToWon(value: number) {
  return Math.round(value);
}

function getEmployeeObject(rawEmployee: EmployeeNested) {
  if (!rawEmployee) return null;
  return Array.isArray(rawEmployee) ? rawEmployee[0] || null : rawEmployee;
}

function pairSessions(items: AttendanceRecord[]) {
  const sessions: WorkSession[] = [];
  let openCheckIn: AttendanceRecord | null = null;

  for (const item of items) {
    if (isCheckInType(item.record_type)) {
      if (!openCheckIn) {
        openCheckIn = item;
      }
      continue;
    }

    if (isCheckOutType(item.record_type)) {
      if (openCheckIn) {
        const inTime = new Date(openCheckIn.checked_at).getTime();
        const outTime = new Date(item.checked_at).getTime();

        if (outTime > inTime) {
          sessions.push({
            checkIn: openCheckIn,
            checkOut: item,
          });
        }

        openCheckIn = null;
      }
    }
  }

  return sessions;
}

function calculateDailyWorkedMinutes(date: string, sessions: WorkSession[]) {
  let totalMinutes = 0;

  for (const session of sessions) {
    const normalizedIn = normalizeCheckInTime(session.checkIn.checked_at);
    const normalizedOut = normalizeCheckOutTime(session.checkOut.checked_at);

    const diffMs = normalizedOut.getTime() - normalizedIn.getTime();

    if (diffMs > 0) {
      totalMinutes += Math.floor(diffMs / 1000 / 60);
    }
  }

  if (sessions.length === 0) {
    return 0;
  }

  const firstNormalizedIn = normalizeCheckInTime(sessions[0].checkIn.checked_at);
  const lastNormalizedOut = normalizeCheckOutTime(
    sessions[sessions.length - 1].checkOut.checked_at
  );

  const lunchStart = new Date(`${date}T12:30:00+09:00`);
  const lunchEnd = new Date(`${date}T13:30:00+09:00`);

  const includesFullLunch =
    firstNormalizedIn.getTime() <= lunchStart.getTime() &&
    lastNormalizedOut.getTime() >= lunchEnd.getTime();

  if (includesFullLunch) {
    totalMinutes = Math.max(0, totalMinutes - 60);
  }

  return totalMinutes;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { startDate, endDate, name } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, message: "환경변수 없음" },
        { status: 500 }
      );
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, message: "날짜 필요" },
        { status: 400 }
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        {
          success: false,
          message: "시작일이 종료일보다 늦을 수 없습니다.",
        },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: records, error } = await supabase
      .from("attendance_records")
      .select(`
        id,
        record_type,
        checked_at,
        employee_id,
        employees (
          id,
          name,
          hourly_wage,
          weekly_allowance_status
        )
      `)
      .gte("checked_at", `${startDate}T00:00:00+09:00`)
      .lte("checked_at", `${endDate}T23:59:59.999+09:00`)
      .order("checked_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    const safeRecords = (records || []) as AttendanceRecord[];
    let filtered = safeRecords;

    if (name && String(name).trim()) {
      const keyword = String(name).trim();
      filtered = filtered.filter((r) => {
        const employee = getEmployeeObject(r.employees);
        return employee?.name?.includes(keyword);
      });
    }

    const grouped: Record<string, AttendanceRecord[]> = {};

    for (const record of filtered) {
      const kstDate = formatKST(new Date(record.checked_at));
      const key = `${record.employee_id}_${kstDate}`;

      if (!grouped[key]) {
        grouped[key] = [];
      }

      grouped[key].push(record);
    }

    const dailyWorks: DailyWorkRow[] = [];

    for (const key in grouped) {
      const items = [...grouped[key]].sort(
        (a, b) =>
          new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
      );

      const employee = getEmployeeObject(items[0]?.employees);
      const employeeId = items[0]?.employee_id;
      const employeeName = employee?.name || "이름없음";

      const wage =
        typeof employee?.hourly_wage === "number" && employee.hourly_wage > 0
          ? employee.hourly_wage
          : 10320;

      const weeklyAllowanceStatus =
        employee?.weekly_allowance_status || "검토필요";

      const date = formatKST(new Date(items[0].checked_at));

      const sessions = pairSessions(items);
      const workedMinutes = calculateDailyWorkedMinutes(date, sessions);
      const hours = workedMinutes / 60;

      dailyWorks.push({
        employeeId,
        employeeName,
        date,
        hours,
        wage,
        weeklyAllowanceStatus,
      });
    }

    const weekly: Record<string, WeeklyPayrollRow> = {};

    for (const row of dailyWorks) {
      const d = new Date(`${row.date}T00:00:00+09:00`);

      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((day + 6) % 7));

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const weekStart = formatKST(monday);
      const weekEnd = formatKST(sunday);

      const key = `${row.employeeId}_${weekStart}`;

      if (!weekly[key]) {
        weekly[key] = {
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          weekStart,
          weekEnd,
          totalHours: 0,
          hourlyWage: row.wage,
          weeklyAllowanceStatus: row.weeklyAllowanceStatus || "검토필요",
        };
      }

      weekly[key].totalHours += row.hours;
    }

    const result = Object.values(weekly).map((w) => {
      const totalHours = Number(w.totalHours.toFixed(2));
      const basePay = roundToWon(totalHours * w.hourlyWage);

      let weeklyAllowance = 0;

      if (w.weeklyAllowanceStatus === "대상") {
        weeklyAllowance = roundToWon((totalHours / 5) * w.hourlyWage);
      } else {
        weeklyAllowance = 0;
      }

      const grossPay = basePay + weeklyAllowance;
      const netPay = roundToWon(grossPay * 0.967);

      return {
        employeeId: String(w.employeeId),
        employeeName: w.employeeName,
        weekStart: w.weekStart,
        weekEnd: w.weekEnd,
        totalHours,
        hourlyWage: w.hourlyWage,
        weeklyAllowanceStatus: w.weeklyAllowanceStatus,
        basePay,
        weeklyAllowance,
        grossPay,
        netPay,
      };
    });

    return NextResponse.json({
      success: true,
      payrolls: result,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}