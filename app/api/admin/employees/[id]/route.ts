import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { hourlyWage } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (!hourlyWage || hourlyWage < 0) {
      return NextResponse.json(
        { success: false, message: "시급이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("employees")
      .update({ hourly_wage: hourlyWage })
      .eq("id", params.id);

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "시급 수정 완료",
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}