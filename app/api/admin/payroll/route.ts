import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type EmployeeNested =
  | {
      id: number;
      name: string;
      hourly_wage?: number | null;
      weekly_allowance_status?: string | null;
      workplace_name?: string | null;
    }
  | {
      id: number;
      name: string;
      hourly_wage?: number | null;
      weekly_allowance_status?: string | null;
      workplace_name?: string | null;
    }[]
  | null;

type AttendanceRecord = {
  id: number;
  record_type: string;
  checked_at: string;
  employee_id: number;
  hourly_wage_snapshot?: number | null;
  employees: EmployeeNested;
};

type DailyWorkRow = {
  employeeId: number;
  employeeName: string;
  workplaceName: string;
  date: string;
  hours: number;
  workedMinutes: number;
  wage: number;
  basePay: number;
  weeklyAllowanceStatus: string;
};

type WeeklyPayrollRow = {
  employeeId: number;
  employeeName: string;
  workplaceName: string;
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  totalMinutes: number;
  totalBasePay: number;
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

function getEmployeeObject(rawEmployee: EmployeeNested) {
  if (!rawEmployee) return null;
  return Array.isArray(rawEmployee) ? rawEmployee[0] || null : rawEmployee;
}

function getWageForDay(items: AttendanceRecord[], employee: any) {
  // 급여 계산은 출퇴근 당시 저장된 시급 스냅샷을 최우선으로 사용합니다.
  // 이 값이 있으면 employees.hourly_wage가 나중에 바뀌어도 과거 급여는 바뀌지 않습니다.
  const snapshotWage = items
    .map((item) => Number(item.hourly_wage_snapshot || 0))
    .find((wage) => wage > 0);

  if (snapshotWage) {
    return snapshotWage;
  }

  // 구버전 출퇴근 기록처럼 스냅샷이 아직 없는 데이터만 현재 시급을 임시 사용합니다.
  // 아래 freezeMissingWageSnapshots()가 조회 시 해당 값을 DB에 즉시 고정하므로
  // 이후 직원 시급이 변경되어도 같은 과거 기록은 다시 바뀌지 않습니다.
  const employeeWage = Number(employee?.hourly_wage || 0);
  if (employeeWage > 0) {
    return employeeWage;
  }

  return 10320;
}

async function freezeMissingWageSnapshots(
  supabase: ReturnType<typeof createClient>,
  records: AttendanceRecord[]
) {
  const groups = new Map<number, { wage: number; ids: number[] }>();

  for (const record of records) {
    const currentSnapshot = Number(record.hourly_wage_snapshot || 0);

    if (currentSnapshot > 0) {
      continue;
    }

    const employee = getEmployeeObject(record.employees);
    const currentWage = Number(employee?.hourly_wage || 0);

    if (currentWage <= 0) {
      continue;
    }

    const existing = groups.get(record.employee_id);

    if (existing) {
      existing.ids.push(record.id);
    } else {
      groups.set(record.employee_id, {
        wage: currentWage,
        ids: [record.id],
      });
    }
  }

  for (const [employeeId, group] of groups) {
    // Supabase/PostgREST의 IN 조건이 너무 길어지지 않도록 나눠서 저장합니다.
    const chunkSize = 500;

    for (let i = 0; i < group.ids.length; i += chunkSize) {
      const ids = group.ids.slice(i, i + chunkSize);

      const { error } = await supabase
        .from("attendance_records")
        .update({ hourly_wage_snapshot: group.wage })
        .in("id", ids)
        .is("hourly_wage_snapshot", null);

      if (error) {
        return error;
      }
    }

    // 이번 요청에서 바로 스냅샷 값을 사용하도록 메모리 데이터도 동기화합니다.
    for (const record of records) {
      if (
        record.employee_id === employeeId &&
        Number(record.hourly_wage_snapshot || 0) <= 0
      ) {
        record.hourly_wage_snapshot = group.wage;
      }
    }
  }

  return null;
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
    // 관리자 급여관리는 출퇴근 보정시간이 아니라 실제 기록 시간을 기준으로 계산합니다.
    const actualIn = new Date(session.checkIn.checked_at);
    const actualOut = new Date(session.checkOut.checked_at);

    const diffMs = actualOut.getTime() - actualIn.getTime();

    if (diffMs > 0) {
      totalMinutes += Math.floor(diffMs / 1000 / 60);
    }
  }

  if (sessions.length === 0) {
    return 0;
  }

  const firstActualIn = new Date(sessions[0].checkIn.checked_at);
  const lastActualOut = new Date(
    sessions[sessions.length - 1].checkOut.checked_at
  );

  const lunchStart = new Date(`${date}T12:30:00+09:00`);
  const lunchEnd = new Date(`${date}T13:30:00+09:00`);

  const includesFullLunch =
    firstActualIn.getTime() <= lunchStart.getTime() &&
    lastActualOut.getTime() >= lunchEnd.getTime();

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

    const allRecords: AttendanceRecord[] = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from("attendance_records")
        .select(`
          id,
          record_type,
          checked_at,
          employee_id,
          hourly_wage_snapshot,
          employees (
            id,
            name,
            hourly_wage,
            weekly_allowance_status,
            workplace_name
          )
        `)
        .gte("checked_at", `${startDate}T00:00:00+09:00`)
        .lte("checked_at", `${endDate}T23:59:59.999+09:00`)
        .order("checked_at", { ascending: true })
        .range(from, to);

      if (error) {
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 500 }
        );
      }

      const pageRecords = (data || []) as AttendanceRecord[];
      allRecords.push(...pageRecords);

      if (pageRecords.length < pageSize) {
        break;
      }

      from += pageSize;
    }

    const safeRecords = allRecords;
    let filtered = safeRecords;

    if (name && String(name).trim()) {
      const keyword = String(name).trim();
      filtered = filtered.filter((r) => {
        const employee = getEmployeeObject(r.employees);
        return employee?.name?.includes(keyword);
      });
    }

    // 구버전 기록 중 hourly_wage_snapshot이 비어 있으면
    // 현재 표시 중인 시급을 해당 출퇴근 기록에 한 번만 고정합니다.
    // 직원관리에서 시급을 바꾸기 전 이 API를 조회한 기록은 이후에도 과거 시급이 유지됩니다.
    const snapshotFreezeError = await freezeMissingWageSnapshots(
      supabase,
      filtered
    );

    if (snapshotFreezeError) {
      return NextResponse.json(
        {
          success: false,
          message: `과거 시급 고정 실패: ${snapshotFreezeError.message}`,
        },
        { status: 500 }
      );
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
      const workplaceName = employee?.workplace_name || "장사꾼";
      const wage = getWageForDay(items, employee);
      const weeklyAllowanceStatus =
        employee?.weekly_allowance_status || "검토필요";

      const date = formatKST(new Date(items[0].checked_at));

      const sessions = pairSessions(items);
      const workedMinutes = calculateDailyWorkedMinutes(date, sessions);
      const hours = workedMinutes / 60;
      const basePay = Math.floor((workedMinutes / 60) * wage);

      dailyWorks.push({
        employeeId,
        employeeName,
        workplaceName,
        date,
        hours,
        workedMinutes,
        wage,
        basePay,
        weeklyAllowanceStatus,
      });
    }

    const weekly: Record<string, WeeklyPayrollRow> = {};

    for (const row of dailyWorks) {
      const d = new Date(`${row.date}T00:00:00+09:00`);

      const dayText = d.toLocaleDateString("en-US", {
        timeZone: "Asia/Seoul",
        weekday: "short",
      });

      const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };

      const day = dayMap[dayText] ?? 1;

      const monday = new Date(`${row.date}T00:00:00+09:00`);
      monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const weekStart = formatKST(monday);
      const weekEnd = formatKST(sunday);

      const key = `${row.employeeId}_${weekStart}`;

      if (!weekly[key]) {
        weekly[key] = {
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          workplaceName: row.workplaceName,
          weekStart,
          weekEnd,
          totalHours: 0,
          totalMinutes: 0,
          totalBasePay: 0,
          hourlyWage: row.wage,
          weeklyAllowanceStatus: row.weeklyAllowanceStatus || "검토필요",
        };
      }

      weekly[key].totalHours += row.hours;
      weekly[key].totalMinutes += row.workedMinutes;
      weekly[key].totalBasePay += row.basePay;
    }

    const result = Object.values(weekly).map((w) => {
      // 화면 표시는 시간 단위로 전달하되, 급여 계산은 소수점 반올림 시간이 아닌 총 분 기준으로 계산합니다.
      // 시급이 주 중간에 바뀐 경우를 위해 일별 기본급을 먼저 계산한 뒤 합산합니다.
      const totalHours = Number((w.totalMinutes / 60).toFixed(4));
      const basePay = Math.floor(w.totalBasePay);
      const averageHourlyWage =
        totalHours > 0 ? basePay / totalHours : w.hourlyWage;

      let weeklyAllowance = 0;

      if (w.weeklyAllowanceStatus === "대상" && w.totalMinutes >= 15 * 60) {
        weeklyAllowance = Math.floor((w.totalMinutes / 60 / 5) * averageHourlyWage);
      } else {
        weeklyAllowance = 0;
      }

      const grossPay = basePay + weeklyAllowance;
      const netPay = Math.floor(grossPay * 0.967);

      return {
        employeeId: String(w.employeeId),
        employeeName: w.employeeName,
        workplaceName: w.workplaceName,
        weekStart: w.weekStart,
        weekEnd: w.weekEnd,
        totalHours,
        hourlyWage: Math.round(averageHourlyWage),
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