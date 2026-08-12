import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_WORKPLACES = ["장사꾼", "헤모즈", "깨소금", "로엔티크"];

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

    const hourlyWage = Number(
      employee.hourly_wage || 0
    );

    const hourlyWageSnapshot =
      Number.isFinite(hourlyWage) && hourlyWage > 0
        ? hourlyWage
        : 10320;

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