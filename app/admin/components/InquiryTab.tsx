"use client";

import { CSSProperties, useCallback, useEffect, useState } from "react";

// 관리자 — 근로자 문의사항 답변(2026-11-26).

type Inquiry = {
  id: number;
  employeeId: number;
  employeeName: string;
  workplaceName: string | null;
  message: string;
  photos?: string[];
  answer: string | null;
  answeredAt: string | null;
  answerReadAt: string | null;
  createdAt: string;
};

type Filter = "pending" | "answered" | "all";

function formatKst(iso: string | null) {
  if (!iso) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export default function InquiryTab({ onPendingCount }: { onPendingCount?: (count: number) => void }) {
  const [items, setItems] = useState<Inquiry[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<Record<number, boolean>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/inquiries", { cache: "no-store" });
      const j = await r.json();

      if (!j.success) {
        setError(j.message || "불러오지 못했습니다.");
        return;
      }

      setError("");
      setItems(j.inquiries);
      onPendingCount?.(j.pendingCount ?? 0);
    } catch {
      setError("서버에 연결하지 못했습니다.");
    }
  }, [onPendingCount]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (item: Inquiry) => {
    const answer = (drafts[item.id] ?? item.answer ?? "").trim();

    if (!answer) {
      alert("답변 내용을 입력해주세요.");
      return;
    }

    setSavingId(item.id);

    try {
      const r = await fetch("/api/admin/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, answer }),
      });
      const j = await r.json();

      if (!j.success) {
        alert(j.message || "답변을 저장하지 못했습니다.");
        return;
      }

      setEditing((prev) => ({ ...prev, [item.id]: false }));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      await load();
    } catch {
      alert("서버에 연결하지 못했습니다.");
    } finally {
      setSavingId(null);
    }
  };

  if (error) return <p style={{ color: "#dc2626", fontWeight: 700 }}>{error}</p>;
  if (!items) return <p style={{ color: "#6b7280" }}>불러오는 중...</p>;

  const pending = items.filter((i) => !i.answer);
  const answered = items.filter((i) => !!i.answer);
  const shown = filter === "pending" ? pending : filter === "answered" ? answered : items;

  const filterButton = (value: Filter): CSSProperties => ({
    padding: "8px 14px",
    borderRadius: "999px",
    border: "1px solid #e5e7eb",
    backgroundColor: filter === value ? "#111827" : "#ffffff",
    color: filter === value ? "#ffffff" : "#111827",
    fontWeight: 700,
    fontSize: "14px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px", alignItems: "center" }}>
        <button style={filterButton("pending")} onClick={() => setFilter("pending")}>
          답변 대기 {pending.length}
        </button>
        <button style={filterButton("answered")} onClick={() => setFilter("answered")}>
          답변 완료 {answered.length}
        </button>
        <button style={filterButton("all")} onClick={() => setFilter("all")}>
          전체 {items.length}
        </button>
        <button style={{ ...filterButton("all"), backgroundColor: "#ffffff", color: "#111827", marginLeft: "auto" }} onClick={load}>
          새로고침
        </button>
      </div>

      {shown.length === 0 && (
        <p style={{ color: "#6b7280", padding: "24px 0", textAlign: "center" }}>
          {filter === "pending" ? "답변할 문의가 없습니다." : "문의가 없습니다."}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {shown.map((item) => {
          const isEditing = !item.answer || editing[item.id];
          const draft = drafts[item.id] ?? item.answer ?? "";

          return (
            <div key={item.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                <div style={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                  {item.employeeName}
                  {item.workplaceName && <span style={{ color: "#6b7280", fontWeight: 600, marginLeft: "6px" }}>{item.workplaceName}</span>}
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center", whiteSpace: "nowrap" }}>
                  <span style={{ color: "#6b7280", fontSize: "13px" }}>{formatKst(item.createdAt)}</span>
                  <span style={badgeStyle(item)}>{item.answer ? (item.answerReadAt ? "근로자 확인" : "답변 완료") : "답변 대기"}</span>
                </div>
              </div>

              <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: "15px", lineHeight: 1.5 }}>{item.message}</p>

              {item.photos && item.photos.length > 0 && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                  {item.photos.map((src, i) => (
                    <a
                      key={i}
                      href={src}
                      target="_blank"
                      rel="noreferrer"
                      title="크게 보기"
                      style={{ display: "block", width: "96px", height: "96px", borderRadius: "10px", overflow: "hidden", border: "1px solid #e5e7eb" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`첨부 사진 ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </a>
                  ))}
                </div>
              )}

              {!isEditing && item.answer && (
                <div style={answerBoxStyle}>
                  <div style={{ fontSize: "12px", fontWeight: 800, color: "#1d4ed8", marginBottom: "4px" }}>
                    답변 <span style={{ fontWeight: 500, color: "#6b7280" }}>{formatKst(item.answeredAt)}</span>
                  </div>
                  <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: "15px", lineHeight: 1.5 }}>{item.answer}</p>
                  <button style={{ ...smallButtonStyle, marginTop: "8px" }} onClick={() => setEditing((prev) => ({ ...prev, [item.id]: true }))}>
                    답변 수정
                  </button>
                </div>
              )}

              {isEditing && (
                <div style={{ marginTop: "12px" }}>
                  <textarea
                    value={draft}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value.slice(0, 2000) }))}
                    placeholder="답변을 입력하세요. 저장하면 근로자 화면에 바로 보입니다."
                    rows={3}
                    style={textareaStyle}
                  />
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "8px" }}>
                    {item.answer && (
                      <button
                        style={smallButtonStyle}
                        onClick={() => {
                          setEditing((prev) => ({ ...prev, [item.id]: false }));
                          setDrafts((prev) => {
                            const next = { ...prev };
                            delete next[item.id];
                            return next;
                          });
                        }}
                      >
                        취소
                      </button>
                    )}
                    <button
                      style={{ ...smallButtonStyle, backgroundColor: "#111827", color: "#ffffff", border: "1px solid #111827" }}
                      onClick={() => save(item)}
                      disabled={savingId === item.id || !draft.trim()}
                    >
                      {savingId === item.id ? "저장 중..." : item.answer ? "수정 저장" : "답변 저장"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function badgeStyle(item: Inquiry): CSSProperties {
  const [bg, fg] = !item.answer ? ["#fee2e2", "#b91c1c"] : item.answerReadAt ? ["#dcfce7", "#166534"] : ["#dbeafe", "#1d4ed8"];

  return { backgroundColor: bg, color: fg, borderRadius: "999px", padding: "3px 8px", fontSize: "12px", fontWeight: 800 };
}

const cardStyle: CSSProperties = {
  color: "#111827",
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  padding: "14px",
  backgroundColor: "#ffffff",
};

const answerBoxStyle: CSSProperties = {
  color: "#111827",
  marginTop: "12px",
  backgroundColor: "#f0f7ff",
  borderRadius: "10px",
  padding: "10px 12px",
};

const textareaStyle: CSSProperties = {
  color: "#111827",
  backgroundColor: "#ffffff",
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d1d5db",
  borderRadius: "10px",
  padding: "10px",
  fontSize: "15px",
  resize: "vertical",
  fontFamily: "inherit",
};

const smallButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  backgroundColor: "#ffffff",
  color: "#111827",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
