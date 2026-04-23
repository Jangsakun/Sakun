import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const name = (searchParams.get("name") || "").trim();
    const birthDate = (searchParams.get("birthDate") || "").trim();
    const phoneLast4 = (searchParams.get("phoneLast4") || "").trim();
    const weekStartDate = (searchParams.get("weekStartDate") || "").trim();
    const weekEndDate = (searchParams.get("weekEndDate") || "").trim();

    if (!name || !birthDate || !phoneLast4 || !weekStartDate || !weekEndDate) {
      return NextResponse.json(
        {
          success: false,
          message: "필수값이 누락되었습니다.",
        },
        { status: 400 }
      );
    }

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

    const { data, error } = await supabase
      .from("weekly_schedules")
      .select("*")
      .eq("name", name)
      .eq("birth_date", birthDate)
      .eq("phone_last4", phoneLast4)
      .eq("week_start_date", weekStartDate)
      .eq("week_end_date", weekEndDate)
      .order("week_start_date", { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: error.message,
        },
        { status: 500 }
      );
    }

    const submitted = Array.isArray(data) && data.length > 0;

    return NextResponse.json({
      success: true,
      submitted,
      schedule: submitted ? data[0] : null,
    });
  } catch (error) {
    console.error("weekly-schedule status GET error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "제출 여부 조회 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}