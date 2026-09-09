import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  logAttendanceChanges,
  readCheckedAt,
  type AuditEntry,
} from "@/app/lib/attendanceAudit";

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
      const inMs = new Date(`${checkInTime}:00+09:00`).getTime();
      const outMs = new Date(`${checkOutTime}:00+09:00`).getTime();

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

    // 성공한 변경만 모아 마지막에 한 번 기록합니다.
    const auditEntries: AuditEntry[] = [];
    const numericEmployeeId = Number(employeeId);
    const auditEmployeeId = Number.isFinite(numericEmployeeId)
      ? numericEmployeeId
      : null;

    if (checkInTime) {
      const checkInIso = new Date(`${checkInTime}:00+09:00`).toISOString();

      if (checkInRecordId) {
        // 감사에 남길 원값을 수정 직전에 읽습니다.
        const previousCheckedAt = await readCheckedAt(
          supabase,
          Number(checkInRecordId)
        );

        // .select() 로 실제 반영된 행을 받아옵니다.
        // Supabase 는 0행이 매칭돼도 error 가 null 이므로,
        // 이 검사가 없으면 아무것도 저장하지 않고 성공으로 보고하게 됩니다.
        const { data: updatedCheckIn, error: checkInError } = await supabase
          .from("attendance_records")
          .update({
            checked_at: checkInIso,
          })
          .eq("id", checkInRecordId)
          .eq("record_type", "check_in")
          .select("id, employee_id, checked_at");

        if (checkInError) {
          return NextResponse.json(
            {
              success: false,
              message: `출근 시간 수정 실패: ${checkInError.message}`,
            },
            { status: 500 }
          );
        }

        if (!updatedCheckIn || updatedCheckIn.length === 0) {
          return NextResponse.json(
            {
              success: false,
              message:
                "해당 출근 기록을 찾을 수 없어 저장되지 않았습니다. 목록을 새로고침한 뒤 다시 시도해주세요.",
            },
            { status: 404 }
          );
        }

        const row = updatedCheckIn[0] as {
          id: number;
          employee_id: number;
          checked_at: string;
        };

        auditEntries.push({
          recordId: row.id,
          employeeId: row.employee_id ?? auditEmployeeId,
          action: "update",
          field: "checked_at",
          oldValue: previousCheckedAt,
          newValue: row.checked_at,
          source: "admin-time-edit",
        });
      } else {
        const { data: insertedCheckIn, error: checkInInsertError } =
          await supabase
            .from("attendance_records")
            .insert([
              {
                employee_id: employeeId,
                record_type: "check_in",
                checked_at: checkInIso,
                lat: null,
                lng: null,
              },
            ])
            .select("id, employee_id, checked_at");

        if (checkInInsertError) {
          return NextResponse.json(
            {
              success: false,
              message: `출근 기록 생성 실패: ${checkInInsertError.message}`,
            },
            { status: 500 }
          );
        }

        if (!insertedCheckIn || insertedCheckIn.length === 0) {
          return NextResponse.json(
            {
              success: false,
              message: "출근 기록이 생성되지 않았습니다. 다시 시도해주세요.",
            },
            { status: 500 }
          );
        }

        const row = insertedCheckIn[0] as {
          id: number;
          employee_id: number;
          checked_at: string;
        };

        auditEntries.push({
          recordId: row.id,
          employeeId: row.employee_id ?? auditEmployeeId,
          action: "insert",
          field: "checked_at",
          oldValue: null,
          newValue: row.checked_at,
          source: "admin-time-edit",
        });
      }
    }

    if (checkOutTime) {
      const checkOutIso = new Date(`${checkOutTime}:00+09:00`).toISOString();

      if (checkOutRecordId) {
        const previousCheckedAt = await readCheckedAt(
          supabase,
          Number(checkOutRecordId)
        );

        const { data: updatedCheckOut, error: checkOutError } = await supabase
          .from("attendance_records")
          .update({
            checked_at: checkOutIso,
          })
          .eq("id", checkOutRecordId)
          .eq("record_type", "check_out")
          .select("id, employee_id, checked_at");

        if (checkOutError) {
          return NextResponse.json(
            {
              success: false,
              message: `퇴근 시간 수정 실패: ${checkOutError.message}`,
            },
            { status: 500 }
          );
        }

        if (!updatedCheckOut || updatedCheckOut.length === 0) {
          return NextResponse.json(
            {
              success: false,
              message:
                "해당 퇴근 기록을 찾을 수 없어 저장되지 않았습니다. 목록을 새로고침한 뒤 다시 시도해주세요.",
            },
            { status: 404 }
          );
        }

        const row = updatedCheckOut[0] as {
          id: number;
          employee_id: number;
          checked_at: string;
        };

        auditEntries.push({
          recordId: row.id,
          employeeId: row.employee_id ?? auditEmployeeId,
          action: "update",
          field: "checked_at",
          oldValue: previousCheckedAt,
          newValue: row.checked_at,
          source: "admin-time-edit",
        });
      } else {
        const { data: insertedCheckOut, error: checkOutInsertError } =
          await supabase
            .from("attendance_records")
            .insert([
              {
                employee_id: employeeId,
                record_type: "check_out",
                checked_at: checkOutIso,
                lat: null,
                lng: null,
              },
            ])
            .select("id, employee_id, checked_at");

        if (checkOutInsertError) {
          return NextResponse.json(
            {
              success: false,
              message: `퇴근 기록 생성 실패: ${checkOutInsertError.message}`,
            },
            { status: 500 }
          );
        }

        if (!insertedCheckOut || insertedCheckOut.length === 0) {
          return NextResponse.json(
            {
              success: false,
              message: "퇴근 기록이 생성되지 않았습니다. 다시 시도해주세요.",
            },
            { status: 500 }
          );
        }

        const row = insertedCheckOut[0] as {
          id: number;
          employee_id: number;
          checked_at: string;
        };

        auditEntries.push({
          recordId: row.id,
          employeeId: row.employee_id ?? auditEmployeeId,
          action: "insert",
          field: "checked_at",
          oldValue: null,
          newValue: row.checked_at,
          source: "admin-time-edit",
        });
      }
    }

    // 감사 기록은 실패해도 요청을 실패시키지 않습니다(변경은 이미 성공).
    await logAttendanceChanges(supabase, request, auditEntries);

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
