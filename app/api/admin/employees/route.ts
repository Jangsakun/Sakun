import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, message: "환경변수가 없습니다." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase
      .from("employees")
      .select(
        `
        id,
        name,
        phone,
        resident_number,
        bank_name,
        account_number,
        workplace_name,
        employment_type,
        schedule_group,
        is_active,
        hourly_wage,
        weekly_allowance_status,
        weekly_allowance_reason,
        weekly_allowance_note,
        contract_start_date,
        contract_end_date,
        created_at
        `
      )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    const maskedData = (data || []).map((emp) => {
      const digits = (emp.resident_number || "").replace(/[^0-9]/g, "");

      let resident_number_masked = "-";

      if (digits.length === 13) {
        resident_number_masked = `${digits.slice(0, 6)}-${digits.slice(
          6,
          7
        )}******`;
      }

      const employmentType = emp.employment_type || "fixed";

      let weeklyAllowanceStatus =
        emp.weekly_allowance_status || "검토필요";

      if (employmentType === "fixed") {
        weeklyAllowanceStatus = "대상";
      }

      if (employmentType === "carrot") {
        weeklyAllowanceStatus = "비대상";
      }

      return {
        ...emp,
        workplace_name: emp.workplace_name || "장사꾼",
        employment_type: employmentType,
        schedule_group: emp.schedule_group || "",
        weekly_allowance_status: weeklyAllowanceStatus,
        resident_number_masked,
      };
    });

    return NextResponse.json({
      success: true,
      employees: maskedData,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";

    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
