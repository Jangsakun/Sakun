"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// 근로자 앱 — 문의사항. 본인 문의만 보이고, 관리자 답변을 여기서 확인합니다(2026-11-26).

type Inquiry = {
  id: number;
  message: string;
  answer: string | null;
  answeredAt: string | null;
  isNewAnswer: boolean;
  createdAt: string;
};

const MAX_MESSAGE = 1000;

function deviceId() {
  try {
    return localStorage.getItem("device_id") || "";
  } catch {
    return "";
  }
}

function formatKst(iso: string | null) {
  if (!iso) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

async function callApi(body: Record<string, unknown>) {
  const r = await fetch("/api/worker/inquiries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: deviceId(), ...body }),
    cache: "no-store",
  });

  return r.json();
}

export default function InquiryPage() {
  const router = useRouter();
  const [items, setItems] = useState<Inquiry[] | null>(null);
  const [message, setMessage] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await callApi({ action: "list" });

      if (!j.success) {
        setMessage(j.message || "불러오지 못했습니다.");
        return;
      }

      setItems(j.inquiries);

      if ((j.inquiries as Inquiry[]).some((i) => i.isNewAnswer)) {
        callApi({ action: "read" }).catch(() => undefined);
      }
    } catch {
      setMessage("서버에 연결하지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    if (!deviceId()) {
      router.push("/");
      return;
    }

    load();
  }, [router, load]);

  const submit = async () => {
    const trimmed = text.trim();

    if (!trimmed) {
      alert("문의 내용을 입력해주세요.");
      return;
    }

    setSending(true);

    try {
      const j = await callApi({ action: "create", message: trimmed });

      if (!j.success) {
        alert(j.message || "문의를 남기지 못했습니다.");
        return;
      }

      setText("");
      setMessage("");
      alert(j.message || "문의가 접수되었습니다.");
      await load();
    } catch {
      alert("서버에 연결하지 못했습니다.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#f5f5f7] text-black px-2 py-3 sm:px-4 sm:py-6 [color-scheme:light]">
      <div className="mx-auto w-full max-w-[560px] rounded-[24px] bg-white px-4 py-5 shadow sm:px-5 sm:py-6">
        <h1 className="mb-1 text-xl font-extrabold">문의사항</h1>
        <p className="mb-4 text-sm text-gray-600">
          근무·급여·출퇴근 등 궁금한 점을 남겨주세요. 관리자가 확인 후 이 화면에 답변드립니다.
        </p>

        <div className="rounded-2xl border border-gray-200 p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_MESSAGE))}
            placeholder="문의 내용을 입력해주세요"
            rows={5}
            className="w-full resize-none rounded-xl border border-gray-300 p-3 text-[15px] outline-none focus:border-black"
          />
          <div className="mt-1 text-right text-xs text-gray-500">
            {text.length} / {MAX_MESSAGE}
          </div>
          <button
            className="mt-2 h-12 w-full rounded-xl bg-black text-[15px] font-extrabold text-white disabled:opacity-50"
            onClick={submit}
            disabled={sending || !text.trim()}
          >
            {sending ? "보내는 중..." : "문의 남기기"}
          </button>
        </div>

        <h2 className="mb-3 mt-6 text-base font-extrabold">내 문의 내역</h2>

        {message && <p className="mb-4 text-sm font-bold text-red-600">{message}</p>}
        {!items && !message && <p className="py-6 text-center text-gray-500">불러오는 중...</p>}
        {items && items.length === 0 && <p className="py-4 text-sm text-gray-600">아직 남긴 문의가 없습니다.</p>}

        <div className="flex flex-col gap-3">
          {items?.map((q) => (
            <div key={q.id} className="rounded-2xl border border-gray-200 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">{formatKst(q.createdAt)}</span>
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-extrabold ${
                    q.answer ? (q.isNewAnswer ? "bg-red-100 text-red-700" : "bg-green-100 text-green-800") : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {q.answer ? (q.isNewAnswer ? "새 답변" : "답변 완료") : "답변 대기"}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-[15px]">{q.message}</p>
              {q.answer && (
                <div className="mt-3 rounded-xl bg-[#f0f7ff] p-3">
                  <div className="mb-1 text-xs font-extrabold text-[#1d4ed8]">
                    관리자 답변 <span className="font-normal text-gray-500">{formatKst(q.answeredAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-[15px]">{q.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <button className="mt-6 h-12 w-full rounded-xl border border-gray-300 text-[15px] font-bold" onClick={() => router.push("/")}>
          출퇴근 화면으로
        </button>
      </div>
    </main>
  );
}
