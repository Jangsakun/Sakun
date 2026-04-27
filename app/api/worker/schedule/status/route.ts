import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const name = String(searchParams.get("name") || "").trim();
    const birthDate = String(searchParams.get("birthDate") || "").trim();
    const phoneLast4 = String(searchParams.get("phoneLast4") || "").trim();
    const weekStartDate = String(searchParams.get("weekStartDate") || "").trim();
    const weekEndDate = String(searchParams.get("weekEndDate") || "").trim();

    if (!name || !birthDate || !phoneLast4 || !weekStartDate || !weekEndDate) {
      return NextResponse.json(
        { success: false, submitted: false, message: "필수값이 누락되었습니다." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();

    if (!supabase) {
      return NextResponse.json(
        { success: false, submitted: false, message: "환경변수 없음" },
        { status: 500 }
      );
    }

    const { data: schedule, error } = await supabase
      .from("weekly_schedules")
      .select("*")
      .eq("name", name)
      .eq("birth_date", birthDate)
      .eq("phone_last4", phoneLast4)
      .eq("week_start_date", weekStartDate)
      .eq("week_end_date", weekEndDate)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          submitted: false,
          message: "스케줄 조회 실패",
          debug: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      submitted: Boolean(schedule),
      schedule: schedule || null,
    });
  } catch (error) {
    console.error("worker schedule status GET error:", error);

    return NextResponse.json(
      {
        success: false,
        submitted: false,
        message: "서버 오류",
        debug: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}