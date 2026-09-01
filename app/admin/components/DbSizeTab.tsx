"use client";

import { CSSProperties, useCallback, useEffect, useState } from "react";

type ProjectionStatus = "ok" | "insufficient" | "no-growth" | "exceeded";

type DbSizeResponse = {
  success: boolean;
  message?: string;
  debug?: string;

  today?: string;
  limitMb?: number;
  limitBytes?: number;
  limitText?: string;
  currentBytes?: number;
  currentText?: string;
  usedPercent?: number;
  remainingText?: string;
  minSnapshotsForProjection?: number;
  snapshotCount?: number;
  hasTodaySnapshot?: boolean;
  lastSnapshotDate?: string | null;
  lastDayDeltaBytes?: number | null;

  growth?: {
    windowDays: number;
    usedSnapshotCount: number;
    firstDate: string | null;
    lastDate: string | null;
    spanDays: number;
    avgDailyBytes: number;
    avgDailyText: string;
    avgMonthlyText: string;
  };

  projection?: {
    status: ProjectionStatus;
    daysLeft: number | null;
    monthsLeft: number | null;
    reachDate: string | null;
    message: string;
  };

  history?: { date: string; bytes: number }[];
};

const WINDOW_OPTIONS = [7, 14, 30];

const HISTORY_ROW_LIMIT = 14;

function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return "-";

  const value = Number(bytes) || 0;
  const mb = 1024 * 1024;

  if (Math.abs(value) >= 1024 * mb) return `${(value / (1024 * mb)).toFixed(2)}GB`;
  if (Math.abs(value) >= mb) return `${(value / mb).toFixed(1)}MB`;
  if (Math.abs(value) >= 1024) return `${(value / 1024).toFixed(1)}KB`;

  return `${Math.round(value)}B`;
}

function formatDelta(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return "-";
  if (bytes === 0) return "±0B";

  return `${bytes > 0 ? "+" : "-"}${formatBytes(Math.abs(bytes))}`;
}

function getGaugeColor(usedPercent: number) {
  if (usedPercent >= 85) return { bar: "#ef4444", text: "#b91c1c", bg: "#fee2e2" };
  if (usedPercent >= 70) return { bar: "#f59e0b", text: "#b45309", bg: "#fef3c7" };
  return { bar: "#10b981", text: "#047857", bg: "#dcfce7" };
}

