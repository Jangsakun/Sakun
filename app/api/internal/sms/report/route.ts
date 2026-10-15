import { NextResponse } from "next/server";
import { serviceClient } from "@/app/lib/contracts/server";
import { WORKER_ID_PATTERN, isSmsWorkerRequest } from "@/app/lib/sms/workerApi";

/**
 * 문자 워커 → 발송 결과 기록.
 *   outcome: sent | failed | unknown | retry
 *   그 워커가 가져간 "발송중" 줄만 바뀝니다(DB 함수 sms_outbox_report).
 */
const OUTCOMES = new Set(["sent", "failed", "unknown", "retry"]);

export async function POST(request: Request) {
  if (!isSmsWorkerRequest(request)) {
    return NextResponse.json({ success: false, message: "인증 실패" }, { status: 401 });
  }

  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const id = Number(body.id);
  const workerId = String(body.workerId ?? "");
  const outcome = String(body.outcome ?? "");
  const text = (v: unknown, max: number) => (typeof v === "string" && v ? v.slice(0, max) : null);

  if (!Number.isInteger(id) || id <= 0 || !WORKER_ID_PATTERN.test(workerId) || !OUTCOMES.has(outcome)) {
    return NextResponse.json({ success: false, message: "요청 형식 오류" }, { status: 400 });
  }

  const supabase = serviceClient();

  if (!supabase) {
    return NextResponse.json({ success: false, message: "환경변수 없음" }, { status: 500 });
  }

  const { data, error } = await supabase.rpc("sms_outbox_report", {
    p_id: id,
    p_worker: workerId,
    p_outcome: outcome,
    p_result_code: text(body.resultCode, 20),
    p_result_message: text(body.resultMessage, 300),
    p_message_key: text(body.messageKey, 40),
    p_ref_key: text(body.refKey, 32),
    p_retry_after_seconds: Math.min(Math.max(Number(body.retryAfterSeconds) || 60, 5), 86400),
    p_count_attempt: body.countAttempt !== false,
    p_dry_run: body.dryRun === true,
  });

  if (error) {
    return NextResponse.json({ success: false, message: `결과 기록 실패(${error.code})` }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: data });
}
