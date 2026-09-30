import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestMeta } from "@/app/lib/attendanceAudit";
import { calcRenewalDates } from "@/app/lib/contractRenewal";

/**
 * 근로계약 11개월 갱신.
 *
 * POST { expectedEnd: "YYYY-MM-DD" }  — 화면에서 본 현재 만료일
 *
 * 새 날짜는 서버가 expectedEnd 로 다시 계산합니다(브라우저가 보낸 날짜를 믿지 않음).
 * 실제 변경은 DB 함수 renew_employment_contract 가 한 트랜잭션으로 처리합니다:
 *   계약 변경 + 첫입사일 자동 채움 + 갱신 기록 한 줄
 *
 * "현재 만료일 = 화면에서 본 만료일"이 아니면 아무것도 바꾸지 않고 409 를 돌려줍니다.
 * 버튼을 두 번 눌러 22개월짜리 계약이 되는 사고를 막기 위한 것입니다.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isAdmin(request: Request) {
  const cookie = request.headers.get("cookie") || "";

  return /(?:^|;\s*)admin_auth=ok(?:;|$)/.test(cookie);
}

type RenewResult = {
  ok: boolean;
  code?: "bad_dates" | "not_found" | "no_end_date" | "stale";
  current_start?: string | null;
  current_end?: string | null;
  history_id?: number;
  employee_name?: string;
  previous_start?: string | null;
  previous_end?: string;
  new_start?: string;
  new_end?: string;
  first_hire_date?: string | null;
  first_hire_filled?: boolean;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        { success: false, message: "관리자 로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const employeeId = Number(id);

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return NextResponse.json(
        { success: false, message: "직원을 찾을 수 없습니다." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const expectedEnd = String(body?.expectedEnd ?? "").trim();

    if (!expectedEnd) {
      return NextResponse.json(
        {
          success: false,
          message:
            "계약 만료일이 없어 갱신할 수 없습니다(무기계약 또는 미입력).",
        },
        { status: 400 }
      );
    }

    if (!DATE_PATTERN.test(expectedEnd)) {
      return NextResponse.json(
        { success: false, message: "만료일 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const dates = calcRenewalDates(expectedEnd);

    if (!dates) {
      return NextResponse.json(
        { success: false, message: "만료일이 올바른 날짜가 아닙니다." },
        { status: 400 }
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

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { requestIp, userAgent } = getRequestMeta(request);

    const { data, error } = await supabase.rpc("renew_employment_contract", {
      p_employee_id: employeeId,
      p_expected_end: expectedEnd,
      p_new_start: dates.newStart,
      p_new_end: dates.newEnd,
      p_request_ip: requestIp,
      p_user_agent: userAgent,
    });

    if (error) {
      return NextResponse.json(
        { success: false, message: `갱신 실패: ${error.message}` },
        { status: 500 }
      );
    }

    const result = (data ?? { ok: false }) as RenewResult;

    if (!result.ok) {
      if (result.code === "stale") {
        return NextResponse.json(
          {
            success: false,
            code: "stale",
            currentStart: result.current_start ?? null,
            currentEnd: result.current_end ?? null,
            message: `이미 변경되었습니다. 새로고침 후 다시 확인해주세요.\n(화면의 만료일 ${expectedEnd}, 실제 만료일 ${result.current_end ?? "없음"})`,
          },
          { status: 409 }
        );
      }

      if (result.code === "not_found") {
        return NextResponse.json(
          { success: false, code: "not_found", message: "직원을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      if (result.code === "no_end_date") {
        return NextResponse.json(
          {
            success: false,
            code: "no_end_date",
            message:
              "계약 만료일이 없어 갱신할 수 없습니다(무기계약 또는 미입력).",
          },
          { status: 400 }
        );
      }

      // bad_dates 이거나 알 수 없는 응답. 저장된 것이 없으므로 성공으로 보고하면 안 됩니다.
      return NextResponse.json(
        {
          success: false,
          code: result.code ?? "unknown",
          message: "갱신 날짜 계산이 맞지 않아 저장하지 않았습니다.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      historyId: result.history_id,
      employeeName: result.employee_name,
      previousStart: result.previous_start ?? null,
      previousEnd: result.previous_end,
      newStart: result.new_start,
      newEnd: result.new_end,
      firstHireDate: result.first_hire_date ?? null,
      firstHireFilled: Boolean(result.first_hire_filled),
      message: `${result.employee_name} 님 근로계약을 ${result.new_start} ~ ${result.new_end} 로 갱신했습니다.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "계약 갱신 에러",
      },
      { status: 500 }
    );
  }
}
