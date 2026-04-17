import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { name, birth_date, phone_last4 } = body;

  const pathnameParts = new URL(request.url).pathname.split("/");
  const id = pathnameParts[pathnameParts.length - 1];

  if (!id) {
    return NextResponse.json({
      success: false,
      message: "직원 id가 없습니다.",
    });
  }

  const { error } = await supabase
    .from("employees")
    .update({
      name,
      birth_date,
      phone_last4,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    });
  }

  return NextResponse.json({
    success: true,
  });
}