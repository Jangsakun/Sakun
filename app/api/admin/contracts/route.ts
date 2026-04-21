import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const {
      employeeId,
      contractStartDate,
      contractEndDate,
    } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, message: "환경변수가 없습니다." },
        { status: 500 }
      );
    }

    if (!employeeId) {
      return NextResponse.json(
        { success: false, message: "직원 ID가 필요합니다." },
        { status: 400 }
      );
    }

    if (!contractStartDate || !contractEndDate) {
      return NextResponse.json(
        { success: false, message: "계약 시작일과 종료일을 입력해주세요." },
        { status: 400 }
      );
    }

    if (contractStartDate > contractEndDate) {
      return NextResponse.json(
        { success: false, message: "계약 시작일은 종료일보다 늦을 수 없습니다." },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { error } = await supabase
      .from("employees")
      .update({
        contract_start_date: contractStartDate,
        contract_end_date: contractEndDate,
      })
      .eq("id", employeeId);

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "근로계약 기간이 저장되었습니다.",
      contractStartDate,
      contractEndDate,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}