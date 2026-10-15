"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

export default function DownloadForm() {
  const params = useParams<{ token: string }>();
  const [birth6, setBirth6] = useState("");
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!/^\d{6}$/.test(birth6)) {
      setMessage("생년월일 6자리를 숫자로 입력해 주세요. (예: 900115)");
      return;
    }

    try {
      setBusy(true);
      setMessage("");
      const res = await fetch("/api/contract-link/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token, birth6 }),
        cache: "no-store",
      });
      const json = await res.json();

      if (json.success) {
        setDone(true);
        window.location.href = json.url;
        return;
      }

      setMessage(json.message || "확인하지 못했습니다.");
      if (res.status === 404 || res.status === 423) setBlocked(true);
      setBirth6("");
    } catch {
      setMessage("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#f5f5f7] text-black px-2 py-3 sm:px-4 sm:py-6 [color-scheme:light]">
      <div className="mx-auto w-full max-w-[480px] rounded-[24px] bg-white px-4 py-6 shadow sm:px-6">
        <h1 className="mb-2 text-xl font-extrabold">근로계약서 서명본 받기</h1>
        <p className="mb-5 text-sm leading-6 text-gray-600">본인 확인을 위해 생년월일 6자리를 입력해 주세요.</p>

        {!blocked && (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              value={birth6}
              onChange={(e) => setBirth6(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="예: 900115"
              aria-label="생년월일 6자리"
              className="h-12 rounded-xl border border-gray-300 px-4 text-lg tracking-widest"
            />
            <button type="submit" disabled={busy || birth6.length !== 6} className="h-12 rounded-xl bg-black text-[15px] font-extrabold text-white disabled:opacity-40">
              {busy ? "확인 중..." : "서명본(PDF) 내려받기"}
            </button>
          </form>
        )}

        {message && <p className="mt-4 text-sm font-bold text-red-600">{message}</p>}
        {done && <p className="mt-4 text-sm font-bold text-green-700">내려받기를 시작합니다. 시작되지 않으면 버튼을 다시 눌러 주세요.</p>}

        <p className="mt-6 text-xs leading-5 text-gray-400">이 링크는 문자를 받은 날부터 30일간 사용할 수 있습니다.</p>
      </div>
    </main>
  );
}
