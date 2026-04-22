"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PayrollRow = {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  paidMinutes: number;
  grossPay: number;
  netPay: number;
  isWorking: boolean;
  lunchDeducted?: boolean;
  checkInRecordId: string | null;
  checkOutRecordId: string | null;
  checkInText: string;
  checkOutText: string;
  workText: string;
  lunchText?: string;
};

type PayrollResponse = {
  success: boolean;
  message?: string;
  employee?: {
    id: string;
    name: string;
    residentNumber: string;
    hourlyWage: number;
  };
  range?: {
    startDate: string;
    endDate: string;
  };
  summary?: {
    totalMinutes: number;
    totalWorkText: string;
    totalGrossPay: number;
    totalNetPay: number;
  };
  weeklyAllowance?: {
    status: string;
    amount: number;
    displayText: string;
  };
  dailyRows?: PayrollRow[];
};

function formatWon(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function getToday() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function getWeekStartMonday(dateStr?: string) {
  const base = dateStr ? new Date(`${dateStr}T00:00:00+09:00`) : new Date();
  const kst = new Date(base.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(kst);
  monday.setUTCDate(kst.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  const result = new Date(monday.getTime() - 9 * 60 * 60 * 1000);
  return result.toISOString().slice(0, 10);
}

const iosInputStyle = {
  color: "#000",
  backgroundColor: "#fff",
  WebkitTextFillColor: "#000",
  opacity: 1,
} as const;

export default function WorkerPayrollPage() {
  const statementRef = useRef<HTMLDivElement | null>(null);

  const [name, setName] = useState("");
  const [residentNumber, setResidentNumber] = useState("");

  const [activeTab, setActiveTab] = useState<
    "currentWeek" | "byDate" | "weeklyStatement"
  >("currentWeek");

  const [singleDate, setSingleDate] = useState(getToday());
  const [rangeStartDate, setRangeStartDate] = useState(getToday());
  const [rangeEndDate, setRangeEndDate] = useState(getToday());
  const [statementWeekStart, setStatementWeekStart] = useState(
    getWeekStartMonday()
  );

  const [useRange, setUseRange] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<PayrollResponse | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("workerPayrollAuth");
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      setName(parsed.name || "");
      setResidentNumber(parsed.residentNumber || "");
    } catch {}
  }, []);

  useEffect(() => {
    if (!name && !residentNumber) return;

    localStorage.setItem(
      "workerPayrollAuth",
      JSON.stringify({
        name,
        residentNumber,
      })
    );
  }, [name, residentNumber]);

  const canSearch = useMemo(() => {
    return name.trim().length > 0 && residentNumber.trim().length === 13;
  }, [name, residentNumber]);

  const fetchPayroll = async () => {
    if (!canSearch) {
      setMessage("이름과 주민번호 13자리를 입력해주세요.");
      return;
    }

    setLoading(true);
    setMessage("");
    setResult(null);

    try {
      const body: Record<string, string> = {
        action: activeTab,
        name: name.trim(),
        residentNumber: residentNumber.trim(),
      };

      if (activeTab === "byDate") {
        if (useRange) {
          body.startDate = rangeStartDate;
          body.endDate = rangeEndDate;
        } else {
          body.date = singleDate;
        }
      }

      if (activeTab === "weeklyStatement") {
        body.weekStartDate = statementWeekStart;
      }

      const res = await fetch("/api/worker/payroll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data: PayrollResponse = await res.json();

      if (!res.ok || !data.success) {
        setMessage(data.message || "조회에 실패했습니다.");
        return;
      }

      setResult(data);
    } catch {
      setMessage("급여 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetSavedInfo = () => {
    localStorage.removeItem("workerPayrollAuth");
    setName("");
    setResidentNumber("");
    setResult(null);
    setMessage("저장된 본인 확인 정보가 삭제되었습니다.");
  };

  const handleTabChange = (
    tab: "currentWeek" | "byDate" | "weeklyStatement"
  ) => {
    setActiveTab(tab);
    setMessage("");
    setResult(null);
  };

  const handleDownloadPDF = () => {
    if (!result || !result.employee || !result.summary) {
      setMessage("먼저 주급 명세서를 조회해주세요.");
      return;
    }

    const printContents = statementRef.current?.innerHTML;
    if (!printContents) {
      setMessage("출력할 명세서가 없습니다.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      setMessage("팝업이 차단되어 있습니다. 팝업 허용 후 다시 시도해주세요.");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>주급 명세서</title>
          <style>
            body {
              font-family: Arial, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
              padding: 24px;
              color: #111;
            }
            h1, h2, h3, p {
              margin: 0 0 12px 0;
            }
            .header {
              margin-bottom: 24px;
              border-bottom: 2px solid #111;
              padding-bottom: 12px;
            }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
              margin: 20px 0;
            }
            .card {
              border: 1px solid #ddd;
              border-radius: 12px;
              padding: 12px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 16px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 10px;
              text-align: left;
              font-size: 14px;
            }
            th {
              background: #f5f5f5;
            }
            .foot {
              margin-top: 16px;
              font-size: 12px;
              color: #666;
              line-height: 1.7;
            }
          </style>
        </head>
        <body>
          ${printContents}
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">근로자 급여 조회</h1>
              <p className="mt-2 text-sm text-gray-600">
                이름과 주민번호로 본인 급여를 조회할 수 있습니다.
              </p>
            </div>
            <button
              onClick={handleResetSavedInfo}
              className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700"
            >
              저장정보 삭제
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">본인 확인</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                이름
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="이름 입력"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-black bg-white placeholder-gray-400 outline-none focus:border-black"
                style={iosInputStyle}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                주민번호 (숫자만 입력)
              </label>
              <input
                type="text"
                value={residentNumber}
                onChange={(e) => {
                  let onlyNumber = e.target.value.replace(/[^0-9]/g, "");
                  if (onlyNumber.length > 13) {
                    onlyNumber = onlyNumber.slice(0, 13);
                  }
                  setResidentNumber(onlyNumber);
                }}
                placeholder="예: 9711081234567"
                maxLength={13}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-black bg-white placeholder-gray-400 outline-none focus:border-black"
                style={iosInputStyle}
                autoCapitalize="off"
                autoCorrect="off"
                inputMode="numeric"
              />
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => handleTabChange("currentWeek")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                activeTab === "currentWeek"
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              실시간 주단위 급여
            </button>

            <button
              onClick={() => handleTabChange("byDate")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                activeTab === "byDate"
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              날짜별 급여 조회
            </button>

            <button
              onClick={() => handleTabChange("weeklyStatement")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                activeTab === "weeklyStatement"
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              주급 명세서 조회
            </button>
          </div>

          {activeTab === "byDate" && (
            <div className="rounded-2xl border border-gray-200 p-4">
              <div className="mb-4 flex gap-2">
                <button
                  onClick={() => setUseRange(false)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                    !useRange ? "bg-black text-white" : "bg-gray-100 text-gray-700"
                  }`}
                >
                  하루 조회
                </button>
                <button
                  onClick={() => setUseRange(true)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                    useRange ? "bg-black text-white" : "bg-gray-100 text-gray-700"
                  }`}
                >
                  기간 조회
                </button>
              </div>

              {!useRange ? (
                <div className="max-w-sm">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    조회 날짜
                  </label>
                  <input
                    type="date"
                    value={singleDate}
                    onChange={(e) => setSingleDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-black bg-white outline-none focus:border-black"
                    style={iosInputStyle}
                  />
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      시작일
                    </label>
                    <input
                      type="date"
                      value={rangeStartDate}
                      onChange={(e) => setRangeStartDate(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-black bg-white outline-none focus:border-black"
                      style={iosInputStyle}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      종료일
                    </label>
                    <input
                      type="date"
                      value={rangeEndDate}
                      onChange={(e) => setRangeEndDate(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-black bg-white outline-none focus:border-black"
                      style={iosInputStyle}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "weeklyStatement" && (
            <div className="max-w-sm rounded-2xl border border-gray-200 p-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                주 시작일(월요일)
              </label>
              <input
                type="date"
                value={statementWeekStart}
                onChange={(e) => setStatementWeekStart(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-black bg-white outline-none focus:border-black"
                style={iosInputStyle}
              />
            </div>
          )}

          <button
            onClick={fetchPayroll}
            disabled={loading}
            className="mt-5 w-full rounded-2xl bg-black px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
          >
            {loading ? "조회 중..." : "급여 조회하기"}
          </button>

          {message && (
            <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {message}
            </div>
          )}
        </div>

        {result?.success && result.employee && result.summary && result.range && (
          <>
            <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {result.employee.name}님 급여 정보
                  </h3>
                  <p className="mt-1 text-sm text-gray-600">
                    조회 기간: {result.range.startDate} ~ {result.range.endDate}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    시급: {formatWon(result.employee.hourlyWage)}
                  </p>
                </div>

                {activeTab === "weeklyStatement" && (
                  <button
                    onClick={handleDownloadPDF}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    주급 명세서 PDF 저장
                  </button>
                )}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-5">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">총 근무시간</p>
                  <p className="mt-2 text-xl font-bold text-gray-900">
                    {result.summary.totalWorkText}
                  </p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">총 지급 급여</p>
                  <p className="mt-2 text-xl font-bold text-gray-900">
                    {formatWon(result.summary.totalGrossPay)}
                  </p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">세후 급여</p>
                  <p className="mt-2 text-xl font-bold text-blue-600">
                    {formatWon(result.summary.totalNetPay)}
                  </p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">주휴수당</p>
                  <p className="mt-2 text-xl font-bold text-gray-900">
                    {result.weeklyAllowance?.displayText || "해당 없음"}
                  </p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">근무 일수</p>
                  <p className="mt-2 text-xl font-bold text-gray-900">
                    {result.dailyRows?.filter((row) => row.paidMinutes > 0).length || 0}
                    일
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-lg font-bold text-gray-900">상세 내역</h3>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="px-3 py-3 text-sm font-semibold text-gray-700">날짜</th>
                      <th className="px-3 py-3 text-sm font-semibold text-gray-700">출근</th>
                      <th className="px-3 py-3 text-sm font-semibold text-gray-700">퇴근</th>
                      <th className="px-3 py-3 text-sm font-semibold text-gray-700">근무시간</th>
                      <th className="px-3 py-3 text-sm font-semibold text-gray-700">휴게 반영</th>
                      <th className="px-3 py-3 text-sm font-semibold text-gray-700">지급 급여</th>
                      <th className="px-3 py-3 text-sm font-semibold text-gray-700">세후 급여</th>
                      <th className="px-3 py-3 text-sm font-semibold text-gray-700">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(result.dailyRows || []).length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-3 py-6 text-center text-sm text-gray-500"
                        >
                          조회된 출퇴근 기록이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      result.dailyRows!.map((row) => (
                        <tr key={row.date} className="border-b border-gray-100">
                          <td className="px-3 py-3 text-sm text-gray-900">{row.date}</td>
                          <td className="px-3 py-3 text-sm text-gray-900">{row.checkInText}</td>
                          <td className="px-3 py-3 text-sm text-gray-900">{row.checkOutText}</td>
                          <td className="px-3 py-3 text-sm text-gray-900">{row.workText}</td>
                          <td className="px-3 py-3 text-sm text-gray-900">
                            {row.lunchDeducted ? (
                              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                                점심 1시간 제외
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-3 py-3 text-sm font-semibold text-gray-900">
                            {formatWon(row.grossPay)}
                          </td>
                          <td className="px-3 py-3 text-sm font-semibold text-blue-600">
                            {formatWon(row.netPay)}
                          </td>
                          <td className="px-3 py-3 text-sm">
                            {row.isWorking ? (
                              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                                실시간 계산중
                              </span>
                            ) : (
                              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                                확정
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

            </div>

            <div className="mt-6 hidden">
              <div ref={statementRef}>
                <div className="header">
                  <h1>주급 명세서</h1>
                  <p>이름: {result.employee.name}</p>
                  <p>
                    조회 기간: {result.range.startDate} ~ {result.range.endDate}
                  </p>
                  <p>시급: {formatWon(result.employee.hourlyWage)}</p>
                  <p>
                    주휴수당: {result.weeklyAllowance?.displayText || "해당 없음"}
                  </p>
                </div>

                <div className="summary-grid">
                  <div className="card">
                    <h3>총 근무시간</h3>
                    <p>{result.summary.totalWorkText}</p>
                  </div>
                  <div className="card">
                    <h3>총 지급 급여</h3>
                    <p>{formatWon(result.summary.totalGrossPay)}</p>
                  </div>
                  <div className="card">
                    <h3>세후 급여</h3>
                    <p>{formatWon(result.summary.totalNetPay)}</p>
                  </div>
                  <div className="card">
                    <h3>주휴수당</h3>
                    <p>{result.weeklyAllowance?.displayText || "해당 없음"}</p>
                  </div>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>출근</th>
                      <th>퇴근</th>
                      <th>근무시간</th>
                      <th>휴게 반영</th>
                      <th>지급 급여</th>
                      <th>세후 급여</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(result.dailyRows || []).map((row) => (
                      <tr key={`print-${row.date}`}>
                        <td>{row.date}</td>
                        <td>{row.checkInText}</td>
                        <td>{row.checkOutText}</td>
                        <td>{row.workText}</td>
                        <td>{row.lunchDeducted ? "점심 1시간 제외" : "-"}</td>
                        <td>{formatWon(row.grossPay)}</td>
                        <td>{formatWon(row.netPay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="foot">
  <div
    style={{
      marginTop: "30px",
      textAlign: "right",
    }}
  >
    <div style={{ fontSize: "14px", marginBottom: "8px" }}>
      (주)장사꾼을위한장사꾼
    </div>

    <img
      src="/stamp.png"
      alt="직인"
      style={{
        width: "120px",
        opacity: 0.9,
      }}
    />
  </div>
</div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}