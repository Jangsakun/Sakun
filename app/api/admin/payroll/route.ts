import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadPayOverrides, payOverrideKey } from "@/app/lib/payOverride";
import {
  getDailyWage,
  isPieceContract,
  toContractType,
} from "@/app/lib/contractType";
import { calcDayPay } from "@/app/lib/dayPay";

/** PostgREST 한 번에 받을 수 있는 최대 행 수. */
const PAGE_SIZE = 1000;

/** 폭주 방지 상한. 10만 행이면 어떤 조회 기간이든 충분합니다. */
const MAX_PAGES = 100;

const ATTENDANCE_SELECT = `
  id,
  record_type,
  checked_at,
  employee_id,
  hourly_wage_snapshot,
  segment_type,
  piece_daily_wage_snapshot,
  employees (
    id,
    name,
    hourly_wage,
    weekly_allowance_status,
    workplace_name,
    contract_type,
    daily_wage
  )
`;

type EmployeeNested =
  | {
      id: number;
      name: string;
      hourly_wage?: number | null;
      weekly_allowance_status?: string | null;
      workplace_name?: string | null;
      contract_type?: string | null;
      daily_wage?: number | null;
    }
  | {
      id: number;
      name: string;
      hourly_wage?: number | null;
      weekly_allowance_status?: string | null;
      workplace_name?: string | null;
      contract_type?: string | null;
      daily_wage?: number | null;
    }[]
  | null;

type AttendanceRecord = {
  id: number;
  record_type: string;
  checked_at: string;
  employee_id: number;
  hourly_wage_snapshot?: number | null;
  segment_type?: string | null;
  piece_daily_wage_snapshot?: number | null;
  employees: EmployeeNested;
};

type DailyWorkRow = {
  contractType: string;
  employeeId: number;
  employeeName: string;
  workplaceName: string;
  date: string;
  hours: number;
  workedMinutes: number;
  wage: number;
  basePay: number;
  /** 기본급 중 시급분(직접지정한 날은 지정 금액 전체) — 주휴수당 평균시급 계산용 */
  hourlyPortion: number;
  /** 기본급 중 도급분(직접지정한 날은 0) */
  piecePortion: number;
  /** 주휴수당 15시간 판정용 시간(분) */
  allowanceMinutes: number;
  /** 도급 출근만 있고 퇴근이 없어 일급을 주지 않은 날 */
  pieceMissingCheckOut: boolean;
  /** 시급 출근만 있고 퇴근이 없는 지난 날(시급분 0원) */
  hourlyMissingCheckOut: boolean;
  /** 관리자가 직접 지정한 금액. 자동 계산이면 null. */
  payOverride: number | null;
  weeklyAllowanceStatus: string;
  /** 도급 전용 계약이면 true. 주휴수당을 주지 않습니다. (시급+도급은 false) */
  isPiece: boolean;
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
  totalHourlyPortion: number;
  totalPiecePortion: number;
  allowanceMinutes: number;
  pieceDays: number;
  pieceMissingDates: string[];
  missingCheckOutDates: string[];
  hourlyWage: number;
  weeklyAllowanceStatus: string;
  isPiece: boolean;
  contractType: string;
};

