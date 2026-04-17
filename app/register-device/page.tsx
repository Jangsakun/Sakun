"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterDevicePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!name || !birthDate || !phoneLast4) {
      setMessage("모든 항목을 입력해주세요.");
      return;
    }

    if (birthDate.length !== 6) {
      setMessage("생년월일 6자리를 정확히 입력해주세요.");
      return;
    }

    if (phoneLast4.length !== 4) {
      setMessage("휴대폰 끝 4자리를 정확히 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setMessage("등록 중...");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          birthDate,
          phoneLast4,
        }),
      });

      const text = await response.text();
      console.log("register 응답 원문:", text);

      let data;

      try {
        data = JSON.parse(text);
      } catch (error) {
        console.error("JSON 파싱 실패:", error);
        setMessage("서버가 JSON이 아닌 응답을 보냈습니다.");
        return;
      }

      if (data.success) {
        localStorage.setItem("employee", JSON.stringify(data.employee));
        setIsSuccess(true);
        setMessage("등록 완료!");

        setTimeout(() => {
          router.push("/");
        }, 1400);
      } else {
        console.log("register 에러 응답:", data);
        setMessage(
          data.debug?.text ||
            data.debug?.message ||
            data.message ||
            "등록 실패"
        );
      }
    } catch (error) {
      console.error(error);
      setMessage("서버 오류 발생");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style jsx>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes popIn {
          0% {
            transform: scale(0.7);
            opacity: 0;
          }
          70% {
            transform: scale(1.08);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes drawCheck {
          from {
            stroke-dashoffset: 30;
          }
          to {
            stroke-dashoffset: 0;
          }
        }

        .fade-up {
          animation: fadeUp 0.4s ease-out;
        }

        .success-pop {
          animation: popIn 0.35s ease-out;
        }

        .check-path {
          stroke-dasharray: 30;
          stroke-dashoffset: 30;
          animation: drawCheck 0.35s ease-out 0.15s forwards;
        }
      `}</style>

      <main className="min-h-screen bg-[#f5f5f7] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[430px]">
          <div className="rounded-[32px] bg-white shadow-[0_10px_40px_rgba(0,0,0,0.08)] px-6 py-7 sm:px-7 sm:py-8">
            <button
              type="button"
              onClick={() => router.back()}
              className="mb-6 inline-flex items-center text-sm font-medium text-gray-500 transition hover:text-black"
            >
              ← 뒤로가기
            </button>

            <div className="fade-up">
              <h1 className="text-[30px] font-bold tracking-[-0.02em] text-black">
                기기 등록
              </h1>
              <p className="mt-2 text-[15px] leading-6 text-gray-500">
                처음 1회만 본인 정보를 입력해주세요.
              </p>
            </div>

            {isSuccess ? (
              <div className="success-pop flex flex-col items-center justify-center py-14">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-50">
                  <svg
                    width="52"
                    height="52"
                    viewBox="0 0 52 52"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle
                      cx="26"
                      cy="26"
                      r="24"
                      stroke="#22C55E"
                      strokeWidth="3"
                    />
                    <path
                      className="check-path"
                      d="M16 27L23 34L37 19"
                      stroke="#22C55E"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                <p className="mt-5 text-[24px] font-bold text-black">
                  등록 완료
                </p>
                <p className="mt-2 text-[15px] text-gray-500">
                  잠시 후 홈으로 이동합니다.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-10 space-y-7">
                  <div>
                    <label className="mb-3 block text-[15px] font-semibold text-black">
                      이름
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="이름 입력"
                      className="h-14 w-full rounded-2xl border border-gray-200 bg-[#fafafa] px-4 text-[16px] text-black outline-none transition focus:border-black focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="mb-3 block text-[15px] font-semibold text-black">
                      생년월일
                    </label>
                    <input
                      value={birthDate}
                      onChange={(e) =>
                        setBirthDate(
                          e.target.value.replace(/[^0-9]/g, "").slice(0, 6)
                        )
                      }
                      placeholder="예: 990101"
                      inputMode="numeric"
                      maxLength={6}
                      className="h-14 w-full rounded-2xl border border-gray-200 bg-[#fafafa] px-4 text-[16px] text-black outline-none transition focus:border-black focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="mb-3 block text-[15px] font-semibold text-black">
                      휴대폰 끝 4자리
                    </label>
                    <input
                      value={phoneLast4}
                      onChange={(e) =>
                        setPhoneLast4(
                          e.target.value.replace(/[^0-9]/g, "").slice(0, 4)
                        )
                      }
                      placeholder="예: 1234"
                      inputMode="numeric"
                      maxLength={4}
                      className="h-14 w-full rounded-2xl border border-gray-200 bg-[#fafafa] px-4 text-[16px] text-black outline-none transition focus:border-black focus:bg-white"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={isLoading}
                  className="mt-8 h-14 w-full rounded-2xl bg-black text-[16px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {isLoading ? "처리 중..." : "등록하기"}
                </button>

                {message && (
                  <p
                    className={`mt-4 text-center text-sm ${
                      message.includes("완료")
                        ? "text-green-600"
                        : message.includes("중")
                        ? "text-gray-500"
                        : "text-red-500"
                    }`}
                  >
                    {message}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}