"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// 기본 브라우저 연결 화면 (2026-10-30)
// 앱 안 브라우저에서 가입 → "출퇴근 화면 열기" → 기본 브라우저로 sakun.kr/link?t=연결표 가 열립니다.
// 이 브라우저의 기기 id 로 직원을 연결하고 출퇴근 화면으로 보냅니다. 다시 입력할 것은 없습니다.

function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem("device_id");

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("device_id", deviceId);
  }

  return deviceId;
}

export default function LinkPage() {
  const router = useRouter();
  const [message, setMessage] = useState("연결 중입니다...");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("t") || "";

    const link = async () => {
      try {
        const response = await fetch("/api/device/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ token, deviceId: getOrCreateDeviceId() }),
        });
        const data = await response.json();

        if (!data.success) {
          setFailed(true);
          setMessage(data.message || "연결에 실패했습니다.");
          return;
        }

        localStorage.setItem("employee", JSON.stringify(data.employee));
        setMessage("연결 완료! 출퇴근 화면으로 이동합니다.");
        // 주소창에 연결표가 남지 않게 replace 로 이동합니다.
        setTimeout(() => router.replace("/"), 800);
      } catch {
        setFailed(true);
        setMessage("연결 중 오류가 발생했습니다. 다시 시도해주세요.");
      }
    };

    link();
  }, [router]);

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-black flex items-center justify-center px-4 py-8 [color-scheme:light]">
      <div className="w-full max-w-[430px] rounded-[32px] bg-white px-6 py-8 text-center shadow">
        <h1 className="text-xl font-bold">출퇴근 화면 연결</h1>
        <p className="mt-4 text-base text-gray-700">{message}</p>
        {failed && (
          <button
            type="button"
            onClick={() => router.replace("/register-device")}
            className="mt-6 h-12 w-full rounded-2xl bg-black text-white font-semibold"
          >
            가입 화면으로
          </button>
        )}
      </div>
    </main>
  );
}
