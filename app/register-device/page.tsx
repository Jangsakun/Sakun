"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem("device_id");

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("device_id", deviceId);
  }

  return deviceId;
}

export default function RegisterDevicePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [residentNumber, setResidentNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [reconnectCode, setReconnectCode] = useState("");
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);

  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!name || !phone || !residentNumber || !bankName || !accountNumber) {
      setMessage("모든 항목을 입력해주세요.");
      return;
    }

    if (residentNumber.replace(/[^0-9]/g, "").length !== 13) {
      setMessage("주민번호 13자리를 정확히 입력해주세요.");
      return;
    }

    if (!agreedToPrivacy) {
      setMessage("개인정보 수집 및 이용 동의가 필요합니다.");
      return;
    }

    const deviceId = getOrCreateDeviceId();

    setIsLoading(true);
    setMessage("처리 중...");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          phone,
          residentNumber,
          bankName,
          accountNumber,
          reconnectCode,
          deviceId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem("employee", JSON.stringify(data.employee));
        setIsSuccess(true);

        if (data.reconnected) {
          setMessage("기기 재연결 완료!");
        } else {
          setMessage("등록 완료!");
        }

        setTimeout(() => {
          router.push("/");
        }, 1400);
      } else {
        setMessage(data.message || "등록 실패");
      }
    } catch (error) {
      console.error(error);
      setMessage("서버 오류 발생");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f5f5f7] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[430px]">
        <div className="rounded-[32px] bg-white shadow px-6 py-7">
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-6 text-sm text-gray-500"
          >
            ← 뒤로가기
          </button>

          <h1 className="text-2xl font-bold">회원 등록</h1>

          {isSuccess ? (
            <div className="py-10 text-center text-green-600">
              완료! 이동 중...
            </div>
          ) : (
            <>
              <div className="mt-6 space-y-5">
                <input
                  placeholder="이름"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-12 border rounded px-3"
                />

                <input
                  placeholder="휴대폰번호 (01012345678)"
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  className="w-full h-12 border rounded px-3"
                />

                <input
                  placeholder="주민번호 (앞6 + 뒤7)"
                  value={residentNumber}
                  onChange={(e) =>
                    setResidentNumber(
                      e.target.value.replace(/[^0-9]/g, "").slice(0, 13)
                    )
                  }
                  className="w-full h-12 border rounded px-3"
                />

                <input
                  placeholder="은행명"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full h-12 border rounded px-3"
                />

                <input
                  placeholder="계좌번호"
                  value={accountNumber}
                  onChange={(e) =>
                    setAccountNumber(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  className="w-full h-12 border rounded px-3"
                />

                <input
                  placeholder="재연결 코드 (휴대폰 변경 시만 입력)"
                  value={reconnectCode}
                  onChange={(e) =>
                    setReconnectCode(e.target.value.toUpperCase())
                  }
                  className="w-full h-12 border rounded px-3"
                />

                <p className="text-xs text-gray-400">
                  휴대폰을 변경한 경우 관리자에게 받은 재연결 코드를 입력하세요
                </p>

                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreedToPrivacy}
                      onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="text-sm text-gray-700">
                      <p className="font-medium text-gray-900">
                        개인정보 수집 및 이용에 동의합니다.
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-gray-600">
                        <li>
                          - 수집항목: 이름, 휴대전화번호, 주민등록번호,
                          은행명, 계좌번호
                        </li>
                        <li>
                          - 이용목적: 근태관리, 급여 지급 및 관련 법적 의무
                          이행
                        </li>
                        <li>
                          - 보유기간: 퇴사 후 3년 (관련 법령에 따라 보관이
                          필요한 경우 해당 기간까지 보관)
                        </li>
                        <li>
                          - 동의 거부 시 서비스 이용(회원 등록)이 제한될 수
                          있습니다.
                        </li>
                      </ul>
                    </div>
                  </label>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="mt-6 w-full h-12 bg-black text-white rounded"
              >
                {isLoading ? "처리 중..." : "등록하기"}
              </button>

              {message && (
                <p className="mt-3 text-center text-sm text-red-500">
                  {message}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}