import type { SupabaseClient } from "@supabase/supabase-js";

// attendance_records 변경 이력 기록 (attendance_record_audit).
//
// 설계 메모
// - 성공한 변경만 기록합니다. 0행 매칭으로 아무것도 바뀌지 않은 요청은 남기지 않습니다.
// - 감사 기록 실패로 요청을 실패시키지 않습니다. 데이터 변경은 이미 끝났으므로
//   실패로 보고하면 "저장 안 됨"으로 오해하게 됩니다. console.error 로만 남깁니다.
// - actor 는 항상 "admin-ui" 입니다. 현재 관리자 인증은 공용 비밀번호 1개(admin_auth 쿠키)라
//   개인 식별 정보가 없습니다. 사람별 추적은 관리자 계정 분리가 선행되어야 합니다.
// - BISEO(biseo/web) 의 attendance_audit_log 는 BISEO 자체 DB 의 다른 테이블입니다.
//   두 코드베이스가 같은 attendance_records 를 수정하므로 이력이 두 곳에 나뉩니다.

export type AuditAction = "update" | "insert" | "delete";

export type AuditSource =
  | "admin-time-edit"
  | "admin-manual-add"
  | "admin-delete";

export type AuditEntry = {
  recordId: number | null;
  employeeId: number | null;
  action: AuditAction;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  source: AuditSource;
};

type RequestMeta = {
  requestIp: string | null;
  userAgent: string | null;
};

/** 프록시(Vercel) 뒤에서도 원 IP 를 잡습니다. */
export function getRequestMeta(request: Request): RequestMeta {
  const forwarded = request.headers.get("x-forwarded-for");

  const requestIp = forwarded
    ? forwarded.split(",")[0].trim()
    : request.headers.get("x-real-ip");

  return {
    requestIp: requestIp || null,
    userAgent: request.headers.get("user-agent"),
  };
}

/**
 * 변경 직전 원값을 읽습니다. 실패하면 null 을 돌려주고 변경은 계속 진행합니다.
 * (원값을 못 읽는다고 관리자의 수정을 막을 이유는 없습니다)
 */
export async function readCheckedAt(
  supabase: SupabaseClient,
  recordId: number
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("attendance_records")
      .select("checked_at")
      .eq("id", recordId)
      .maybeSingle();

    if (error || !data) return null;

    return (data as { checked_at: string | null }).checked_at ?? null;
  } catch {
    return null;
  }
}

/** 삭제 직전 레코드 전체를 읽어 감사에 남길 원값을 확보합니다. */
export async function readRecordsForDelete(
  supabase: SupabaseClient,
  recordIds: number[]
): Promise<
  { id: number; employee_id: number; record_type: string; checked_at: string }[]
> {
  try {
    const { data, error } = await supabase
      .from("attendance_records")
      .select("id, employee_id, record_type, checked_at")
      .in("id", recordIds);

    if (error || !data) return [];

    return data as {
      id: number;
      employee_id: number;
      record_type: string;
      checked_at: string;
    }[];
  } catch {
    return [];
  }
}

/**
 * 감사 행을 기록합니다. 절대 throw 하지 않습니다.
 * 테이블이 아직 없는 환경(마이그레이션 미실행)에서도 본 기능이 죽지 않도록 합니다.
 */
export async function logAttendanceChanges(
  supabase: SupabaseClient,
  request: Request,
  entries: AuditEntry[]
): Promise<void> {
  if (entries.length === 0) return;

  const { requestIp, userAgent } = getRequestMeta(request);

  const rows = entries.map((entry) => ({
    record_id: entry.recordId,
    employee_id: entry.employeeId,
    action: entry.action,
    field: entry.field ?? null,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
    source: entry.source,
    actor: "admin-ui",
    request_ip: requestIp,
    user_agent: userAgent,
  }));

  try {
    const { error } = await supabase
      .from("attendance_record_audit")
      .insert(rows);

    if (error) {
      console.error(
        "[attendance-audit] 감사 기록 실패(변경 자체는 성공):",
        error.message
      );
    }
  } catch (error) {
    console.error(
      "[attendance-audit] 감사 기록 예외(변경 자체는 성공):",
      error instanceof Error ? error.message : String(error)
    );
  }
}
