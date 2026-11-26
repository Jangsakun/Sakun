"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// 근로자 앱 — 문의사항. 본인 문의만 보이고, 관리자 답변을 여기서 확인합니다(2026-11-26).

type Inquiry = {
  id: number;
  message: string;
  photos?: string[];
  answer: string | null;
  answeredAt: string | null;
  isNewAnswer: boolean;
  createdAt: string;
};

const MAX_MESSAGE = 1000;
const MAX_PHOTOS = 3;
const PHOTO_MAX_SIDE = 1600;

// 휴대폰 사진(수 MB)을 긴 변 1600px JPEG 로 줄입니다. 서버에는 JPEG 만 올라갑니다.
async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("load"));
      el.src = url;
    });

    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("canvas");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);

  const addPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const room = MAX_PHOTOS - photos.length;

    if (room <= 0) {
      alert(`사진은 ${MAX_PHOTOS}장까지 붙일 수 있습니다.`);
      return;
    }

    if (files.length > room) alert(`사진은 ${MAX_PHOTOS}장까지라 앞의 ${room}장만 붙입니다.`);

    setPhotoBusy(true);

    try {
      const added: string[] = [];

      for (const file of Array.from(files).slice(0, room)) {
        try {
          added.push(await shrinkPhoto(file));
        } catch {
          alert("사진을 읽지 못했습니다. 다른 사진으로 시도해주세요.");
        }
      }

      setPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
    } finally {
      setPhotoBusy(false);
    }
  };

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

    if (!trimmed && photos.length === 0) {
      alert("문의 내용을 입력해주세요.");
      return;
    }

    setSending(true);

    try {
      const j = await callApi({ action: "create", message: trimmed, photos });

      if (!j.success) {
        alert(j.message || "문의를 남기지 못했습니다.");
        return;
      }

      setText("");
      setPhotos([]);
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
          {photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {photos.map((src, i) => (
                <div key={i} className="relative h-20 w-20 overflow-hidden rounded-xl border border-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`첨부 사진 ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="사진 빼기"
                    className="absolute right-1 top-1 h-6 w-6 rounded-full bg-black/70 text-xs font-bold text-white"
                    onClick={() => setPhotos((prev) => prev.filter((_, k) => k !== i))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <label
            className={`mt-2 flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-gray-300 text-sm font-bold ${
              photos.length >= MAX_PHOTOS || photoBusy ? "opacity-50" : ""
            }`}
          >
            {photoBusy ? "사진 준비 중..." : `📷 사진 첨부 (${photos.length}/${MAX_PHOTOS})`}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={photos.length >= MAX_PHOTOS || photoBusy}
              onChange={(e) => {
                addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          <button
            className="mt-2 h-12 w-full rounded-xl bg-black text-[15px] font-extrabold text-white disabled:opacity-50"
            onClick={submit}
            disabled={sending || photoBusy || (!text.trim() && photos.length === 0)}
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
              {q.photos && q.photos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.photos.map((src, i) => (
                    <a key={i} href={src} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-xl border border-gray-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`첨부 사진 ${i + 1}`} className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
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