function getProjectionTone(status: ProjectionStatus | undefined) {
  if (status === "exceeded") {
    return { bg: "#fee2e2", border: "#fecaca", text: "#b91c1c" };
  }

  if (status === "insufficient") {
    return { bg: "#f1f5f9", border: "#e2e8f0", text: "#475569" };
  }

  if (status === "no-growth") {
    return { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" };
  }

  return { bg: "#f0fdf4", border: "#bbf7d0", text: "#047857" };
}

export default function DbSizeTab() {
  const [windowDays, setWindowDays] = useState(30);
  const [data, setData] = useState<DbSizeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState("");

  const fetchDbSize = useCallback(async () => {
    try {
      setLoading(true);

      const response = await fetch(`/api/admin/db-size?windowDays=${windowDays}`, {
        method: "GET",
        cache: "no-store",
      });

      const result: DbSizeResponse = await response.json();

      if (!result.success) {
        setData(null);
        setMessage(result.message || "용량 조회 실패");
        return;
      }

      setData(result);
      setMessage("");
    } catch (error) {
      console.error("DB 용량 조회 실패:", error);
      setData(null);
      setMessage("용량 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    fetchDbSize();
  }, [fetchDbSize]);

  const recordSnapshotNow = async () => {
    try {
      setRecording(true);

      const response = await fetch("/api/admin/db-size", {
        method: "POST",
        cache: "no-store",
      });

      const result = await response.json();

      if (!result.success) {
        alert(result.message || "스냅샷 기록 실패");
        return;
      }

      await fetchDbSize();
    } catch (error) {
      console.error("스냅샷 기록 실패:", error);
      alert("스냅샷 기록 중 오류가 발생했습니다.");
    } finally {
      setRecording(false);
    }
  };

  const usedPercent = data?.usedPercent ?? 0;
  const gauge = getGaugeColor(usedPercent);
  const projectionTone = getProjectionTone(data?.projection?.status);

  const history = [...(data?.history || [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, HISTORY_ROW_LIMIT);

  const historyBytesByDate = new Map(
    (data?.history || []).map((item) => [item.date, item.bytes])
  );

  return (
    <div style={{ marginTop: "16px" }}>
      <div style={toolbarStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={toolbarLabelStyle}>평균 증가량 기준 기간</span>

          {WINDOW_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setWindowDays(option)}
              style={{
                ...pillButtonStyle,
                border:
                  windowDays === option ? "1px solid #111827" : "1px solid #d1d5db",
                background: windowDays === option ? "#111827" : "#ffffff",
                color: windowDays === option ? "#ffffff" : "#111827",
              }}
            >
              최근 {option}일
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" onClick={fetchDbSize} style={ghostButtonStyle}>
            새로고침
          </button>

          <button
            type="button"
            onClick={recordSnapshotNow}
            disabled={recording}
            style={{
              ...solidButtonStyle,
              opacity: recording ? 0.6 : 1,
              cursor: recording ? "default" : "pointer",
            }}
          >
            {recording ? "기록중..." : "지금 스냅샷 기록"}
          </button>
        </div>
      </div>

      {loading && <div style={emptyBoxStyle}>DB 용량을 불러오는 중입니다...</div>}

      {!loading && message && (
        <div style={{ ...emptyBoxStyle, color: "#b91c1c", background: "#fef2f2" }}>
          {message}
          {data === null && (
            <div style={{ marginTop: "8px", fontSize: "13px", color: "#7f1d1d" }}>
              최초 1회 <code>supabase/migrations/20260828100000_db_size_monitor.sql</code>{" "}
              를 Supabase SQL Editor 에서 실행해야 합니다.
            </div>
          )}
        </div>
      )}

      {!loading && data && (
        <>
          <div style={gaugeCardStyle}>
            <div style={gaugeHeaderStyle}>
              <div>
                <div style={gaugeLabelStyle}>현재 사용량</div>
                <div style={gaugeValueStyle}>
                  {data.currentText}
                  <span style={gaugeLimitTextStyle}> / {data.limitText}</span>
                </div>
              </div>

              <span
                style={{
                  ...gaugeBadgeStyle,
                  background: gauge.bg,
                  color: gauge.text,
                }}
              >
                {usedPercent.toFixed(1)}% 사용
              </span>
            </div>

            <div style={gaugeTrackStyle}>
              <div
                style={{
                  ...gaugeFillStyle,
                  width: `${Math.min(100, Math.max(0, usedPercent))}%`,
                  background: gauge.bar,
                }}
              />
            </div>

            <div style={gaugeFooterStyle}>
              <span>남은 용량 {data.remainingText}</span>
              <span>
                기준 {data.today} · Postgres pg_database_size
              </span>
            </div>
          </div>

          <div style={statGridStyle}>
            <StatCard
              label={`최근 ${data.growth?.windowDays}일 평균 일일 증가량`}
              value={data.growth?.avgDailyText || "-"}
              helper={
                data.growth && data.growth.spanDays > 0
                  ? `${data.growth.firstDate} ~ ${data.growth.lastDate} (${data.growth.spanDays}일 간격)`
                  : "스냅샷 2일 이상 필요"
              }
            />
            <StatCard
              label="월 환산 증가량"
              value={data.growth?.avgMonthlyText || "-"}
              helper="평균 일일 증가량 × 30일"
            />
            <StatCard
              label="전일 대비"
              value={formatDelta(data.lastDayDeltaBytes)}
              helper={
                data.lastSnapshotDate
                  ? `마지막 스냅샷 ${data.lastSnapshotDate}`
                  : "스냅샷 없음"
              }
            />
            <StatCard
              label="누적 스냅샷"
              value={`${data.snapshotCount ?? 0}일치`}
              helper={
                data.hasTodaySnapshot
                  ? "오늘 기록 완료"
                  : "오늘 기록 대기 (KST 10시 자동)"
              }
            />
          </div>

          <div
            style={{
              ...projectionBoxStyle,
              background: projectionTone.bg,
              border: `1px solid ${projectionTone.border}`,
              color: projectionTone.text,
            }}
          >
            <div style={projectionTitleStyle}>한도 도달 예상 (선형 추정)</div>

            {data.projection?.status === "ok" ? (
              <>
                <div style={projectionValueStyle}>
                  약 {data.projection.daysLeft?.toLocaleString("ko-KR")}일 후 (
                  {data.projection.monthsLeft}개월)
                </div>
                <div style={projectionHelperStyle}>
                  도달 예상일 {data.projection.reachDate} ·{" "}
                  {data.projection.message}
                </div>
              </>
            ) : (
              <>
                <div style={projectionValueStyle}>
                  {data.projection?.status === "insufficient"
                    ? "계산 대기"
                    : data.projection?.status === "no-growth"
                    ? "증가 없음"
                    : "한도 초과"}
                </div>
                <div style={projectionHelperStyle}>
                  {data.projection?.message}
                </div>
              </>
            )}

            <div style={projectionFormulaStyle}>
              수식: (한도 − 현재 용량) ÷ 평균 일일 증가량 — 고정 계산이며 별도 예측
              모델을 쓰지 않습니다.
            </div>
          </div>

          <div style={historyCardStyle}>
            <div style={historyHeaderStyle}>
              <div>
                <div style={historyTitleStyle}>최근 스냅샷</div>
                <div style={historySubtitleStyle}>
                  하루 1행만 저장하고 365일이 지난 행은 자동 삭제됩니다.
                </div>
              </div>
              <span style={historyCountStyle}>
                최근 {history.length}일 표시 / 총 {data.snapshotCount ?? 0}일치
              </span>
            </div>

            {history.length === 0 ? (
              <div style={emptyBoxStyle}>
                아직 스냅샷이 없습니다. 위의 &quot;지금 스냅샷 기록&quot; 버튼으로
                첫 기록을 남길 수 있습니다.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>날짜</th>
                      <th style={thStyle}>용량</th>
                      <th style={thStyle}>전일 대비</th>
                      <th style={thStyle}>한도 대비</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => {
                      const previousDateKey = shiftDateKey(item.date, -1);
                      const previousBytes = historyBytesByDate.has(previousDateKey)
                        ? historyBytesByDate.get(previousDateKey)!
                        : null;

                      const delta =
                        previousBytes === null ? null : item.bytes - previousBytes;

                      const percent =
                        data.limitBytes && data.limitBytes > 0
                          ? (item.bytes / data.limitBytes) * 100
                          : 0;

                      return (
                        <tr key={item.date}>
                          <td style={tdStyle}>{item.date}</td>
                          <td style={tdStyle}>{formatBytes(item.bytes)}</td>
                          <td
                            style={{
                              ...tdStyle,
                              color:
                                delta === null
                                  ? "#9ca3af"
                                  : delta > 0
                                  ? "#b45309"
                                  : delta < 0
                                  ? "#047857"
                                  : "#6b7280",
                              fontWeight: 800,
                            }}
                          >
                            {formatDelta(delta)}
                          </td>
                          <td style={tdStyle}>{percent.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={noticeBoxStyle}>
            한도는 기본 500MB(Supabase 무료 플랜)입니다. 플랜을 올렸으면{" "}
            <code>SUPABASE_DB_LIMIT_MB</code> 환경변수로 바꿀 수 있습니다. 현재
            적용값 {data.limitMb}MB.
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div style={statCardStyle}>
      <div style={statLabelStyle}>{label}</div>
      <div style={statValueStyle}>{value}</div>
      <div style={statHelperStyle}>{helper}</div>
    </div>
  );
}

function shiftDateKey(dateKey: string, days: number) {
  const base = new Date(`${dateKey}T00:00:00+09:00`);
  base.setUTCDate(base.getUTCDate() + days);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

const toolbarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  flexWrap: "wrap",
  padding: "14px 16px",
  marginBottom: "16px",
  border: "1px solid #e5e7eb",
  borderRadius: "16px",
  background: "#ffffff",
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.04)",
};

const toolbarLabelStyle: CSSProperties = {
  fontSize: "14px",
  fontWeight: 900,
  color: "#111827",
};

const pillButtonStyle: CSSProperties = {
  height: "38px",
  padding: "0 16px",
  borderRadius: "999px",
  fontSize: "13px",
  fontWeight: 900,
  cursor: "pointer",
};

const ghostButtonStyle: CSSProperties = {
  height: "38px",
  padding: "0 16px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#111827",
  fontSize: "13px",
  fontWeight: 800,
  cursor: "pointer",
};

const solidButtonStyle: CSSProperties = {
  height: "38px",
  padding: "0 18px",
  borderRadius: "12px",
  border: "none",
  background: "#111827",
  color: "#ffffff",
  fontSize: "13px",
  fontWeight: 900,
};

const gaugeCardStyle: CSSProperties = {
  padding: "22px",
  border: "1px solid #e5e7eb",
  borderRadius: "20px",
  background: "linear-gradient(135deg, #ffffff, #f8fafc)",
  boxShadow: "0 10px 28px rgba(15, 23, 42, 0.06)",
  marginBottom: "16px",
};

const gaugeHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "16px",
};

const gaugeLabelStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 800,
  color: "#6b7280",
  marginBottom: "6px",
};

const gaugeValueStyle: CSSProperties = {
  fontSize: "34px",
  fontWeight: 900,
  color: "#111827",
  lineHeight: 1.1,
};

const gaugeLimitTextStyle: CSSProperties = {
  fontSize: "18px",
  fontWeight: 800,
  color: "#9ca3af",
};

const gaugeBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: "34px",
  padding: "0 14px",
  borderRadius: "999px",
  fontSize: "14px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const gaugeTrackStyle: CSSProperties = {
  height: "16px",
  borderRadius: "999px",
  background: "#e5e7eb",
  overflow: "hidden",
};

const gaugeFillStyle: CSSProperties = {
  height: "100%",
  borderRadius: "999px",
  transition: "width 0.3s ease",
};

const gaugeFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
  marginTop: "10px",
  fontSize: "12px",
  fontWeight: 700,
  color: "#6b7280",
};

const statGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "12px",
  marginBottom: "16px",
};

const statCardStyle: CSSProperties = {
  padding: "16px 18px",
  border: "1px solid #e5e7eb",
  borderRadius: "16px",
  background: "#ffffff",
};

const statLabelStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 800,
  color: "#6b7280",
  marginBottom: "8px",
};

const statValueStyle: CSSProperties = {
  fontSize: "22px",
  fontWeight: 900,
  color: "#111827",
};

const statHelperStyle: CSSProperties = {
  marginTop: "6px",
  fontSize: "12px",
  fontWeight: 700,
  color: "#9ca3af",
  lineHeight: 1.4,
};

const projectionBoxStyle: CSSProperties = {
  padding: "20px",
  borderRadius: "18px",
  marginBottom: "16px",
};

const projectionTitleStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 900,
  opacity: 0.85,
  marginBottom: "8px",
};

const projectionValueStyle: CSSProperties = {
  fontSize: "26px",
  fontWeight: 900,
  lineHeight: 1.2,
};

const projectionHelperStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "13px",
  fontWeight: 700,
  lineHeight: 1.5,
};

const projectionFormulaStyle: CSSProperties = {
  marginTop: "12px",
  paddingTop: "12px",
  borderTop: "1px solid rgba(15, 23, 42, 0.08)",
  fontSize: "12px",
  fontWeight: 700,
  opacity: 0.75,
  lineHeight: 1.5,
};

const historyCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "18px",
  background: "#ffffff",
  overflow: "hidden",
  marginBottom: "16px",
};

const historyHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  padding: "16px 18px",
  borderBottom: "1px solid #eef2f7",
  background: "linear-gradient(135deg, #ffffff, #f8fafc)",
};

const historyTitleStyle: CSSProperties = {
  fontSize: "17px",
  fontWeight: 900,
  color: "#111827",
};

const historySubtitleStyle: CSSProperties = {
  marginTop: "5px",
  fontSize: "12px",
  fontWeight: 700,
  color: "#6b7280",
};

const historyCountStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: "32px",
  padding: "0 12px",
  borderRadius: "999px",
  background: "#f3f4f6",
  color: "#374151",
  fontSize: "12px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const tableStyle: CSSProperties = {
  width: "100%",
  minWidth: "520px",
  borderCollapse: "separate",
  borderSpacing: 0,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  background: "#f8fafc",
  borderBottom: "1px solid #e5e7eb",
  color: "#475569",
  fontSize: "13px",
  fontWeight: 900,
};

const tdStyle: CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #f1f5f9",
  color: "#111827",
  fontSize: "14px",
  fontWeight: 700,
};

const noticeBoxStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: "14px",
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  color: "#475569",
  fontSize: "13px",
  fontWeight: 700,
  lineHeight: 1.6,
};

const emptyBoxStyle: CSSProperties = {
  padding: "20px",
  borderRadius: "14px",
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  color: "#6b7280",
  fontSize: "14px",
  fontWeight: 700,
  lineHeight: 1.6,
};
