import { NextResponse } from "next/server";
import { isAdminRequest, serviceClient } from "@/app/lib/contracts/server";

/**
 * 관리자 화면 상단 "문자 워커" 경고용 — 가볍게 자주(1분) 부릅니다.
 *   워커 마지막 연결, 모드(모의/실발송), 최근 오류, 대기 중·확인필요 문자 수
 */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ success: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const supabase = serviceClient();

  if (!supabase) {
    return NextResponse.json({ success: false, message: "환경변수 없음" }, { status: 500 });
  }

  const [worker, queued, unknown] = await Promise.all([
    supabase
      .from("sms_worker_heartbeats")
      .select("worker_id, last_seen_at, mode, version, last_error, last_error_at")
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("sms_outbox")
      .select("created_at", { count: "exact" })
      .in("status", ["queued", "sending"])
      .order("id", { ascending: true })
      .limit(1),
    supabase.from("sms_outbox").select("id", { count: "exact", head: true }).eq("status", "unknown"),
  ]);

  // 마이그레이션 전이면 표만 없으므로 "준비 안 됨"으로 답합니다.
  if (worker.error || queued.error || unknown.error) {
    return NextResponse.json({ success: true, ready: false });
  }

  return NextResponse.json({
    success: true,
    ready: true,
    serverTime: new Date().toISOString(),
    worker: worker.data,
    queuedCount: queued.count ?? 0,
    oldestQueuedAt: queued.data?.[0]?.created_at ?? null,
    unknownCount: unknown.count ?? 0,
  });
}
