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
      birthDate,
      phoneLast4,
      hourlyWage,
      weeklyAllowanceStatus,
      weeklyAllowanceReason,
      weeklyAllowanceNote,
    } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, message: "환경변수가 없습니다." },
        { status: 500 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { success: false, message: "직원 id가 필요합니다." },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const updatePayload: Record<string, unknown> = {};

    if (typeof name === "string") {
      updatePayload.name = name.trim();
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
          { success: false, message: "올바른 시급을 입력해주세요." },
          { status: 400 }
        );
      }

      updatePayload.hourly_wage = wageNumber;
    }

    if (typeof weeklyAllowanceStatus === "string") {
      if (!["대상", "비대상", "검토필요"].includes(weeklyAllowanceStatus)) {
        return NextResponse.json(
          { success: false, message: "주휴수당 상태값이 올바르지 않습니다." },
          { status: 400 }
        );
      }

      updatePayload.weekly_allowance_status = weeklyAllowanceStatus;
    }

    if (typeof weeklyAllowanceReason === "string") {
      updatePayload.weekly_allowance_reason = weeklyAllowanceReason.trim();
    }

    if (typeof weeklyAllowanceNote === "string") {
      updatePayload.weekly_allowance_note = weeklyAllowanceNote.trim();
    }

    const { error } = await supabase
      .from("employees")
      .update(updatePayload)
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "직원 정보가 수정되었습니다.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";

    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}