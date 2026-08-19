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