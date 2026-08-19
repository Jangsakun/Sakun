import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_WORKPLACES = ["장사꾼", "헤모즈", "깨소금", "로엔티크"];

function getKstDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * 관리자 수동 출퇴근 추가 시 사용할 당시 시급을 결정합니다.
 *
 * 우선순위
 * 1) 같은 날짜에 이미 저장된 hourly_wage_snapshot
 * 2) 과거 날짜라면 해당 날짜 이전 가장 최근 snapshot
 * 3) 오늘/미래 날짜 또는 과거 snapshot이 전혀 없으면 현재 employees.hourly_wage
 *
 * ※ 완전한 "시급 변경 이력" 테이블이 없는 현재 구조에서,
 *    과거 수동 추가가 현재 시급으로 잘못 저장되는 문제를 최대한 방지합니다.
 */
async function resolveManualHourlyWageSnapshot(
  supabase: any,
  employeeId: number,
  targetDate: string,
  currentHourlyWage: number
) {
  const dayStart = new Date(`${targetDate}T00:00:00+09:00`).toISOString();
  const dayEnd = new Date(`${targetDate}T23:59:59.999+09:00`).toISOString();

  // 1. 같은 날짜에 이미 스냅샷이 있으면 그 값을 사용
  const { data: sameDayRows, error: sameDayError } = await supabase
    .from("attendance_records")
    .select("hourly_wage_snapshot, checked_at")
    .eq("employee_id", employeeId)
    .gte("checked_at", dayStart)
    .lte("checked_at", dayEnd)
    .not("hourly_wage_snapshot", "is", null)
    .order("checked_at", { ascending: false })
    .limit(1);

  if (sameDayError) {
    throw new Error(`같은 날짜 시급 조회 실패: ${sameDayError.message}`);
  }

  const sameDayWage = Number(sameDayRows?.[0]?.hourly_wage_snapshot || 0);

  if (sameDayWage > 0) {
    return sameDayWage;
  }

  const todayKst = getKstDateKey();

  // 오늘 이후 날짜는 현재 시급을 사용
  if (targetDate >= todayKst) {
    return currentHourlyWage > 0 ? currentHourlyWage : 10320;
  }

  // 2. 과거 날짜라면 그 날짜까지의 가장 최근 시급 스냅샷을 사용
  const { data: previousRows, error: previousError } = await supabase
    .from("attendance_records")
    .select("hourly_wage_snapshot, checked_at")
    .eq("employee_id", employeeId)
    .lte("checked_at", dayEnd)
    .not("hourly_wage_snapshot", "is", null)
    .order("checked_at", { ascending: false })
    .limit(1);

  if (previousError) {
    throw new Error(`과거 시급 조회 실패: ${previousError.message}`);
  }

  const previousWage = Number(previousRows?.[0]?.hourly_wage_snapshot || 0);

  if (previousWage > 0) {
    return previousWage;
  }

  // 3. 과거 스냅샷 자체가 없는 아주 오래된 데이터는 현재 시급으로 fallback
  return currentHourlyWage > 0 ? currentHourlyWage : 10320;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { startDate, endDate } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          success: false,
          message: "환경변수 없음",
        },
        { status: 500 }
      );
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        {
          success: false,
          message: "시작일과 종료일이 필요합니다.",
        },
        { status: 400 }
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        {
          success: false,
          message: "시작일은 종료일보다 늦을 수 없습니다.",
        },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const startUtc = new Date(
      `${startDate}T00:00:00+09:00`
    ).toISOString();

    const endUtc = new Date(
      `${endDate}T23:59:59.999+09:00`
    ).toISOString();

    const { data, error } = await supabase
      .from("attendance_records")
      .select(
        `
        id,
        record_type,
        lat,
        lng,
        checked_at,
        created_at,
        employee_id,
        hourly_wage_snapshot,
        employees (
          id,
          name,
          birth_date,
          phone_last4,
          workplace_name
        )
      `
      )
      .gte("checked_at", startUtc)
      .lte("checked_at", endUtc)
      .order("checked_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: `조회 실패: ${error.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      records: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "관리자 조회 에러",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    const {
      employeeName,
      workplaceName,
      date,
      checkInTime,
      checkOutTime,
    } = body;

    const trimmedEmployeeName = String(
      employeeName || ""
    ).trim();

    const trimmedWorkplaceName = String(
      workplaceName || ""
    ).trim();

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          message: "환경변수 없음",
        },
        { status: 500 }
      );
    }

    if (
      !trimmedWorkplaceName ||
      !ALLOWED_WORKPLACES.includes(trimmedWorkplaceName)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "근무지를 선택해 주세요.",
        },
        { status: 400 }
      );
    }

    if (
      !trimmedEmployeeName ||
      !date ||
      !checkInTime
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "근무지, 직원, 날짜, 출근시간은 필수입니다.",
        },
        { status: 400 }
      );
    }

    const checkInDate = new Date(
      `${date}T${checkInTime}:00+09:00`
    );

    if (Number.isNaN(checkInDate.getTime())) {
      return NextResponse.json(
        {
          success: false,
          message: "출근시간이 올바르지 않습니다.",
        },
        { status: 400 }
      );
    }

    let checkOutDate: Date | null = null;

    if (checkOutTime) {
      checkOutDate = new Date(
        `${date}T${checkOutTime}:00+09:00`
      );

      if (Number.isNaN(checkOutDate.getTime())) {
        return NextResponse.json(
          {
            success: false,
            message: "퇴근시간이 올바르지 않습니다.",
          },
          { status: 400 }
        );
      }

      if (checkOutDate.getTime() < checkInDate.getTime()) {
        return NextResponse.json(
          {
            success: false,
            message:
              "퇴근시간은 출근시간보다 빠를 수 없습니다.",
          },
          { status: 400 }
        );
      }
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    const {
      data: employees,
      error: employeeError,
    } = await supabase
      .from("employees")
      .select(
        "id, name, is_active, workplace_name, hourly_wage"
      )
      .eq("name", trimmedEmployeeName)
      .eq("workplace_name", trimmedWorkplaceName)
      .eq("is_active", true);

    if (employeeError) {
      return NextResponse.json(
        {
          success: false,
          message: `직원 조회 실패: ${employeeError.message}`,
        },
        { status: 500 }
      );
    }

    if (!employees || employees.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: `${trimmedWorkplaceName} 근무지에서 '${trimmedEmployeeName}' 직원을 찾을 수 없습니다.`,
        },
        { status: 404 }
      );
    }

    if (employees.length > 1) {
      return NextResponse.json(
        {
          success: false,
          message:
            "선택한 근무지 안에서도 같은 이름의 직원이 여러 명 있습니다. 직원명 또는 직원 선택 방식으로 구분이 필요합니다.",
        },
        { status: 400 }
      );
    }

    const employee = employees[0];

    const currentHourlyWage = Number(
      employee.hourly_wage || 0
    );

    // 수동으로 과거 날짜를 추가할 때 현재 시급을 무조건 쓰지 않고,
    // 해당 날짜에 맞는 기존 시급 스냅샷을 찾아 사용합니다.
    const hourlyWageSnapshot =
      await resolveManualHourlyWageSnapshot(
        supabase,
        employee.id,
        String(date),
        currentHourlyWage
      );

    const rows: {
      employee_id: number;
      record_type: "check_in" | "check_out";
      checked_at: string;
      lat: null;
      lng: null;
      hourly_wage_snapshot: number;
    }[] = [
      {
        employee_id: employee.id,
        record_type: "check_in",
        checked_at: checkInDate.toISOString(),
        lat: null,
        lng: null,
        hourly_wage_snapshot: hourlyWageSnapshot,
      },
    ];

    if (checkOutDate) {
      rows.push({
        employee_id: employee.id,
        record_type: "check_out",
        checked_at: checkOutDate.toISOString(),
        lat: null,
        lng: null,
        hourly_wage_snapshot: hourlyWageSnapshot,
      });
    }

    const { error } = await supabase
      .from("attendance_records")
      .insert(rows);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: `수동 추가 실패: ${error.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "출퇴근 기록이 추가되었습니다.",
      hourlyWageSnapshot,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "출퇴근 수동 추가 에러",
      },
      { status: 500 }
    );
  }
}