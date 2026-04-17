import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("employees")
    .select("id, name, birth_date, phone_last4, is_active, created_at")
    .order("id", { ascending: false });

  if (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    });
  }

  return NextResponse.json({
    success: true,
    employees: data,
  });
}