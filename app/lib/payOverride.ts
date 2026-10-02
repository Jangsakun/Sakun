import type { SupabaseClient } from "@supabase/supabase-js";

// 관리자가 직접 지정한 하루치 세전급여(attendance_pay_override).
// 시급분만 대체합니다. 도급 일급은 직접지정과 무관하게 따로 더합니다(app/lib/dayPay.ts).
//
// 왜 공용 파일인가
//   같은 수정값을 출퇴근 기록 화면 / 관리자 급여 / 근로자 급여 세 곳이 읽습니다.
//   각자 조회하면 한 곳만 고쳐지고 나머지는 옛 금액이 남는 사고가 납니다.
//   (은행제출용 다건이체가 관리자 급여의 세후급여를 그대로 쓰므로
//    한 곳이라도 어긋나면 실제 송금액이 틀어집니다)

export type PayOverride = {
  employeeId: number;
  date: string;
  grossPay: number;
  memo: string | null;
};

export type PayOverrideMap = Map<string, PayOverride>;

/** (직원, 근무일) 한 쌍을 가리키는 키. 세 곳이 같은 규칙을 써야 합니다. */
export function payOverrideKey(employeeId: number | string, date: string) {
  return `${employeeId}_${date}`;
}

type LoadResult = {
  overrides: PayOverrideMap;
  /** 테이블이 아직 없을 때(마이그레이션 미실행)만 채워집니다. */
  warning: string | null;
  /** 그 외 조회 실패. 호출한 쪽에서 요청을 실패시켜야 합니다. */
  error: string | null;
};

const EMPTY: PayOverrideMap = new Map();

/** 테이블이 아직 없는 상태인지 판별합니다(마이그레이션 실행 전). */
function isMissingTable(message: string) {
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("42P01")
  );
}

/**
 * 기간 안의 세전급여 수정값을 전부 읽습니다.
 *
 * 조회 실패를 조용히 삼키지 않습니다. 금액이 걸린 값이라
 * "수정한 금액이 반영 안 됐는데 화면은 멀쩡한" 상태가 제일 위험합니다.
 * 단, 마이그레이션 실행 전이라 테이블 자체가 없는 경우만 경고로 낮춥니다.
 */
export async function loadPayOverrides(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<LoadResult> {
  try {
    const { data, error } = await supabase
      .from("attendance_pay_override")
      .select("employee_id, work_date, gross_pay, memo")
      .gte("work_date", startDate)
      .lte("work_date", endDate);

    if (error) {
      if (isMissingTable(error.message)) {
        return {
          overrides: EMPTY,
          warning:
            "세전급여 수정 기능이 아직 준비되지 않았습니다(attendance_pay_override 테이블 없음). 마이그레이션을 실행해 주세요.",
          error: null,
        };
      }

      return { overrides: EMPTY, warning: null, error: error.message };
    }

    const overrides: PayOverrideMap = new Map();

    for (const row of (data || []) as {
      employee_id: number;
      work_date: string;
      gross_pay: number;
      memo: string | null;
    }[]) {
      overrides.set(payOverrideKey(row.employee_id, row.work_date), {
        employeeId: row.employee_id,
        date: row.work_date,
        grossPay: Number(row.gross_pay),
        memo: row.memo,
      });
    }

    return { overrides, warning: null, error: null };
  } catch (error) {
    return {
      overrides: EMPTY,
      warning: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 그 날 기록이 모두 지워졌으면 남아 있는 수정 금액도 같이 지웁니다.
 *
 * 안 지우면 같은 날을 다시 입력했을 때 예전에 고쳐둔 금액이 슬그머니
 * 되살아납니다. 지워진 날은 자동 계산으로 돌아가는 게 맞습니다.
 * 실패해도 삭제 요청 자체를 실패시키지 않습니다(기록 삭제는 이미 끝났습니다).
 */
export async function clearOrphanPayOverrides(
  supabase: SupabaseClient,
  pairs: { employeeId: number; date: string }[]
): Promise<void> {
  const seen = new Set<string>();

  for (const pair of pairs) {
    const key = payOverrideKey(pair.employeeId, pair.date);

    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const { data: remaining, error } = await supabase
        .from("attendance_records")
        .select("id")
        .eq("employee_id", pair.employeeId)
        .gte("checked_at", `${pair.date}T00:00:00+09:00`)
        .lte("checked_at", `${pair.date}T23:59:59.999+09:00`)
        .limit(1);

      if (error) continue;
      if ((remaining || []).length > 0) continue;

      await supabase
        .from("attendance_pay_override")
        .delete()
        .eq("employee_id", pair.employeeId)
        .eq("work_date", pair.date);
    } catch (error) {
      console.error(
        "[pay-override] 남은 수정 금액 정리 실패(삭제 자체는 성공):",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
