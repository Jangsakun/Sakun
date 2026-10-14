"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// 근로자 앱 — 내 계약서. 본인 계약서만 보이고, 서명본 PDF 를 언제든 다시 받을 수 있습니다(교부).

type MyContract = {
  id: number;
  kind: "week" | "month11";
  status: "pending" | "signed" | "void" | "ended";
  startDate: string | null;
  endDate: string | null;
  signedAt: string | null;
  hasPdf: boolean;
  isCurrent: boolean;
  entity: string | null;
};

const STATUS: Record<MyContract["status"], string> = {
  pending: "작성 필요",
  signed: "서명 완료",
  void: "무효",
  ended: "종료",
};

function identity() {
  try {
    const s = JSON.parse(localStorage.getItem("employee") || "null");
    return s?.name && s?.birthDate && s?.phoneLast4 ? { name: s.name, birthDate: s.birthDate, phoneLast4: s.phoneLast4 } : null;
  } catch {
    return null;
  }
}

export default function MyContractsPage() {
  const router = useRouter();
  const [items, setItems] = useState<MyContract[] | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const id = identity();

    if (!id) {
      router.push("/register-device");
      return;
    }

    fetch("/api/worker/econtract/mine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id), cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.success ? setItems(j.contracts) : setMessage(j.message || "불러오지 못했습니다.")))
      .catch(() => setMessage("서버에 연결하지 못했습니다."));
  }, [router]);

  const download = async (contractId: number) => {
    const id = identity();

    if (!id) return;

    const r = await fetch("/api/worker/econtract/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...id, contractId }),
    });
    const j = await r.json();

    if (j.success) window.location.href = j.url;
    else alert(j.message || "내려받지 못했습니다.");
  };

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-black px-4 py-6 [color-scheme:light]">
      <div className="mx-auto w-full max-w-[560px] rounded-[28px] bg-white px-5 py-6 shadow">
        <h1 className="mb-4 text-xl font-extrabold">내 계약서</h1>

        {message && <p className="mb-4 text-sm font-bold text-red-600">{message}</p>}
        {!items && !message && <p className="py-6 text-center text-gray-500">불러오는 중...</p>}
        {items && items.length === 0 && <p className="py-6 text-gray-600">아직 작성한 근로계약서가 없습니다.</p>}

        <div className="flex flex-col gap-3">
          {items?.map((c) => (
            <div key={c.id} className="rounded-2xl border border-gray-200 p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-extrabold">{c.kind === "week" ? "1주" : "11개월"} 근로계약서</span>
                <span className={`rounded-full px-2 py-1 text-xs font-extrabold ${c.isCurrent ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                  {c.isCurrent ? "현재 계약" : STATUS[c.status]}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                {c.startDate ? `${c.startDate} ~ ${c.endDate ?? ""}` : "기간 미정"} {c.entity ? `· ${c.entity}` : ""}
              </p>
              {c.status === "pending" && (
                <button className="mt-3 h-11 w-full rounded-xl bg-black text-sm font-extrabold text-white" onClick={() => router.push("/contract")}>
                  지금 작성하기
                </button>
              )}
              {c.hasPdf && (
                <button className="mt-3 h-11 w-full rounded-xl border border-gray-300 text-sm font-bold" onClick={() => download(c.id)}>
                  PDF 내려받기
                </button>
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
