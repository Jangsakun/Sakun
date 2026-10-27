// 주휴수당 대상/비대상 변경 이력 (2026-10-27 사용자 요청)
//
// 직원정보의 weekly_allowance_status 는 "지금" 상태 하나뿐이라, 상태를 바꾸면 이미 이체한 과거 주까지
// 새 상태로 다시 계산되는 문제가 있었습니다(예: 비대상으로 이체 → 대상으로 변경 → 지난주에도 주휴수당이 붙음).
//
// 규칙: 상태 변경은 "바꾼 날이 속한 주(월~일)"부터 적용합니다. 그 전 주는 바꾸기 전 상태로 계산합니다.
//   어떤 주의 상태 = 그 주 시작일보다 늦게 적용된 변경 중 가장 이른 것의 "바꾸기 전 상태",
//                    그런 변경이 없으면 지금 상태.
// 이력은 weekly_allowance_status_changes 표(20261027500000_weekly_allowance_history.sql)에 남습니다.
// 표가 아직 없으면(마이그레이션 전) 이력 없이 기존처럼 지금 상태로 계산합니다.

export type AllowanceStatusChange = {
  employee_id: number;
  old_status: string | null;
  new_status: string;
  effective_week_start: string;
};

/** 'YYYY-MM-DD' 가 속한 주의 월요일 */
export function mondayOfDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

/** 오늘(KST)이 속한 주의 월요일 — 상태 변경이 적용되기 시작하는 주 */
export function currentWeekStartKst(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return mondayOfDateKey(today);
}

/** 직원별 변경 이력(적용 주 오름차순). 실패하거나 표가 없으면 빈 Map. */
export async function loadAllowanceStatusChanges(
  supabase: any,
  employeeIds: number[]
): Promise<Map<number, AllowanceStatusChange[]>> {
  const result = new Map<number, AllowanceStatusChange[]>();
  const ids = Array.from(new Set(employeeIds.filter((id) => Number.isFinite(id))));

  if (ids.length === 0) return result;

  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await supabase
      .from("weekly_allowance_status_changes")
      .select("employee_id, old_status, new_status, effective_week_start")
      .in("employee_id", ids.slice(i, i + 300))
      .order("effective_week_start", { ascending: true })
      .order("id", { ascending: true });

    if (error) return new Map();

    for (const row of (data || []) as AllowanceStatusChange[]) {
      const id = Number(row.employee_id);
      if (!result.has(id)) result.set(id, []);
      result.get(id)!.push(row);
    }
  }

  return result;
}

/** weekStart(월요일) 주에 적용되는 주휴수당 상태 */
export function allowanceStatusForWeek(
  currentStatus: string,
  changes: AllowanceStatusChange[] | undefined,
  weekStart: string
) {
  const later = (changes || []).find(
    (change) => String(change.effective_week_start).slice(0, 10) > weekStart
  );

  if (!later) return currentStatus;

  return String(later.old_status || "").trim() || currentStatus;
}
