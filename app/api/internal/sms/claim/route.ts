import { NextResponse } from "next/server";
import { serviceClient } from "@/app/lib/contracts/server";
import { WORKER_ID_PATTERN, isSmsWorkerRequest } from "@/app/lib/sms/workerApi";

/**
 * 문자 워커 → 보낼 문자 가져가기 (+ 연결 기록).
 *   워커가 30초마다 부릅니다. 부를 때마다 sms_worker_heartbeats 를 갱신해서
 *   관리자 화면이 "워커 마지막 연결"을 보여줄 수 있게 합니다.
 *   가져가기는 DB 함수 sms_outbox_claim 이 잠금을 걸고 처리합니다(동시에 불러도 중복 없음).
 */
export async function POST(request: Request) {
  if (!isSmsWorkerRequest(request)) {
    return NextResponse.json({ success: false, message: "인증 실패" }, { status: 401 });
  }

  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const workerId = String(body.workerId ?? "");
  const mode = body.mode === "live" ? "live" : "dry-run";
  const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 20);

  if (!WORKER_ID_PATTERN.test(workerId)) {
    return NextResponse.json({ success: false, message: "workerId 형식 오류" }, { status: 400 });
  }

  const supabase = serviceClient();

  if (!supabase) {
    return NextResponse.json({ success: false, message: "환경변수 없음" }, { status: 500 });
  }

  const lastError = typeof body.lastError === "string" && body.lastError ? body.lastError.slice(0, 300) : null;
  const now = new Date().toISOString();

  const heartbeat = await supabase.from("sms_worker_heartbeats").upsert({
    worker_id: workerId,
    last_seen_at: now,
    mode,
    version: String(body.version ?? "").slice(0, 40) || null,
    host: String(body.host ?? "").slice(0, 60) || null,
    last_error: lastError,
    last_error_at: lastError ? now : null,
  });

  if (heartbeat.error) {
    return NextResponse.json({ success: false, message: `연결 기록 실패(${heartbeat.error.code})` }, { status: 500 });
  }

  // 워커가 "지금은 가져가지 마"(예: 뿌리오 인증 오류로 대기 중)라고 하면 연결 기록만 합니다.
  if (body.heartbeatOnly === true) {
    return NextResponse.json({ success: true, messages: [] });
  }

  const { data, error } = await supabase.rpc("sms_outbox_claim", { p_worker: workerId, p_limit: limit });

  if (error) {
    return NextResponse.json({ success: false, message: `가져가기 실패(${error.code})` }, { status: 500 });
  }

  const rows = ((data ?? []) as Record<string, unknown>[]).sort((a, b) => Number(a.id) - Number(b.id));

  return NextResponse.json({
    success: true,
    messages: rows.map((r) => ({
      id: r.id,
      messageType: r.message_type,
      subject: r.subject,
      content: r.content,
      to: r.to_phone,
      toMasked: r.to_phone_masked,
      attempts: r.attempts,
    })),
  });
}
