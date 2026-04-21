import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AttendanceRecord = {
  id: number;
  record_type: string;
  checked_at: string;
  employee_id: number;
  employees: {
    id: number;
    name: string;
    hourly_wage?: number | null;
    weekly_allowance_status?: string | null;
  } | null;
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

function formatKST(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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
        { success: false, message: "시작일이 종료일보다 늦을 수 없습니다." },
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

    let filtered: AttendanceRecord[] = (records || []) as AttendanceRecord[];

    if (name && String(name).trim()) {
      const keyword = String(name).trim();
      filtered = filtered.filter((r) => r.employees?.name?.includes(keyword));
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

      const employee = items[0]?.employees;
      const employeeId = items[0]?.employee_id;
      const employeeName = employee?.name || "이름없음";
      const wage =
        typeof employee?.hourly_wage === "number" && employee.hourly_wage > 0
          ? employee.hourly_wage
          : 10320;
      const weeklyAllowanceStatus =
        employee?.weekly_allowance_status || "검토필요";

      const date = formatKST(new Date(items[0].checked_at));

      const checkIn =
        items.find((i) => isCheckInType(i.record_type)) || null;

      const checkOutCandidates = items.filter((i) =>
        isCheckOutType(i.record_type)
      );
      const checkOut =
        checkOutCandidates.length > 0
          ? checkOutCandidates[checkOutCandidates.length - 1]
          : null;

      let hours = 0;

      if (checkIn && checkOut) {
        const inTime = new Date(checkIn.checked_at);
        const outTime = new Date(checkOut.checked_at);

        const standardStart = new Date(`${date}T09:30:00+09:00`);
        const paidStart = inTime.getTime() > standardStart.getTime()
          ? inTime
          : standardStart;

        let minutes = 0;
        const diffMs = outTime.getTime() - paidStart.getTime();

        if (diffMs > 0) {
          minutes = Math.floor(diffMs / 1000 / 60);
        }

        const lunchStart = new Date(`${date}T12:30:00+09:00`);
        const lunchEnd = new Date(`${date}T13:30:00+09:00`);

        const includesFullLunch =
          paidStart.getTime() <= lunchStart.getTime() &&
          outTime.getTime() >= lunchEnd.getTime();

        if (includesFullLunch) {
          minutes = Math.max(0, minutes - 60);
        }

        hours = minutes / 60;
      }

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