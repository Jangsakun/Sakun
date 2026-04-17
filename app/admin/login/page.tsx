"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!password) {
      setMessage("비밀번호를 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem("admin_logged_in", "true");
        setMessage("로그인 성공");

        setTimeout(() => {
          router.push("/admin");
        }, 500);
      } else {
        setMessage(data.message || "로그인 실패");
      }
    } catch (error) {
      console.error(error);
      setMessage("서버 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  return (
    <main className="min-h-screen bg-[#f5f5f7] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[430px]">
        <div className="rounded-[32px] bg-white shadow-[0_10px_40px_rgba(0,0,0,0.08)] px-6 py-8 sm:px-7">
          <div className="mb-8">
            <p className="text-sm font-medium text-gray-500">관리자 전용</p>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.02em] text-black">
              관리자 로그인
            </h1>
            <p className="mt-2 text-[15px] leading-6 text-gray-500">
              관리자 비밀번호를 입력하고 대시보드에 접속하세요.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-3 block text-[15px] font-semibold text-black">
                비밀번호
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="비밀번호 입력"
                className="h-14 w-full rounded-2xl border border-gray-200 bg-[#fafafa] px-4 text-[16px] text-black outline-none transition focus:border-black focus:bg-white"
              />
            </div>

            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="mt-2 h-14 w-full rounded-2xl bg-black text-[16px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {isLoading ? "로그인 중..." : "로그인"}
            </button>

            {message && (
              <p
                className={`pt-1 text-center text-sm ${
                  message.includes("성공")
                    ? "text-green-600"
                    : "text-red-500"
                }`}
              >
                {message}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}