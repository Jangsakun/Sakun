import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const employeeId = Number(url.searchParams.get("employeeId"));

    if (!employeeId || Number.isNaN(employeeId)) {
      return NextResponse.json(
        { success: false, message: "employeeId 오류" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: contract, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("employee_id", employeeId)
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
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "계약서 조회 중 오류 발생";

    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}