function formatKST(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getEmployeeObject(rawEmployee: EmployeeNested) {
  if (!rawEmployee) return null;
  return Array.isArray(rawEmployee) ? rawEmployee[0] || null : rawEmployee;
}

async function freezeMissingWageSnapshots(
  supabase: any,
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

// 근무시간 계산은 app/lib/workTime.ts 로 통합했습니다(과거 날짜는 이 파일의 기존 방식 그대로).

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

    const startUtc = `${startDate}T00:00:00+09:00`;
    const endUtc = `${endDate}T23:59:59.999+09:00`;

    // 총 건수를 먼저 받아 페이지 수를 정하고, 페이지를 동시에 요청합니다.
    // 순차 while 루프였을 때는 왕복 지연이 페이지 수만큼 곱해졌습니다
    // (전체기간 9,291행 = 10페이지 → 조회 1회에 9.6초).
    const { count, error: countError } = await supabase
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .gte("checked_at", startUtc)
      .lte("checked_at", endUtc);

    if (countError) {
      return NextResponse.json(
        { success: false, message: countError.message },
        { status: 500 }
      );
    }

    const totalCount = count ?? 0;
    const pageCount = Math.min(MAX_PAGES, Math.ceil(totalCount / PAGE_SIZE));

    const pages = await Promise.all(
      Array.from({ length: pageCount }, (_, index) =>
        supabase
          .from("attendance_records")
          .select(ATTENDANCE_SELECT)
          .gte("checked_at", startUtc)
          .lte("checked_at", endUtc)
          .order("checked_at", { ascending: true })
          // ★ id 타이브레이커 필수.
          //   checked_at 만으로 정렬하면 같은 시각 행이 많을 때
          //   (2026-06-02 09:30:00 한 시각에만 39건) 페이지마다 순서가 달라져
          //   경계에서 행이 중복되거나 누락됩니다.
          .order("id", { ascending: true })
          .range(index * PAGE_SIZE, index * PAGE_SIZE + PAGE_SIZE - 1)
      )
    );

    const pageError = pages.find((page) => page.error)?.error;

    if (pageError) {
      return NextResponse.json(
        { success: false, message: pageError.message },
        { status: 500 }
      );
    }

    const allRecords = pages.flatMap(
      (page) => (page.data || []) as unknown as AttendanceRecord[]
    );

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

    // 관리자가 직접 지정한 하루치 세전급여.
    // 있으면 근무시간 × 시급 대신 이 금액이 그 날 기본급이 됩니다.
    const loadedOverrides = await loadPayOverrides(
      supabase,
      startDate,
      endDate
    );

    if (loadedOverrides.error) {
      return NextResponse.json(
        {
          success: false,
          message: `세전급여 수정값 조회 실패: ${loadedOverrides.error}`,
        },
        { status: 500 }
      );
    }

    const payOverrides = loadedOverrides.overrides;

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
    const now = new Date();

    for (const key in grouped) {
      const items = [...grouped[key]].sort(
        (a, b) =>
          new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
      );

      const employee = getEmployeeObject(items[0]?.employees);
      const employeeId = items[0]?.employee_id;
      const employeeName = employee?.name || "이름없음";
      const workplaceName = employee?.workplace_name || "장사꾼";
      const weeklyAllowanceStatus =
        employee?.weekly_allowance_status || "검토필요";

      const date = formatKST(new Date(items[0].checked_at));

      const override = payOverrides.get(payOverrideKey(employeeId, date));

      // 시급분 + 도급분. 계산 규칙은 app/lib/dayPay.ts 한 곳에 있습니다.
      // (시급분은 시급 구간 기록만, 도급분은 도급 구간 출근+퇴근이 모두 있을 때 일급 스냅샷 전액)
      // 스냅샷이 비어 있으면 시급은 현재 시급, 일급은 현재 일급으로 대신 계산합니다.
      // now: 오늘 퇴근 전을 "누락"으로 잘못 잡지 않기 위해 넘깁니다.
      // estimate: false — 진행 중인 날은 기존처럼 0원(추정 금액을 지급액에 넣지 않음).
      const dayPay = calcDayPay(date, items, {
        fallbackHourlyWage: employee?.hourly_wage,
        fallbackDailyWage: getDailyWage(employee),
        override: override !== undefined ? override.grossPay : null,
        now,
        estimate: false,
      });

      const workedMinutes = dayPay.hourly.workedMinutes;
      const hours = workedMinutes / 60;
      const wage = dayPay.hourly.wage;
      const basePay = dayPay.basePay;
      const isPiece = isPieceContract(employee);

      dailyWorks.push({
        employeeId,
        employeeName,
        workplaceName,
        date,
        hours,
        workedMinutes,
        wage,
        basePay,
        hourlyPortion: dayPay.hourlyPortion,
        piecePortion: dayPay.piecePortion,
        allowanceMinutes: dayPay.allowanceMinutes,
        pieceMissingCheckOut: dayPay.piece.missingCheckOut,
        hourlyMissingCheckOut: dayPay.hourly.missingCheckOut,
        payOverride: override !== undefined ? override.grossPay : null,
        weeklyAllowanceStatus,
        isPiece,
        contractType: toContractType(employee?.contract_type),
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
          totalHourlyPortion: 0,
          totalPiecePortion: 0,
          allowanceMinutes: 0,
          pieceDays: 0,
          pieceMissingDates: [],
          missingCheckOutDates: [],
          hourlyWage: row.wage,
          weeklyAllowanceStatus: row.weeklyAllowanceStatus || "검토필요",
          isPiece: row.isPiece,
          contractType: row.contractType,
        };
      }

      weekly[key].totalHours += row.hours;
      weekly[key].totalMinutes += row.workedMinutes;
      weekly[key].totalBasePay += row.basePay;
      weekly[key].totalHourlyPortion += row.hourlyPortion;
      weekly[key].totalPiecePortion += row.piecePortion;
      weekly[key].allowanceMinutes += row.allowanceMinutes;
      if (row.piecePortion > 0) weekly[key].pieceDays += 1;
      if (row.pieceMissingCheckOut) weekly[key].pieceMissingDates.push(row.date);
      if (row.hourlyMissingCheckOut)
        weekly[key].missingCheckOutDates.push(row.date);
    }

    const result = Object.values(weekly).map((w) => {
      // 화면 표시는 시간 단위로 전달하되, 급여 계산은 소수점 반올림 시간이 아닌 총 분 기준으로 계산합니다.
      // 시급이 주 중간에 바뀐 경우를 위해 일별 기본급을 먼저 계산한 뒤 합산합니다.
      const totalHours = Number((w.totalMinutes / 60).toFixed(4));
      const basePay = Math.floor(w.totalBasePay);
      // 주휴수당 평균시급은 시급분만으로 계산합니다(도급 일급이 섞이면 시급이 부풀려짐).
      // 시급 구간만 있는 직원은 시급분 = 기본급이라 기존 계산과 같습니다.
      const hourlyBasePay = Math.floor(w.totalHourlyPortion);
      const averageHourlyWage =
        totalHours > 0 ? hourlyBasePay / totalHours : w.hourlyWage;

      let weeklyAllowance = 0;

      // 도급 전용 계약은 주휴수당 대상이 아닙니다. 시급+도급은 시급분만 대상입니다.
      // 15시간 판정 시간에 도급 구간을 넣을지는 dayPay.ts WEEKLY_ALLOWANCE_INCLUDES_PIECE_MINUTES.
      if (
        !w.isPiece &&
        w.weeklyAllowanceStatus === "대상" &&
        w.allowanceMinutes >= 15 * 60
      ) {
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
        contractType: w.contractType,
        basePay,
        /** 기본급 중 시급분 / 도급분 (직접지정한 날은 지정 금액 전체가 시급분) */
        hourlyBasePay,
        pieceBasePay: basePay - hourlyBasePay,
        pieceDays: w.pieceDays,
        /** 도급 출근만 있고 퇴근이 없어 일급을 주지 않은 날 */
        pieceMissingDates: w.pieceMissingDates,
        /** 시급 출근만 있고 퇴근이 없는 지난 날(오늘 퇴근 전은 제외) */
        missingCheckOutDates: w.missingCheckOutDates,
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