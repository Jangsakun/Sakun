import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const name = url.searchParams.get("name");
    const residentNumber = url.searchParams.get("residentNumber");

    if (!name || !residentNumber) {
      return NextResponse.json(
        { success: false, message: "값 부족" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 직원 찾기
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select("id")
      .eq("name", name)
      .eq("resident_number", residentNumber)
      .single();

    if (empError || !employee) {
      return NextResponse.json(
        { success: false, message: "직원 없음" },
        { status: 404 }
      );
    }

    // 계약서 찾기
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("*")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (contractError || !contract) {
      return NextResponse.json({
        success: true,
        contract: null,
      });
    }

    return NextResponse.json({
      success: true,
      contract,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}