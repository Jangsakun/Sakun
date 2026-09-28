import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logAttendanceChanges } from "@/app/lib/attendanceAudit";

/**
 * 하루치 세전급여 직접 지정.
 *
 * PUT { employeeId, date, grossPay, memo? }
 *   grossPay 가 숫자면 그 날 급여를 그 금액으로 고정합니다.
 *   grossPay 가 null 이면 고정을 풀고 자동 계산(근무시간 × 시급)으로 되돌립니다.
 *
 * 여기서 정한 금액은 급여 탭과 은행제출용 다건이체까지 그대로 흘러갑니다.
 * 즉 실제 송금액이 바뀝니다. 그래서 검증을 느슨하게 두지 않았습니다.
 */

/** 하루 급여 상한. 오타로 0 을 더 붙이는 사고를 막습니다. */
const MAX_GROSS_PAY = 100000000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isAdmin(request: Request) {
  const cookie = request.headers.get("cookie") || "";

  return /(?:^|;\s*)admin_auth=ok(?:;|$)/.test(cookie);
}

export async function PUT(request: Request) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        { success: false, message: "관리자 로그인이 필요합니다." },
        { status: 401 }
      );
    }

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

    const body = await request.json();
    const employeeId = Number(body?.employeeId);
    const date = String(body?.date ?? "").trim();
    const rawGrossPay = body?.grossPay;
    const memo = String(body?.memo ?? "").trim() || null;

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return NextResponse.json(
        { success: false, message: "직원을 찾을 수 없습니다." },
        { status: 400 }
      );
    }

    if (!DATE_PATTERN.test(date)) {
      return NextResponse.json(
        { success: false, message: "날짜가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const clearing = rawGrossPay === null || rawGrossPay === "";
    let grossPay = 0;

    if (!clearing) {
      grossPay = Number(rawGrossPay);

      if (!Number.isFinite(grossPay)) {
        return NextResponse.json(
          { success: false, message: "금액은 숫자로 입력해주세요." },
          { status: 400 }
        );
      }

      if (!Number.isInteger(grossPay)) {
        return NextResponse.json(
          { success: false, message: "금액은 원 단위 정수로 입력해주세요." },
          { status: 400 }
        );
      }

      if (grossPay < 0) {
        return NextResponse.json(
          { success: false, message: "금액은 0원 이상이어야 합니다." },
          { status: 400 }
        );
      }

      if (grossPay > MAX_GROSS_PAY) {
        return NextResponse.json(
          {
            success: false,
            message: `하루 세전급여가 ${MAX_GROSS_PAY.toLocaleString()}원을 넘습니다. 자릿수를 확인해주세요.`,
          },
          { status: 400 }
        );
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id, name")
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError) {
      return NextResponse.json(
        { success: false, message: `직원 조회 실패: ${employeeError.message}` },
        { status: 500 }
      );
    }

    if (!employee) {
      return NextResponse.json(
        { success: false, message: "직원을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 그 날 출퇴근 기록이 없으면 금액을 고정해도 지급되지 않습니다.
    // 고쳤다고 생각하고 넘어가는 것이 제일 위험하므로 미리 막습니다.
    const { data: dayRecords, error: dayError } = await supabase
      .from("attendance_records")
      .select("id")
      .eq("employee_id", employeeId)
      .gte("checked_at", `${date}T00:00:00+09:00`)
      .lte("checked_at", `${date}T23:59:59.999+09:00`)
      .limit(1);

    if (dayError) {
      return NextResponse.json(
        { success: false, message: `기록 조회 실패: ${dayError.message}` },
        { status: 500 }
      );
    }

    if (!clearing && (dayRecords || []).length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: `${date} 에 ${employee.name} 님의 출퇴근 기록이 없습니다. 기록을 먼저 추가해주세요.`,
        },
        { status: 400 }
      );
    }

    // 감사에 남길 원값을 먼저 읽어둡니다.
    const { data: previous } = await supabase
      .from("attendance_pay_override")
      .select("gross_pay")
      .eq("employee_id", employeeId)
      .eq("work_date", date)
      .maybeSingle();

    const oldValue =
      previous === null || previous === undefined
        ? null
        : String((previous as { gross_pay: number }).gross_pay);

    if (clearing) {
      const { data: deleted, error: deleteError } = await supabase
        .from("attendance_pay_override")
        .delete()
        .eq("employee_id", employeeId)
        .eq("work_date", date)
        .select("id");

      if (deleteError) {
        return NextResponse.json(
          { success: false, message: `해제 실패: ${deleteError.message}` },
          { status: 500 }
        );
      }

      if ((deleted || []).length === 0) {
        // 원래 고정값이 없던 날. 이미 자동 계산이므로 바뀐 것이 없습니다.
        return NextResponse.json({
          success: true,
          cleared: true,
          changed: false,
          message: "이미 자동 계산 상태입니다.",
        });
      }

      await logAttendanceChanges(supabase, request, [
        {
          recordId: null,
          employeeId,
          action: "delete",
          field: "gross_pay",
          oldValue,
          newValue: null,
          source: "admin-pay-override",
          workDate: date,
        },
      ]);

      return NextResponse.json({
        success: true,
        cleared: true,
        changed: true,
        message: `${employee.name} 님 ${date} 세전급여를 자동 계산으로 되돌렸습니다.`,
      });
    }

    const { data: saved, error: saveError } = await supabase
      .from("attendance_pay_override")
      .upsert(
        {
          employee_id: employeeId,
          work_date: date,
          gross_pay: grossPay,
          memo,
        },
        { onConflict: "employee_id,work_date" }
      )
      .select("id, gross_pay");

    if (saveError) {
      return NextResponse.json(
        { success: false, message: `저장 실패: ${saveError.message}` },
        { status: 500 }
      );
    }

    // 0행이 돌아오면 아무것도 저장되지 않은 것입니다.
    // 성공으로 보고하면 관리자는 고쳐졌다고 믿고 그대로 지급합니다.
    if ((saved || []).length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "저장된 행이 없습니다. 권한 설정을 확인해주세요.",
        },
        { status: 500 }
      );
    }

    await logAttendanceChanges(supabase, request, [
      {
        recordId: null,
        employeeId,
        action: oldValue === null ? "insert" : "update",
        field: "gross_pay",
        oldValue,
        newValue: String(grossPay),
        source: "admin-pay-override",
        workDate: date,
      },
    ]);

    return NextResponse.json({
      success: true,
      cleared: false,
      changed: true,
      grossPay,
      message: `${employee.name} 님 ${date} 세전급여를 ${grossPay.toLocaleString()}원으로 고정했습니다.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "세전급여 수정 에러",
      },
      { status: 500 }
    );
  }
}
