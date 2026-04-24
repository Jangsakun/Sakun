import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const employeeId = url.searchParams.get("employeeId");

    if (!employeeId) {
      return NextResponse.json(
        { success: false, message: "employeeId가 없습니다." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, message: "Supabase 환경변수가 없습니다." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: contract, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("employee_id", Number(employeeId))
      .in("status", ["pending", "signed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      contract: contract || null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "계약서 조회 중 오류 발생";

    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}