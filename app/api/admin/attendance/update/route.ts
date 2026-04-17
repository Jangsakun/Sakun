import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    const {
      checkInRecordId,
      checkOutRecordId,
      employeeId,
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

    if (!checkInTime && !checkOutTime) {
      return NextResponse.json(
        {
          success: false,
          message: "출근 또는 퇴근 시간 중 하나는 필요합니다.",
        },
        { status: 400 }
      );
    }

    if (!employeeId && (!checkInRecordId || !checkOutRecordId)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "새 기록을 만들려면 employeeId가 필요합니다. 관리자 목록 조회 데이터에 employeeId를 포함해주세요.",
        },
        { status: 400 }
      );
    }

    if (checkInTime && checkOutTime) {
      const inMs = new Date(checkInTime).getTime();
      const outMs = new Date(checkOutTime).getTime();

      if (Number.isNaN(inMs) || Number.isNaN(outMs)) {
        return NextResponse.json(
          {
            success: false,
            message: "출근 또는 퇴근 시간 형식이 올바르지 않습니다.",
          },
          { status: 400 }
        );
      }

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

    if (checkInTime) {
      const checkInIso = new Date(checkInTime).toISOString();

      if (checkInRecordId) {
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
      } else {
        const { error: checkInInsertError } = await supabase
          .from("attendance_records")
          .insert([
            {
              employee_id: employeeId,
              record_type: "check_in",
              checked_at: checkInIso,
              lat: null,
              lng: null,
            },
          ]);

        if (checkInInsertError) {
          return NextResponse.json(
            {
              success: false,
              message: `출근 기록 생성 실패: ${checkInInsertError.message}`,
            },
            { status: 500 }
          );
        }
      }
    }

    if (checkOutTime) {
      const checkOutIso = new Date(checkOutTime).toISOString();

      if (checkOutRecordId) {
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
      } else {
        const { error: checkOutInsertError } = await supabase
          .from("attendance_records")
          .insert([
            {
              employee_id: employeeId,
              record_type: "check_out",
              checked_at: checkOutIso,
              lat: null,
              lng: null,
            },
          ]);

        if (checkOutInsertError) {
          return NextResponse.json(
            {
              success: false,
              message: `퇴근 기록 생성 실패: ${checkOutInsertError.message}`,
            },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "출퇴근 시간이 저장되었습니다.",
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