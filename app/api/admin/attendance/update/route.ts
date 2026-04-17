import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    const {
      checkInRecordId,
      checkOutRecordId,
      employeeName,
      date,
      checkInTime,
      checkOutTime,
    } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          message: "SUPABASE_SERVICE_ROLE_KEY 또는 URL 환경변수가 없습니다.",
        },
        { status: 500 }
      );
    }

    if (!checkInRecordId && !checkOutRecordId) {
      return NextResponse.json(
        {
          success: false,
          message: "수정할 출근/퇴근 기록이 없습니다.",
        },
        { status: 400 }
      );
    }

    if (!checkInTime && !checkOutTime) {
      return NextResponse.json(
        {
          success: false,
          message: "출근 또는 퇴근 시간 중 하나는 필요합니다.",
        },
        { status: 400 }
      );
    }

    if (checkInTime && checkOutTime) {
      const inMs = new Date(checkInTime).getTime();
      const outMs = new Date(checkOutTime).getTime();

      if (outMs < inMs) {
        return NextResponse.json(
          {
            success: false,
            message: "퇴근 시간은 출근 시간보다 빠를 수 없습니다.",
          },
          { status: 400 }
        );
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (checkInRecordId && checkInTime) {
      const checkInIso = new Date(checkInTime).toISOString();

      const { error: checkInError } = await supabase
        .from("attendance_records")
        .update({
          checked_at: checkInIso,
        })
        .eq("id", checkInRecordId)
        .eq("record_type", "check_in");

      if (checkInError) {
        return NextResponse.json(
          {
            success: false,
            message: `출근 시간 수정 실패: ${checkInError.message}`,
          },
          { status: 500 }
        );
      }
    }

    if (checkOutRecordId && checkOutTime) {
      const checkOutIso = new Date(checkOutTime).toISOString();

      const { error: checkOutError } = await supabase
        .from("attendance_records")
        .update({
          checked_at: checkOutIso,
        })
        .eq("id", checkOutRecordId)
        .eq("record_type", "check_out");

      if (checkOutError) {
        return NextResponse.json(
          {
            success: false,
            message: `퇴근 시간 수정 실패: ${checkOutError.message}`,
          },
          { status: 500 }
        );
      }
    }

    if (!checkInRecordId && checkInTime) {
      return NextResponse.json(
        {
          success: false,
          message: `${employeeName || "직원"} ${date || ""} 기록에는 기존 출근 데이터가 없어 새로 만드는 기능은 아직 없습니다.`,
        },
        { status: 400 }
      );
    }

    if (!checkOutRecordId && checkOutTime) {
      return NextResponse.json(
        {
          success: false,
          message: `${employeeName || "직원"} ${date || ""} 기록에는 기존 퇴근 데이터가 없어 새로 만드는 기능은 아직 없습니다.`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "출퇴근 시간이 수정되었습니다.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "출퇴근 수정 오류",
      },
      { status: 500 }
    );
  }
}