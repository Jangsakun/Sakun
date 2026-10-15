"use client";

import { CSSProperties, useEffect, useState } from "react";

// 관리자 화면 맨 위 "문자 워커" 경고. 모든 탭에서 보입니다.
//   워커(사무실 PC)가 10분 넘게 연결이 없으면 빨간 경고 — 그동안 문자가 안 나갑니다.
//   모의 발송 모드, 뿌리오 오류, 확인필요 문자는 노란 안내.
// 1분마다 가볍게 확인합니다. 문자 DB 마이그레이션 전이면 아무것도 표시하지 않습니다.

const STALE_MINUTES = 10;
const POLL_MS = 60 * 1000;

type Status = {
  success: boolean;
  ready?: boolean;
  serverTime?: string;
  worker?: { worker_id: string; last_seen_at: string; mode: "live" | "dry-run"; last_error: string | null; last_error_at: string | null } | null;
  queuedCount?: number;
  oldestQueuedAt?: string | null;
  unknownCount?: number;
};

function minutesBetween(from: string, to: string) {
  return Math.floor((Date.parse(to) - Date.parse(from)) / 60000);
}

function formatKst(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default function SmsWorkerBanner() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch("/api/admin/sms/status", { cache: "no-store" });
        const json: Status = await res.json();
        if (alive) setStatus(json);
      } catch {
        // 네트워크 오류는 다음 확인 때 다시
      }
    };

    load();
    const timer = setInterval(load, POLL_MS);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!status?.success || !status.ready || !status.serverTime) return null;

  const { worker, serverTime } = status;
  const queued = status.queuedCount ?? 0;
  const unknown = status.unknownCount ?? 0;
  const staleMinutes = worker ? minutesBetween(worker.last_seen_at, serverTime) : null;
  const disconnected = !worker || (staleMinutes ?? 0) >= STALE_MINUTES;
  const recentError =
    worker?.last_error && worker.last_error_at && minutesBetween(worker.last_error_at, serverTime) < 30 ? worker.last_error : null;

  const notices: string[] = [];
  if (!disconnected && worker?.mode === "dry-run") notices.push("문자 워커가 모의 발송 모드입니다 — 실제 문자는 나가지 않습니다.");
  if (!disconnected && recentError) notices.push(`문자 워커 오류: ${recentError}`);
  if (unknown > 0) notices.push(`발송 결과 확인필요 문자 ${unknown}건 — 뿌리오 발송결과 페이지에서 실제로 나갔는지 확인 후, 안 나갔으면 전자계약 탭에서 재발송하세요.`);

  if (!disconnected && notices.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
      {disconnected && (
        <div style={dangerStyle} role="alert">
          <strong style={{ fontSize: "15px" }}>⚠️ 문자 워커 연결 끊김</strong>
          <div style={{ marginTop: "4px" }}>
            {worker
              ? `마지막 연결: ${formatKst(worker.last_seen_at)} (${staleMinutes}분 전).`
              : "문자 워커가 아직 한 번도 연결되지 않았습니다."}{" "}
            사무실 PC가 켜져 있는지, 절전 모드인지 확인하세요. 연결될 때까지 문자가 나가지 않습니다.
          </div>
          {queued > 0 && (
            <div style={{ marginTop: "4px" }}>
              보내지 못하고 기다리는 문자 {queued}건{status.oldestQueuedAt ? ` (가장 오래된 것: ${formatKst(status.oldestQueuedAt)})` : ""}
            </div>
          )}
        </div>
      )}
      {notices.map((text) => (
        <div key={text} style={warnStyle}>
          {text}
        </div>
      ))}
    </div>
  );
}

const dangerStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: "12px",
  background: "#dc2626",
  color: "#ffffff",
  fontSize: "13px",
  fontWeight: 700,
  lineHeight: 1.5,
};

const warnStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "12px",
  background: "#fffbeb",
  border: "1px solid #fde68a",
  color: "#92400e",
  fontSize: "13px",
  fontWeight: 700,
};
