import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequestMeta } from "@/app/lib/attendanceAudit";

// 서버 전용. 근로계약서 API 가 공통으로 쓰는 것들.

export const CONTRACT_BUCKET = "employment-contracts";
/** 서명본 PDF 열람 링크 유효시간(초). 짧게 둡니다. */
export const SIGNED_URL_SECONDS = 60;

export function isAdminRequest(request: Request) {
  const cookie = request.headers.get("cookie") || "";

  return /(?:^|;\s*)admin_auth=ok(?:;|$)/.test(cookie);
}

export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key);
}

export type ContractEventType =
  | "created"
  | "page_opened"
  | "input_started"
  | "preview_read_to_end"
  | "warning_acknowledged"
  | "sign_rejected"
  | "signed"
  | "pdf_downloaded"
  | "voided"
  | "ended";

/**
 * 증거 기록을 남깁니다. 주민번호(원본·가린 값 모두)를 detail 에 넣지 마세요.
 * 기록 실패는 console.error 로만 남기고 본 요청을 실패시키지 않습니다.
 * (단, 서명 확정처럼 기록이 곧 증거인 경우는 호출한 쪽에서 결과를 확인합니다.)
 */
export async function logContractEvent(
  supabase: SupabaseClient,
  request: Request | null,
  entry: {
    contractId: number;
    employeeId: number;
    eventType: ContractEventType;
    actor: "worker" | "admin-ui" | "system";
    detail?: Record<string, unknown>;
    documentSha256?: string | null;
    deviceId?: string | null;
  }
): Promise<boolean> {
  const meta = request ? getRequestMeta(request) : { requestIp: null, userAgent: null };

  const { error } = await supabase.from("contract_signature_events").insert({
    contract_id: entry.contractId,
    employee_id: entry.employeeId,
    event_type: entry.eventType,
    actor: entry.actor,
    detail: entry.detail ?? {},
    document_sha256: entry.documentSha256 ?? null,
    device_id: entry.deviceId ?? null,
    request_ip: meta.requestIp,
    user_agent: meta.userAgent,
  });

  if (error) {
    console.error("[contract-event] 기록 실패:", error.message);
    return false;
  }

  return true;
}

export type WeekStreak = {
  employeeId: number;
  employeeName: string;
  count: number;
  from: string;
  to: string;
};

/**
 * 같은 근로자의 1주 계약이 공백 없이 연속 4회 이상인 경우.
 * 1주 계약은 금요일에 끝나므로 다음 계약이 그다음 월요일(3일 뒤)까지 시작하면 "연속"으로 봅니다.
 */
export function findWeekStreaks(
  rows: { employee_id: number; employee_name: string; kind: string; status: string; start_date: string | null; end_date: string | null }[],
  minCount = 4
): WeekStreak[] {
  const byEmployee = new Map<number, typeof rows>();

  for (const row of rows) {
    if (row.kind !== "week") continue;
    if (row.status !== "signed" && row.status !== "ended") continue;
    if (!row.start_date || !row.end_date) continue;

    const list = byEmployee.get(row.employee_id) ?? [];
    list.push(row);
    byEmployee.set(row.employee_id, list);
  }

  const dayMs = 86400000;
  const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const streaks: WeekStreak[] = [];

  for (const [employeeId, list] of byEmployee) {
    list.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));

    let runStart = 0;

    for (let i = 1; i <= list.length; i++) {
      const continues =
        i < list.length &&
        (toMs(list[i].start_date!) - toMs(list[i - 1].end_date!)) / dayMs <= 3;

      if (continues) continue;

      const count = i - runStart;

      if (count >= minCount) {
        streaks.push({
          employeeId,
          employeeName: list[runStart].employee_name,
          count,
          from: list[runStart].start_date!,
          to: list[i - 1].end_date!,
        });
      }

      runStart = i;
    }
  }

  return streaks.sort((a, b) => b.count - a.count);
}
