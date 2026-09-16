import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const {
      name,
      phone,
      resident_number,
      bank_name,
      account_number,
      workplaceName,
      employmentType,
      scheduleGroup,
      schedule_group,
      birthDate,
      phoneLast4,
      hourlyWage,
      weeklyAllowanceStatus,
      weeklyAllowanceReason,
      weeklyAllowanceNote,
      contract_start_date,
      contract_end_date,
    } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          message: "환경변수가 없습니다.",
        },
        { status: 500 }
      );
    }

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          message: "직원 id가 필요합니다.",
        },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const updatePayload: Record<string, unknown> = {};

    if (typeof name === "string") {
      updatePayload.name = name.trim();
    }

    if (typeof phone === "string") {
      updatePayload.phone = phone.trim();
    }

    if (typeof resident_number === "string") {
      updatePayload.resident_number = resident_number.trim();
    }

    if (typeof bank_name === "string") {
      updatePayload.bank_name = bank_name.trim();
    }

    if (typeof account_number === "string") {
      updatePayload.account_number = account_number.trim();
    }

    let nextWorkplaceName:
      | "장사꾼"
      | "헤모즈"
      | "깨소금"
      | "로엔티크"
      | undefined;

    if (typeof workplaceName === "string") {
      const trimmedWorkplaceName = workplaceName.trim();

      const allowedWorkplaces = [
        "장사꾼",
        "헤모즈",
        "깨소금",
        "로엔티크",
      ];

      if (!allowedWorkplaces.includes(trimmedWorkplaceName)) {
        return NextResponse.json(
          {
            success: false,
            message: "근무지 값이 올바르지 않습니다.",
          },
          { status: 400 }
        );
      }

      nextWorkplaceName = trimmedWorkplaceName as
        | "장사꾼"
        | "헤모즈"
        | "깨소금"
        | "로엔티크";

      updatePayload.workplace_name = nextWorkplaceName;

      // 깨소금, 로엔티크는 스케줄 역할그룹을 사용하지 않으므로 자동 초기화
      if (
        nextWorkplaceName === "깨소금" ||
        nextWorkplaceName === "로엔티크"
      ) {
        updatePayload.schedule_group = null;
      }
    }

    if (typeof employmentType === "string") {
      const trimmedEmploymentType = employmentType.trim();

      if (
        trimmedEmploymentType !== "fixed" &&
        trimmedEmploymentType !== "carrot"
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "고용형태 값이 올바르지 않습니다.",
          },
          { status: 400 }
        );
      }

      updatePayload.employment_type = trimmedEmploymentType;
    }

    const hasScheduleGroupField =
      Object.prototype.hasOwnProperty.call(body, "scheduleGroup") ||
      Object.prototype.hasOwnProperty.call(body, "schedule_group");

    if (
      hasScheduleGroupField &&
      nextWorkplaceName !== "깨소금" &&
      nextWorkplaceName !== "로엔티크"
    ) {
      const rawScheduleGroup =
        scheduleGroup !== undefined ? scheduleGroup : schedule_group;

      const trimmedScheduleGroup =
        typeof rawScheduleGroup === "string" ? rawScheduleGroup.trim() : "";

      let allowedScheduleGroups: string[] = [];

      if (nextWorkplaceName === "헤모즈") {
        allowedScheduleGroups = ["", "오픈", "주간"];
      } else {
        allowedScheduleGroups = [
          "",
          "랄라",
          "모아림",
          "몽글솜",
          "택배",
          "자수",
        ];
      }

      if (!allowedScheduleGroups.includes(trimmedScheduleGroup)) {
        return NextResponse.json(
          {
            success: false,
            message: "역할그룹 값이 올바르지 않습니다.",
          },
          { status: 400 }
        );
      }

      updatePayload.schedule_group = trimmedScheduleGroup || null;
    }

    if (typeof birthDate === "string") {
      updatePayload.birth_date = birthDate.trim();
    }

    if (typeof phoneLast4 === "string") {
      updatePayload.phone_last4 = phoneLast4.trim();
    }

    // 시급 변경은 "변경한 날짜 00:00(KST)"부터 새 시급을 적용합니다.
    // 예: 8/18까지 10,320원, 8/19에 10,500원으로 변경
    //     -> 8/18 이전 기록은 10,320원으로 고정
    //     -> 8/19 00:00 이후 기록은 10,500원으로 고정
    if (hourlyWage !== undefined) {
      const wageNumber = Number(hourlyWage);

      if (!Number.isFinite(wageNumber) || wageNumber < 0) {
        return NextResponse.json(
          {
            success: false,
            message: "올바른 시급을 입력해주세요.",
          },
          { status: 400 }
        );
      }

      const { data: currentEmployee, error: employeeReadError } = await supabase
        .from("employees")
        .select("hourly_wage")
        .eq("id", id)
        .maybeSingle();

      if (employeeReadError) {
        return NextResponse.json(
          {
            success: false,
            message: `기존 시급 조회 실패: ${employeeReadError.message}`,
          },
          { status: 500 }
        );
      }

      if (!currentEmployee) {
        return NextResponse.json(
          {
            success: false,
            message: "직원을 찾을 수 없습니다.",
          },
          { status: 404 }
        );
      }

      const previousWage = Number(currentEmployee.hourly_wage || 0);

      if (previousWage > 0 && previousWage !== wageNumber) {
        const kstDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        const effectiveStart = `${kstDate}T00:00:00+09:00`;

        // 변경일 이전의 구버전 기록 중 스냅샷이 비어 있는 것만
        // 변경 전 시급으로 고정합니다.
        const { error: pastSnapshotError } = await supabase
          .from("attendance_records")
          .update({ hourly_wage_snapshot: previousWage })
          .eq("employee_id", id)
          .lt("checked_at", effectiveStart)
          .is("hourly_wage_snapshot", null);

        if (pastSnapshotError) {
          return NextResponse.json(
            {
              success: false,
              message: `과거 시급 고정 실패: ${pastSnapshotError.message}`,
            },
            { status: 500 }
          );
        }

        // 변경일에 이미 출근/퇴근 기록이 생성돼 있어도
        // 그 날짜 전체에는 새 시급이 적용되도록 스냅샷을 새 시급으로 맞춥니다.
        const { error: currentSnapshotError } = await supabase
          .from("attendance_records")
          .update({ hourly_wage_snapshot: wageNumber })
          .eq("employee_id", id)
          .gte("checked_at", effectiveStart);

        if (currentSnapshotError) {
          return NextResponse.json(
            {
              success: false,
              message: `변경일 시급 적용 실패: ${currentSnapshotError.message}`,
            },
            { status: 500 }
          );
        }
      }

      updatePayload.hourly_wage = wageNumber;
    }

    if (typeof weeklyAllowanceStatus === "string") {
      updatePayload.weekly_allowance_status = weeklyAllowanceStatus;
    }

    if (typeof weeklyAllowanceReason === "string") {
      updatePayload.weekly_allowance_reason =
        weeklyAllowanceReason.trim();
    }

    if (typeof weeklyAllowanceNote === "string") {
      updatePayload.weekly_allowance_note = weeklyAllowanceNote.trim();
    }

    if (typeof contract_start_date === "string") {
      updatePayload.contract_start_date =
        contract_start_date.trim() || null;
    }

    if (typeof contract_end_date === "string") {
      updatePayload.contract_end_date =
        contract_end_date.trim() || null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "수정할 값이 없습니다.",
        },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("employees")
      .update(updatePayload)
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: error.message,
          debug: updatePayload,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "직원 정보가 수정되었습니다.",
      updated: updatePayload,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "알 수 없는 오류가 발생했습니다.";

    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status: 500 }
    );
  }
}
/**
 * 직원 삭제.
 *
 * ⚠️ 되돌릴 수 없습니다. 출퇴근 기록까지 함께 지웁니다.
 *    근로기준법상 임금대장·근로계약 서류는 3년 보존 대상이라
 *    원래는 비활성 처리를 쓰는 게 맞지만, 사용자 결정으로 완전 삭제를 지원합니다(2026-09-16).
 *
 * attendance_records / employee_devices 가 employees 를 FK 로 참조합니다.
 * FK 의 ON DELETE 동작(CASCADE/RESTRICT)에 의존하지 않도록
 * 자식 행을 명시적으로 먼저 지웁니다.
 *
 * ?dryRun=1 을 붙이면 아무것도 지우지 않고 삭제될 건수만 돌려줍니다.
 * 화면에서 확인 문구에 실제 건수를 띄우는 데 씁니다.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 삭제는 파급이 커서 이 라우트만 관리자 쿠키를 직접 확인합니다.
    // (미들웨어가 /api/admin 을 인증에서 제외하고 있습니다)
    const cookieHeader = request.headers.get("cookie") || "";

    if (!/(?:^|;\s*)admin_auth=ok(?:;|$)/.test(cookieHeader)) {
      return NextResponse.json(
        { success: false, message: "관리자 인증이 필요합니다." },
        { status: 401 }
      );
    }

    const employeeId = Number(id);

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return NextResponse.json(
        { success: false, message: "직원 id가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, message: "환경변수가 없습니다." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: employee, error: findError } = await supabase
      .from("employees")
      .select("id, name, workplace_name, is_active")
      .eq("id", employeeId)
      .maybeSingle();

    if (findError) {
      return NextResponse.json(
        { success: false, message: `직원 조회 실패: ${findError.message}` },
        { status: 500 }
      );
    }

    if (!employee) {
      return NextResponse.json(
        { success: false, message: "해당 직원을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const countOf = async (table: string) => {
      const { count } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("employee_id", employeeId);

      return count ?? 0;
    };

    const attendanceCount = await countOf("attendance_records");
    const deviceCount = await countOf("employee_devices");
    const scheduleCount = await countOf("weekly_schedules");

    const dryRun =
      new URL(request.url).searchParams.get("dryRun") === "1";

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        employee: {
          id: employee.id,
          name: employee.name,
          workplaceName: employee.workplace_name,
          isActive: employee.is_active,
        },
        counts: {
          attendance: attendanceCount,
          devices: deviceCount,
          schedules: scheduleCount,
        },
      });
    }

    // 지우기 전에 출퇴근 기록 원값을 감사 테이블에 남깁니다.
    // 삭제 자체는 되돌릴 수 없지만, 무엇이 있었는지는 남습니다.
    if (attendanceCount > 0) {
      const { data: doomed } = await supabase
        .from("attendance_records")
        .select("id, employee_id, record_type, checked_at")
        .eq("employee_id", employeeId);

      const rows = (doomed || []) as {
        id: number;
        employee_id: number;
        record_type: string;
        checked_at: string;
      }[];

      if (rows.length > 0) {
        const forwarded = request.headers.get("x-forwarded-for");

        const auditRows = rows.map((row) => ({
          record_id: row.id,
          employee_id: row.employee_id,
          action: "delete",
          field: "checked_at",
          old_value: row.checked_at,
          new_value: null,
          source: "admin-employee-delete",
          actor: "admin-ui",
          request_ip: forwarded
            ? forwarded.split(",")[0].trim()
            : request.headers.get("x-real-ip"),
          user_agent: request.headers.get("user-agent"),
        }));

        // 감사 기록 실패가 삭제를 막지는 않습니다(테이블 미생성 환경 대비).
        const { error: auditError } = await supabase
          .from("attendance_record_audit")
          .insert(auditRows);

        if (auditError) {
          console.error(
            "[employee-delete] 감사 기록 실패(삭제는 계속 진행):",
            auditError.message
          );
        }
      }
    }

    // 자식 → 부모 순서로 삭제. FK 동작에 의존하지 않습니다.
    for (const table of [
      "attendance_records",
      "employee_devices",
      "weekly_schedules",
    ]) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("employee_id", employeeId);

      if (error) {
        return NextResponse.json(
          {
            success: false,
            message: `${table} 삭제 실패: ${error.message}`,
          },
          { status: 500 }
        );
      }
    }

    const { data: deleted, error: deleteError } = await supabase
      .from("employees")
      .delete()
      .eq("id", employeeId)
      .select("id, name");

    if (deleteError) {
      return NextResponse.json(
        { success: false, message: `직원 삭제 실패: ${deleteError.message}` },
        { status: 500 }
      );
    }

    if (!deleted || deleted.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "직원이 삭제되지 않았습니다. 목록을 새로고침한 뒤 다시 시도해주세요.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${employee.name} 직원이 삭제되었습니다.`,
      deleted: {
        employeeName: employee.name,
        attendance: attendanceCount,
        devices: deviceCount,
        schedules: scheduleCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "직원 삭제 오류",
      },
      { status: 500 }
    );
  }
}
