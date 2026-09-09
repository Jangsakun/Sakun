import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  logAttendanceChanges,
  readRecordsForDelete,
} from "@/app/lib/attendanceAudit";

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

    // 삭제는 되돌릴 수 없으므로 원값을 삭제 직전에 확보합니다.
    const targets = await readRecordsForDelete(supabase, recordIds);

    // .select() 로 실제 삭제된 행을 받아옵니다.
    // Supabase 는 0행이 매칭돼도 error 가 null 이므로,
    // 이 검사가 없으면 아무것도 삭제하지 않고 성공으로 보고하게 됩니다.
    const { data: deletedRows, error } = await supabase
      .from("attendance_records")
      .delete()
      .in("id", recordIds)
      .select("id, employee_id, record_type, checked_at");

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    if (!deletedRows || deletedRows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "해당 출퇴근 기록을 찾을 수 없어 삭제되지 않았습니다. 목록을 새로고침한 뒤 다시 시도해주세요.",
        },
        { status: 404 }
      );
    }

    const deleted = deletedRows as {
      id: number;
      employee_id: number;
      record_type: string;
      checked_at: string;
    }[];

    // 원값은 삭제 전 조회분을 우선 사용하고, 못 읽었으면 삭제 응답값으로 대체합니다.
    const beforeMap = new Map(targets.map((row) => [row.id, row]));

    // 감사 기록은 실패해도 요청을 실패시키지 않습니다(삭제는 이미 성공).
    await logAttendanceChanges(
      supabase,
      request,
      deleted.map((row) => {
        const before = beforeMap.get(row.id);

        return {
          recordId: row.id,
          employeeId: before?.employee_id ?? row.employee_id,
          action: "delete" as const,
          field: "checked_at",
          oldValue: before?.checked_at ?? row.checked_at,
          newValue: null,
          source: "admin-delete" as const,
        };
      })
    );

    return NextResponse.json({
      success: true,
      message: "삭제 완료",
      deletedCount: deleted.length,
    });
  } catch (error) {
    console.error("attendance delete error:", error);

    return NextResponse.json(
      { success: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}
