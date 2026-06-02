import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function DELETE(request: Request) {
  try {
    const body = await request.json();

    const recordIds = Array.isArray(body.recordIds)
      ? body.recordIds
          .map((value: unknown) => Number(value))
          .filter((id: number) => Number.isFinite(id))
      : [];

    if (recordIds.length === 0) {
      return NextResponse.json(
        { success: false, message: "삭제할 기록 ID가 없습니다." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, message: "환경변수 없음" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { error } = await supabase
      .from("attendance_records")
      .delete()
      .in("id", recordIds);

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "삭제 완료",
    });
  } catch (error) {
    console.error("attendance delete error:", error);

    return NextResponse.json(
      { success: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}
