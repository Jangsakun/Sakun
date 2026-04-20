import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { name, birth_date, phone_last4, hourlyWage } = body;

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

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const updateData: {
      name?: string;
      birth_date?: string;
      phone_last4?: string;
      hourly_wage?: number;
    } = {};

    if (name !== undefined) updateData.name = name;
    if (birth_date !== undefined) updateData.birth_date = birth_date;
    if (phone_last4 !== undefined) updateData.phone_last4 = phone_last4;
    if (hourlyWage !== undefined) updateData.hourly_wage = hourlyWage;

    const { error } = await supabase
      .from("employees")
      .update(updateData)
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "직원 정보가 수정되었습니다.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "직원 수정 중 오류 발생",
      },
      { status: 500 }
    );
  }
}