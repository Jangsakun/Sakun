import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AttendanceRecord = {
  id: string;
  employee_id: string;
  record_type: string;
  checked_at: string;
  created_at?: string;
};

type Employee = {
  id: string;
  name: string;
  resident_number: string;
  hourly_wage?: number | null;
  weekly_allowance_status?: string | null;
  weekly_allowance_reason?: string | null;
  weekly_allowance_note?: string | null;
};

type DailyPayrollRow = {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  paidMinutes: number;
  grossPay: number;
  netPay: number;
  isWorking: boolean;
  lunchDeducted: boolean;
  checkInRecordId: string | null;
  checkOutRecordId: string | null;
};

function formatKSTDate(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function getWeekStartMondayKST(inputDateStr?: string) {
  const base = inputDateStr
    ? new Date(`${inputDateStr}T00:00:00+09:00`)
    : new Date();

  const kst = new Date(base.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;

  const monday = new Date(kst);
  monday.setUTCDate(kst.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);

  return formatKSTDate(new Date(monday.getTime() - 9 * 60 * 60 * 1000));
}

function getWeekEndSundayKST(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00+09:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return formatKSTDate(end);
}

function getRangeStartISO(dateStr: string) {
  return `${dateStr}T00:00:00+09:00`;
}

function getRangeEndISO(dateStr: string) {
  return `${dateStr}T23:59:59.999+09:00`;
}

function getKSTDateKey(isoString: string) {
  const date = new Date(isoString);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function getKSTTimeString(isoString: string) {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function isCheckInType(type: string) {
  const normalized = String(type || "").toLowerCase().trim();
  return (
    normalized === "check_in" ||
    normalized === "checkin" ||
    normalized === "in" ||
    normalized === "출근"
  );
}

function isCheckOutType(type: string) {
  const normalized = String(type || "").toLowerCase().trim();
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

function minutesToHourString(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}시간 ${minutes}분`;
}

function normalizeResidentNumber(value: string) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function buildDailyPayroll(
  records: AttendanceRecord[],
  hourlyWage: number
): {
  dailyRows: DailyPayrollRow[];
  totalMinutes: number;
  totalGrossPay: number;
  totalNetPay: number;
  totalWorkText: string;
} {
  const grouped: Record<
    string,
    {
      checkIns: AttendanceRecord[];
      checkOuts: AttendanceRecord[];
    }
  > = {};

  for (const record of records) {
    const dateKey = getKSTDateKey(record.checked_at);

    if (!grouped[dateKey]) {
      grouped[dateKey] = {
        checkIns: [],
        checkOuts: [],
      };
    }

    if (isCheckInType(record.record_type)) {
      grouped[dateKey].checkIns.push(record);
    } else if (isCheckOutType(record.record_type)) {
      grouped[dateKey].checkOuts.push(record);
    }
  }

  const todayKST = formatKSTDate(new Date());

  const dailyRows: DailyPayrollRow[] = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => {
      const sortedCheckIns = value.checkIns.sort(
        (a, b) =>
          new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
      );
      const sortedCheckOuts = value.checkOuts.sort(
        (a, b) =>
          new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
      );

      const firstCheckIn = sortedCheckIns[0] || null;
      const lastCheckOut =
        sortedCheckOuts.length > 0
          ? sortedCheckOuts[sortedCheckOuts.length - 1]
          : null;

      if (!firstCheckIn) {
        return {
          date,
          checkIn: null,
          checkOut: null,
          paidMinutes: 0,
          grossPay: 0,
          netPay: 0,
          isWorking: false,
          lunchDeducted: false,
          checkInRecordId: null,
          checkOutRecordId: null,
        };
      }

      const actualStart = new Date(firstCheckIn.checked_at);

      const workStartBase = new Date(`${date}T09:30:00+09:00`);
      const paidStart =
        actualStart.getTime() < workStartBase.getTime()
          ? workStartBase
          : actualStart;

      let paidEnd: Date | null = lastCheckOut
        ? new Date(lastCheckOut.checked_at)
        : null;

      let isWorking = false;

      if (!paidEnd && date === todayKST) {
        paidEnd = new Date();
        isWorking = true;
      }

      let paidMinutes = 0;
      let lunchDeducted = false;

      if (paidEnd && paidEnd.getTime() > paidStart.getTime()) {
        paidMinutes = Math.floor(
          (paidEnd.getTime() - paidStart.getTime()) / (1000 * 60)
        );
      }

      if (paidEnd && paidMinutes > 0) {
        const lunchStart = new Date(`${date}T12:30:00+09:00`);
        const lunchEnd = new Date(`${date}T13:30:00+09:00`);

        const includesFullLunch =
          paidStart.getTime() <= lunchStart.getTime() &&
          paidEnd.getTime() >= lunchEnd.getTime();

        if (includesFullLunch) {
          paidMinutes = Math.max(0, paidMinutes - 60);
          lunchDeducted = true;
        }
      }

      const grossPay = roundToWon((paidMinutes / 60) * hourlyWage);
      const netPay = roundToWon(grossPay * 0.967);

      return {
        date,
        checkIn: firstCheckIn.checked_at,
        checkOut: lastCheckOut ? lastCheckOut.checked_at : null,
        paidMinutes,
        grossPay,
        netPay,
        isWorking,
        lunchDeducted,
        checkInRecordId: firstCheckIn.id || null,
        checkOutRecordId: lastCheckOut?.id || null,
      };
    });

  const totalMinutes = dailyRows.reduce((sum, row) => sum + row.paidMinutes, 0);
  const totalGrossPay = dailyRows.reduce((sum, row) => sum + row.grossPay, 0);
  const totalNetPay = dailyRows.reduce((sum, row) => sum + row.netPay, 0);

  return {
    dailyRows,
    totalMinutes,
    totalGrossPay,
    totalNetPay,
    totalWorkText: minutesToHourString(totalMinutes),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      action,
      name,
      residentNumber,
      date,
      startDate,
      endDate,
      weekStartDate,
    } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          message: "Supabase 환경변수가 없습니다.",
        },
        { status: 500 }
      );
    }

    if (!action || !name || !residentNumber) {
      return NextResponse.json(
        {
          success: false,
          message: "action, 이름, 주민번호가 필요합니다.",
        },
        { status: 400 }
      );
    }

    const normalizedResidentNumber = normalizeResidentNumber(residentNumber);

    if (normalizedResidentNumber.length !== 13) {
      return NextResponse.json(
        {
          success: false,
          message: "주민번호 13자리를 정확히 입력해주세요.",
        },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: employees, error: employeeError } = await supabase
      .from("employees")
      .select(
        "id, name, resident_number, hourly_wage, weekly_allowance_status, weekly_allowance_reason, weekly_allowance_note"
      )
      .eq("name", String(name).trim());

    if (employeeError) {
      return NextResponse.json(
        {
          success: false,
          message: "직원 조회 중 오류가 발생했습니다.",
          error: employeeError.message,
        },
        { status: 500 }
      );
    }

    const employee = (employees || []).find(
      (item: Employee) =>
        normalizeResidentNumber(item.resident_number) === normalizedResidentNumber
    ) as Employee | undefined;

    if (!employee) {
      return NextResponse.json(
        {
          success: false,
          message: "일치하는 근로자 정보를 찾을 수 없습니다.",
        },
        { status: 404 }
      );
    }

    const hourlyWage =
      typeof employee.hourly_wage === "number" && employee.hourly_wage > 0
        ? employee.hourly_wage
        : 10320;

    let queryStartDate = "";
    let queryEndDate = "";

    if (action === "currentWeek") {
      queryStartDate = getWeekStartMondayKST();
      queryEndDate = formatKSTDate(new Date());
    } else if (action === "byDate") {
      if (date) {
        queryStartDate = date;
        queryEndDate = date;
      } else if (startDate && endDate) {
        queryStartDate = startDate;
        queryEndDate = endDate;
      } else {
        return NextResponse.json(
          {
            success: false,
            message: "날짜 또는 시작일/종료일이 필요합니다.",
          },
          { status: 400 }
        );
      }
    } else if (action === "weeklyStatement") {
      const start = weekStartDate || getWeekStartMondayKST();
      queryStartDate = start;
      queryEndDate = getWeekEndSundayKST(start);
    } else {
      return NextResponse.json(
        {
          success: false,
          message: "지원하지 않는 action 입니다.",
        },
        { status: 400 }
      );
    }

    const { data: records, error: recordError } = await supabase
      .from("attendance_records")
      .select("id, employee_id, record_type, checked_at, created_at")
      .eq("employee_id", employee.id)
      .gte("checked_at", getRangeStartISO(queryStartDate))
      .lte("checked_at", getRangeEndISO(queryEndDate))
      .order("checked_at", { ascending: true });

    if (recordError) {
      return NextResponse.json(
        {
          success: false,
          message: "출퇴근 기록 조회 중 오류가 발생했습니다.",
          error: recordError.message,
        },
        { status: 500 }
      );
    }

    const payroll = buildDailyPayroll(records || [], hourlyWage);

    const weeklyAllowanceStatus =
      employee.weekly_allowance_status || "검토필요";

    let weeklyAllowanceAmount = 0;
    let weeklyAllowanceDisplayText = "해당 없음";

    if (weeklyAllowanceStatus === "대상") {
      const totalMinutes = payroll.totalMinutes;
      const totalHours = totalMinutes / 60;

      if (totalHours >= 15) {
        const dailyAvgHours = totalHours / 5;
        weeklyAllowanceAmount = Math.round(dailyAvgHours * hourlyWage);
      } else {
        weeklyAllowanceAmount = 0;
      }

      weeklyAllowanceDisplayText =
        weeklyAllowanceAmount > 0
          ? `${weeklyAllowanceAmount.toLocaleString("ko-KR")}원`
          : "해당 없음";
    } else {
      weeklyAllowanceAmount = 0;
      weeklyAllowanceDisplayText = "해당 없음";
    }

    const response = {
      success: true,
      employee: {
        id: employee.id,
        name: employee.name,
        residentNumber: employee.resident_number,
        hourlyWage,
      },
      range: {
        startDate: queryStartDate,
        endDate: queryEndDate,
      },
      summary: {
        totalMinutes: payroll.totalMinutes,
        totalWorkText: payroll.totalWorkText,
        totalGrossPay: payroll.totalGrossPay,
        totalNetPay: payroll.totalNetPay,
      },
      weeklyAllowance: {
        status: weeklyAllowanceStatus,
        amount: weeklyAllowanceAmount,
        displayText: weeklyAllowanceDisplayText,
      },
      dailyRows: payroll.dailyRows.map((row) => ({
        ...row,
        checkInText: row.checkIn ? getKSTTimeString(row.checkIn) : "-",
        checkOutText: row.checkOut ? getKSTTimeString(row.checkOut) : "-",
        workText: minutesToHourString(row.paidMinutes),
        lunchText: row.lunchDeducted ? "점심 1시간 제외" : "-",
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";

    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status: 500 }
    );
  }
}