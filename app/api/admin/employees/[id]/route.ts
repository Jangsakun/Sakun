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

    let nextWorkplaceName: "장사꾼" | "헤모즈" | "깨소금" | undefined;

    if (typeof workplaceName === "string") {
      const trimmedWorkplaceName = workplaceName.trim();

      const allowedWorkplaces = ["장사꾼", "헤모즈", "깨소금"];

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
        | "깨소금";

      updatePayload.workplace_name = nextWorkplaceName;

      // 깨소금은 스케줄 역할그룹을 사용하지 않으므로 자동 초기화
      if (nextWorkplaceName === "깨소금") {
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

    if (hasScheduleGroupField && nextWorkplaceName !== "깨소금") {
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