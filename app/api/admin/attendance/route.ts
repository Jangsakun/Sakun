import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logAttendanceChanges } from "@/app/lib/attendanceAudit";
import { loadPayOverrides } from "@/app/lib/payOverride";

const ALLOWED_WORKPLACES = ["장사꾼", "헤모즈", "깨소금", "로엔티크"];

/** 한 번에 추가할 수 있는 최대 기간(일). 실수로 몇 년치를 넣는 사고를 막습니다. */
const MAX_BULK_DAYS = 92;

/** 행 단위 입력에서 한 번에 보낼 수 있는 최대 줄 수. */
const MAX_ENTRY_ROWS = 200;

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

    // 세전급여 수정값은 금액이라 브라우저용 anon 키로는 읽지 못하게 막아뒀습니다.
    // 화면에서 "수정됨"을 표시하려면 같이 실어 보내야 합니다.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let payOverrides: {
      employeeId: number;
      date: string;
      grossPay: number;
      memo: string | null;
    }[] = [];

    let payOverrideWarning: string | null = null;

    if (serviceRoleKey) {
      const loaded = await loadPayOverrides(
        createClient(supabaseUrl, serviceRoleKey),
        startDate,
        endDate
      );

      if (loaded.error) {
        return NextResponse.json(
          {
            success: false,
            message: `세전급여 수정값 조회 실패: ${loaded.error}`,
          },
          { status: 500 }
        );
      }

      payOverrideWarning = loaded.warning;
      payOverrides = [...loaded.overrides.values()];
    }

    return NextResponse.json({
      success: true,
      records: data ?? [],
      payOverrides,
      payOverrideWarning,
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

/**
 * 행 단위 수동 추가.
 *
 * 직원마다 날짜·출퇴근 시간이 다를 수 있어, 한 줄이 곧 하루치 기록 하나입니다.
 * 한 줄이 실패해도 나머지는 계속 넣고 결과를 줄 단위로 돌려줍니다.
 */
async function handleEntryRows(
  request: Request,
  supabase: SupabaseClient,
  rawEntries: unknown[]
) {
  type RowResult = {
    index: number;
    employeeId: number;
    employeeName: string;
    date: string;
    success: boolean;
    message: string;
    insertedCount: number;
  };

  if (rawEntries.length > MAX_ENTRY_ROWS) {
    return NextResponse.json(
      {
        success: false,
        message: `한 번에 추가할 수 있는 줄은 최대 ${MAX_ENTRY_ROWS}개입니다.`,
      },
      { status: 400 }
    );
  }

  const parsed = rawEntries.map((raw, index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const employeeId = Number(item.employeeId);

    return {
      index,
      employeeId:
        Number.isInteger(employeeId) && employeeId > 0 ? employeeId : 0,
      date: String(item.date ?? "").trim(),
      checkInTime: String(item.checkInTime ?? "").trim(),
      checkOutTime: String(item.checkOutTime ?? "").trim(),
    };
  });

  // 직원 이름을 한 번에 받아둡니다(줄마다 조회하면 왕복이 줄 수만큼 늘어납니다).
  const ids = Array.from(
    new Set(parsed.map((item) => item.employeeId).filter((id) => id > 0))
  );

  const { data: employeeRows } = ids.length
    ? await supabase
        .from("employees")
        .select("id, name, is_active, hourly_wage")
        .in("id", ids)
    : { data: [] };

  const employeeMap = new Map(
    ((employeeRows || []) as {
      id: number;
      name: string;
      is_active: boolean;
      hourly_wage: number | null;
    }[]).map((item) => [item.id, item])
  );

  const results: RowResult[] = [];

  for (const entry of parsed) {
    const employee = employeeMap.get(entry.employeeId);
    const label = employee?.name ?? `${entry.index + 1}번째 줄`;

    const push = (message: string, success = false, insertedCount = 0) =>
      results.push({
        index: entry.index,
        employeeId: entry.employeeId,
        employeeName: label,
        date: entry.date,
        success,
        message,
        insertedCount,
      });

    if (!entry.employeeId) {
      push("직원을 선택해주세요.");
      continue;
    }

    if (!employee) {
      push("직원을 찾을 수 없습니다.");
      continue;
    }

    if (!employee.is_active) {
      push("비활성 직원입니다.");
      continue;
    }

    if (!entry.date) {
      push("날짜를 입력해주세요.");
      continue;
    }

    if (!entry.checkInTime) {
      push("출근시간을 입력해주세요.");
      continue;
    }

    const checkInAt = new Date(`${entry.date}T${entry.checkInTime}:00+09:00`);

    if (Number.isNaN(checkInAt.getTime())) {
      push("날짜 또는 출근시간이 올바르지 않습니다.");
      continue;
    }

    let checkOutAt: Date | null = null;

    if (entry.checkOutTime) {
      checkOutAt = new Date(`${entry.date}T${entry.checkOutTime}:00+09:00`);

      if (Number.isNaN(checkOutAt.getTime())) {
        push("퇴근시간이 올바르지 않습니다.");
        continue;
      }

      if (checkOutAt.getTime() < checkInAt.getTime()) {
        push("퇴근시간이 출근시간보다 빠릅니다.");
        continue;
      }
    }

    // 같은 날 기록이 이미 있으면 건너뜁니다.
    // 중복으로 넣으면 그 날 급여가 이중 계산됩니다.
    const { data: existing } = await supabase
      .from("attendance_records")
      .select("id")
      .eq("employee_id", entry.employeeId)
      .gte("checked_at", `${entry.date}T00:00:00+09:00`)
      .lte("checked_at", `${entry.date}T23:59:59.999+09:00`)
      .limit(1);

    if ((existing || []).length > 0) {
      push("이미 그 날 기록이 있어 건너뜀");
      continue;
    }

    try {
      const hourlyWageSnapshot = await resolveManualHourlyWageSnapshot(
        supabase,
        entry.employeeId,
        entry.date,
        Number(employee.hourly_wage || 0)
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
          employee_id: entry.employeeId,
          record_type: "check_in",
          checked_at: checkInAt.toISOString(),
          lat: null,
          lng: null,
          hourly_wage_snapshot: hourlyWageSnapshot,
        },
      ];

      if (checkOutAt) {
        rows.push({
          employee_id: entry.employeeId,
          record_type: "check_out",
          checked_at: checkOutAt.toISOString(),
          lat: null,
          lng: null,
          hourly_wage_snapshot: hourlyWageSnapshot,
        });
      }

      const { data: insertedRows, error } = await supabase
        .from("attendance_records")
        .insert(rows)
        .select("id, employee_id, record_type, checked_at");

      if (error || !insertedRows || insertedRows.length === 0) {
        push(error?.message || "기록이 추가되지 않았습니다.");
        continue;
      }

      await logAttendanceChanges(
        supabase,
        request,
        (
          insertedRows as {
            id: number;
            employee_id: number;
            record_type: string;
            checked_at: string;
          }[]
        ).map((row) => ({
          recordId: row.id,
          employeeId: row.employee_id,
          action: "insert" as const,
          field: "checked_at",
          oldValue: null,
          newValue: row.checked_at,
          source: "admin-manual-add" as const,
        }))
      );

      push("추가됨", true, insertedRows.length);
    } catch (error) {
      push(error instanceof Error ? error.message : "알 수 없는 오류");
    }
  }

  const added = results.filter((item) => item.success);
  const failed = results.filter((item) => !item.success);
  const skipped = failed.filter((item) => item.message.includes("건너뜀"));

  const summary = [`${added.length}건 추가`];

  if (skipped.length > 0)
    summary.push(`${skipped.length}건 건너뜀(이미 기록 있음)`);

  const realFailures = failed.length - skipped.length;

  if (realFailures > 0) summary.push(`${realFailures}건 실패`);

  if (added.length === 0) {
    return NextResponse.json(
      {
        success: false,
        message:
          skipped.length === failed.length && skipped.length > 0
            ? "추가된 기록이 없습니다. 선택한 날짜에 이미 기록이 있습니다."
            : "출퇴근 기록이 추가되지 않았습니다.",
        successCount: 0,
        failCount: failed.length,
        results,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    message: summary.join(", "),
    successCount: added.length,
    failCount: failed.length,
    results,
  });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    const {
      entries,
      employeeIds,
      employeeName,
      workplaceName,
      date,
      endDate,
      skipWeekends,
      checkInTime,
      checkOutTime,
    } = body;

    // 행 단위 입력이 오면 그쪽으로 처리합니다.
    // 직원마다 날짜·시간이 다른 경우를 위한 기본 경로입니다.
    if (Array.isArray(entries)) {
      const supabaseUrlForEntries = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKeyForEntries = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrlForEntries || !serviceRoleKeyForEntries) {
        return NextResponse.json(
          { success: false, message: "환경변수 없음" },
          { status: 500 }
        );
      }

      if (entries.length === 0) {
        return NextResponse.json(
          { success: false, message: "추가할 줄이 없습니다." },
          { status: 400 }
        );
      }

      return handleEntryRows(
        request,
        createClient(supabaseUrlForEntries, serviceRoleKeyForEntries),
        entries
      );
    }

    // 여러 명 동시 추가. employeeIds 가 오면 id 로 특정하므로 동명이인도 안전합니다.
    // employeeIds 가 없으면 기존 이름 1명 방식으로 동작합니다(하위 호환).
    const requestedIds = Array.isArray(employeeIds)
      ? Array.from(
          new Set(
            employeeIds
              .map((value: unknown) => Number(value))
              .filter((id: number) => Number.isInteger(id) && id > 0)
          )
        )
      : [];

    const isBulkMode = requestedIds.length > 0;

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
      (!isBulkMode && !trimmedEmployeeName) ||
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

    // 기간 추가. endDate 를 안 주면 하루만 처리합니다(기존 동작).
    const startDateKey = String(date);
    const endDateKey = String(endDate || date);

    if (endDateKey < startDateKey) {
      return NextResponse.json(
        {
          success: false,
          message: "종료일은 시작일보다 빠를 수 없습니다.",
        },
        { status: 400 }
      );
    }

    const targetDates: string[] = [];
    const skippedWeekendDates: string[] = [];

    {
      const cursor = new Date(`${startDateKey}T00:00:00+09:00`);
      const last = new Date(`${endDateKey}T00:00:00+09:00`);

      if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) {
        return NextResponse.json(
          { success: false, message: "날짜가 올바르지 않습니다." },
          { status: 400 }
        );
      }

      while (cursor.getTime() <= last.getTime()) {
        const key = getKstDateKey(cursor);

        // 요일 판정은 KST 기준으로 합니다.
        const weekday = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Seoul",
          weekday: "short",
        }).format(cursor);

        const isWeekend = weekday === "Sat" || weekday === "Sun";

        if (skipWeekends && isWeekend) {
          skippedWeekendDates.push(key);
        } else {
          targetDates.push(key);
        }

        cursor.setUTCDate(cursor.getUTCDate() + 1);

        // 실수로 몇 년치를 넣는 사고를 막습니다.
        if (targetDates.length + skippedWeekendDates.length > MAX_BULK_DAYS) {
          return NextResponse.json(
            {
              success: false,
              message: `한 번에 추가할 수 있는 기간은 최대 ${MAX_BULK_DAYS}일입니다.`,
            },
            { status: 400 }
          );
        }
      }
    }

    if (targetDates.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: skipWeekends
            ? "선택한 기간이 전부 주말이라 추가할 날짜가 없습니다."
            : "추가할 날짜가 없습니다.",
        },
        { status: 400 }
      );
    }

    // 시간 형식은 첫 날짜로 한 번만 검증합니다(모든 날짜에 같은 시간을 씁니다).
    const sampleCheckIn = new Date(
      `${targetDates[0]}T${checkInTime}:00+09:00`
    );

    if (Number.isNaN(sampleCheckIn.getTime())) {
      return NextResponse.json(
        {
          success: false,
          message: "출근시간이 올바르지 않습니다.",
        },
        { status: 400 }
      );
    }

    if (checkOutTime) {
      const sampleCheckOut = new Date(
        `${targetDates[0]}T${checkOutTime}:00+09:00`
      );

      if (Number.isNaN(sampleCheckOut.getTime())) {
        return NextResponse.json(
          {
            success: false,
            message: "퇴근시간이 올바르지 않습니다.",
          },
          { status: 400 }
        );
      }

      if (sampleCheckOut.getTime() < sampleCheckIn.getTime()) {
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

    const employeeQuery = supabase
      .from("employees")
      .select("id, name, is_active, workplace_name, hourly_wage")
      .eq("workplace_name", trimmedWorkplaceName)
      .eq("is_active", true);

    const { data: employees, error: employeeError } = isBulkMode
      ? await employeeQuery.in("id", requestedIds)
      : await employeeQuery.eq("name", trimmedEmployeeName);

    if (employeeError) {
      return NextResponse.json(
        {
          success: false,
          message: `직원 조회 실패: ${employeeError.message}`,
        },
        { status: 500 }
      );
    }

    // 조회에서 빠진 직원의 이름을 찾아둡니다.
    // "ID 148" 대신 실제 이름을 보여줘야 관리자가 누가 빠졌는지 알 수 있습니다.
    const resolveMissingNames = async (ids: number[]) => {
      if (ids.length === 0) return new Map<number, string>();

      const { data } = await supabase
        .from("employees")
        .select("id, name, is_active, workplace_name")
        .in("id", ids);

      return new Map(
        ((data || []) as {
          id: number;
          name: string;
          is_active: boolean;
          workplace_name: string | null;
        }[]).map((item) => [
          item.id,
          !item.is_active
            ? `${item.name} (비활성)`
            : item.workplace_name !== trimmedWorkplaceName
            ? `${item.name} (${item.workplace_name || "근무지 없음"})`
            : item.name,
        ])
      );
    };

    if (!employees || employees.length === 0) {
      const names = await resolveMissingNames(requestedIds);

      const results = requestedIds.map((id) => ({
        employeeId: id,
        employeeName: names.get(id) ?? `ID ${id}`,
        success: false,
        message: "해당 근무지의 활성 직원이 아닙니다.",
        insertedCount: 0,
      }));

      return NextResponse.json(
        {
          success: false,
          message: isBulkMode
            ? `${trimmedWorkplaceName} 근무지에서 선택한 직원을 찾을 수 없습니다.`
            : `${trimmedWorkplaceName} 근무지에서 '${trimmedEmployeeName}' 직원을 찾을 수 없습니다.`,
          successCount: 0,
          failCount: results.length,
          results,
        },
        { status: 404 }
      );
    }

    // 이름 방식일 때만 동명이인을 막습니다. id 방식은 애초에 갈릴 일이 없습니다.
    if (!isBulkMode && employees.length > 1) {
      return NextResponse.json(
        {
          success: false,
          message:
            "선택한 근무지 안에서도 같은 이름의 직원이 여러 명 있습니다. 직원명 또는 직원 선택 방식으로 구분이 필요합니다.",
        },
        { status: 400 }
      );
    }

    type TargetEmployee = {
      id: number;
      name: string;
      hourly_wage: number | null;
    };

    const targets = employees as TargetEmployee[];

    // 요청했는데 조회되지 않은 id(비활성이거나 다른 근무지)는 따로 보고합니다.
    const foundIds = new Set(targets.map((item) => item.id));
    const missingIds = requestedIds.filter((id) => !foundIds.has(id));

    type PerEmployeeResult = {
      employeeId: number;
      employeeName: string;
      success: boolean;
      message: string;
      insertedCount: number;
      addedDates: string[];
      /** 이미 기록이 있어 건너뛴 날. 중복 추가는 급여 이중 계산으로 이어집니다. */
      skippedDates: string[];
      failedDates: string[];
    };

    const results: PerEmployeeResult[] = [];

    const rangeStartUtc = `${targetDates[0]}T00:00:00+09:00`;
    const rangeEndUtc = `${targetDates[targetDates.length - 1]}T23:59:59.999+09:00`;

    // 직원마다 시급 스냅샷이 다를 수 있어 한 명씩, 날짜별로 처리합니다.
    // 한 건이 실패해도 나머지는 계속 진행하고 결과를 전부 돌려줍니다.
    for (const employee of targets) {
      const addedDates: string[] = [];
      const skippedDates: string[] = [];
      const failedDates: string[] = [];
      let insertedCount = 0;

      try {
        // 이미 기록이 있는 날을 미리 한 번에 조회합니다.
        // 날짜마다 조회하면 왕복이 날짜 수만큼 늘어납니다.
        const { data: existing } = await supabase
          .from("attendance_records")
          .select("checked_at")
          .eq("employee_id", employee.id)
          .gte("checked_at", rangeStartUtc)
          .lte("checked_at", rangeEndUtc);

        const existingDates = new Set(
          ((existing || []) as { checked_at: string }[]).map((row) =>
            getKstDateKey(new Date(row.checked_at))
          )
        );

        const currentHourlyWage = Number(employee.hourly_wage || 0);

        for (const targetDate of targetDates) {
          // 그 날 이미 기록이 있으면 건너뜁니다.
          // 덮어쓰지 않는 이유: 기존 기록이 실제 출퇴근일 수 있고,
          // 중복으로 넣으면 급여가 이중 계산됩니다.
          if (existingDates.has(targetDate)) {
            skippedDates.push(targetDate);
            continue;
          }

          const checkInAt = new Date(
            `${targetDate}T${checkInTime}:00+09:00`
          );

          const checkOutAt = checkOutTime
            ? new Date(`${targetDate}T${checkOutTime}:00+09:00`)
            : null;

          // 수동으로 과거 날짜를 추가할 때 현재 시급을 무조건 쓰지 않고,
          // 해당 날짜에 맞는 기존 시급 스냅샷을 찾아 사용합니다.
          const hourlyWageSnapshot = await resolveManualHourlyWageSnapshot(
            supabase,
            employee.id,
            targetDate,
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
              checked_at: checkInAt.toISOString(),
              lat: null,
              lng: null,
              hourly_wage_snapshot: hourlyWageSnapshot,
            },
          ];

          if (checkOutAt) {
            rows.push({
              employee_id: employee.id,
              record_type: "check_out",
              checked_at: checkOutAt.toISOString(),
              lat: null,
              lng: null,
              hourly_wage_snapshot: hourlyWageSnapshot,
            });
          }

          const { data: insertedRows, error } = await supabase
            .from("attendance_records")
            .insert(rows)
            .select("id, employee_id, record_type, checked_at");

          if (error || !insertedRows || insertedRows.length === 0) {
            failedDates.push(targetDate);
            continue;
          }

          insertedCount += insertedRows.length;
          addedDates.push(targetDate);

          // 감사 기록은 실패해도 추가를 되돌리지 않습니다(이미 성공).
          await logAttendanceChanges(
            supabase,
            request,
            (
              insertedRows as {
                id: number;
                employee_id: number;
                record_type: string;
                checked_at: string;
              }[]
            ).map((row) => ({
              recordId: row.id,
              employeeId: row.employee_id,
              action: "insert" as const,
              field: "checked_at",
              oldValue: null,
              newValue: row.checked_at,
              source: "admin-manual-add" as const,
            }))
          );
        }

        const parts: string[] = [];

        if (addedDates.length > 0) parts.push(`${addedDates.length}일 추가`);
        if (skippedDates.length > 0)
          parts.push(`${skippedDates.length}일 건너뜀(이미 기록 있음)`);
        if (failedDates.length > 0) parts.push(`${failedDates.length}일 실패`);

        results.push({
          employeeId: employee.id,
          employeeName: employee.name,
          success: addedDates.length > 0,
          message: parts.join(", ") || "추가된 날짜 없음",
          insertedCount,
          addedDates,
          skippedDates,
          failedDates,
        });
      } catch (error) {
        results.push({
          employeeId: employee.id,
          employeeName: employee.name,
          success: false,
          message:
            error instanceof Error ? error.message : "알 수 없는 오류",
          insertedCount,
          addedDates,
          skippedDates,
          failedDates,
        });
      }
    }

    const missingNames = await resolveMissingNames(missingIds);

    missingIds.forEach((id) => {
      results.push({
        employeeId: id,
        employeeName: missingNames.get(id) ?? `ID ${id}`,
        success: false,
        message: "해당 근무지의 활성 직원이 아닙니다.",
        insertedCount: 0,
        addedDates: [],
        skippedDates: [],
        failedDates: [],
      });
    });

    const successResults = results.filter((item) => item.success);
    const failedResults = results.filter((item) => !item.success);
    const totalAddedDays = results.reduce(
      (sum, item) => sum + item.addedDates.length,
      0
    );
    const totalSkippedDays = results.reduce(
      (sum, item) => sum + item.skippedDates.length,
      0
    );

    const rangeText =
      targetDates.length > 1
        ? `${targetDates[0]} ~ ${targetDates[targetDates.length - 1]} (${
            targetDates.length
          }일)`
        : targetDates[0];

    // 전부 실패면 요청 자체를 실패로 돌려 화면이 성공으로 오해하지 않게 합니다.
    if (successResults.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            totalSkippedDays > 0
              ? "추가된 기록이 없습니다. 선택한 날짜에 이미 기록이 있습니다."
              : "출퇴근 기록이 추가되지 않았습니다.",
          range: rangeText,
          successCount: 0,
          failCount: failedResults.length,
          totalAddedDays: 0,
          totalSkippedDays,
          skippedWeekendCount: skippedWeekendDates.length,
          results,
        },
        { status: 500 }
      );
    }

    const summaryParts = [
      `${successResults.length}명 / 총 ${totalAddedDays}일치 추가`,
    ];

    if (totalSkippedDays > 0)
      summaryParts.push(`${totalSkippedDays}일 건너뜀(이미 기록 있음)`);
    if (skippedWeekendDates.length > 0)
      summaryParts.push(`주말 ${skippedWeekendDates.length}일 제외`);
    if (failedResults.length > 0)
      summaryParts.push(`${failedResults.length}명 실패`);

    return NextResponse.json({
      success: true,
      message: summaryParts.join(", "),
      range: rangeText,
      successCount: successResults.length,
      failCount: failedResults.length,
      totalAddedDays,
      totalSkippedDays,
      skippedWeekendCount: skippedWeekendDates.length,
      results,
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