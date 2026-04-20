import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    const { name, birth_date, phone_last4, hourlyWage } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (birth_date !== undefined) updateData.birth_date = birth_date;
    if (phone_last4 !== undefined) updateData.phone_last4 = phone_last4;
    if (hourlyWage !== undefined) updateData.hourly_wage = hourlyWage;

    const { error } = await supabase
      .from("employees")
      .update(updateData)
      .eq("id", params.id);

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "수정 완료",
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}