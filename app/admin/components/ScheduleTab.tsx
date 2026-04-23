"use client";

import { useEffect, useMemo, useState } from "react";

type EmployeeItem = {
  id?: number | string;
  name: string;
};

type ScheduleApiResponse = {
  success: boolean;
  message?: string;
  data?: {
    available: EmployeeItem[];
    unavailable: EmployeeItem[];
    notSubmitted: EmployeeItem[];
    summary: {
      total: number;
      available: number;
      unavailable: number;
      notSubmitted: number;
    };
  };
};

type DayItem = {
  label: string;
  value: string;
};

function getMondayOfCurrentWeekInKst() {
  const now = new Date();
  const seoulNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );

  const day = seoulNow.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  seoulNow.setHours(0, 0, 0, 0);
  seoulNow.setDate(seoulNow.getDate() + diff);

  return seoulNow;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthDay(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}.${day}`;
}

function getCurrentWeekDaysInKst(): DayItem[] {
  const monday = getMondayOfCurrentWeekInKst();
  const labels = ["월", "화", "수", "목", "금"];

  return [0, 1, 2, 3, 4].map((offset) => {
    const date = addDays(monday, offset);

    return {
      label: `${labels[offset]} (${formatMonthDay(date)})`,
      value: formatDateKey(date),
    };
  });
}

export default function ScheduleTab() {
  const days = useMemo(() => getCurrentWeekDaysInKst(), []);
  const [selectedDate, setSelectedDate] = useState<string>(days[0]?.value || "");
  const [data, setData] = useState<ScheduleApiResponse["data"] | null>(null);
  const [loading, setLoading] = useState(false);

  const [showUnavailable, setShowUnavailable] = useState(false);
  const [showNotSubmitted, setShowNotSubmitted] = useState(false);

  const fetchSchedule = async (date: string) => {
    if (!date) return;

    try {
      setLoading(true);

      const res = await fetch(`/api/admin/schedule?date=${date}`, {
        method: "GET",
        cache: "no-store",
      });

      const result: ScheduleApiResponse = await res.json();

      if (result.success && result.data) {
        setData(result.data);
      } else {
        setData(null);
      }
    } catch (error) {
      console.error("스케줄 조회 실패:", error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedDate && days[0]?.value) {
      setSelectedDate(days[0].value);
      return;
    }

    if (selectedDate) {
      fetchSchedule(selectedDate);
    }
  }, [selectedDate, days]);

  useEffect(() => {
    setShowUnavailable(false);
    setShowNotSubmitted(false);
  }, [selectedDate]);

  return (
    <div style={{ marginTop: "20px" }}>
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "10px" }}>
        스케줄 조회
      </h2>

      <p
        style={{
          marginTop: 0,
          marginBottom: "16px",
          color: "#6b7280",
          fontSize: "14px",
        }}
      >
        이번 주 요일별 출근 가능 인원을 확인할 수 있습니다.
      </p>

      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        {days.map((day) => (
          <button
            key={day.value}
            onClick={() => setSelectedDate(day.value)}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              border: "none",
              background: selectedDate === day.value ? "#111827" : "#e5e7eb",
              color: selectedDate === day.value ? "#ffffff" : "#111827",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {day.label}
          </button>
        ))}
      </div>

      {loading && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "16px",
            background: "#ffffff",
          }}
        >
          불러오는 중...
        </div>
      )}

      {!loading && data && (
        <>
          <div
            style={{
              border: "1px solid #16a34a",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "16px",
              background: "#f0fdf4",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "10px" }}>
              🟢 출근 가능 {data.summary.available}명
            </div>

            {data.available.length === 0 ? (
              <div style={{ color: "#6b7280", fontSize: "14px" }}>
                출근 가능 인원이 없습니다.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {data.available.map((emp, index) => (
                  <span
                    key={`${emp.id ?? emp.name}-${index}`}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "999px",
                      background: "#dcfce7",
                      fontSize: "13px",
                      color: "#166534",
                      fontWeight: 600,
                    }}
                  >
                    {emp.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              border: "1px solid #ef4444",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "16px",
              background: "#fef2f2",
            }}
          >
            <div
              onClick={() => setShowUnavailable((prev) => !prev)}
              style={{
                fontWeight: 700,
                cursor: "pointer",
                marginBottom: showUnavailable ? "10px" : "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <span>🔴 출근 안함 {data.summary.unavailable}명</span>
              <span>{showUnavailable ? "▲" : "▼"}</span>
            </div>

            {showUnavailable && (
              <>
                {data.unavailable.length === 0 ? (
                  <div style={{ color: "#6b7280", fontSize: "14px" }}>
                    출근 안함 인원이 없습니다.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {data.unavailable.map((emp, index) => (
                      <span
                        key={`${emp.id ?? emp.name}-${index}`}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "999px",
                          background: "#fee2e2",
                          fontSize: "13px",
                          color: "#991b1b",
                          fontWeight: 600,
                        }}
                      >
                        {emp.name}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div
            style={{
              border: "1px solid #9ca3af",
              borderRadius: "12px",
              padding: "16px",
              background: "#f3f4f6",
            }}
          >
            <div
              onClick={() => setShowNotSubmitted((prev) => !prev)}
              style={{
                fontWeight: 700,
                cursor: "pointer",
                marginBottom: showNotSubmitted ? "10px" : "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <span>⚪ 미제출 {data.summary.notSubmitted}명</span>
              <span>{showNotSubmitted ? "▲" : "▼"}</span>
            </div>

            {showNotSubmitted && (
              <>
                {data.notSubmitted.length === 0 ? (
                  <div style={{ color: "#6b7280", fontSize: "14px" }}>
                    미제출 인원이 없습니다.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {data.notSubmitted.map((emp, index) => (
                      <span
                        key={`${emp.id ?? emp.name}-${index}`}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "999px",
                          background: "#e5e7eb",
                          fontSize: "13px",
                          color: "#374151",
                          fontWeight: 600,
                        }}
                      >
                        {emp.name}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {!loading && !data && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "16px",
            background: "#ffffff",
            color: "#6b7280",
          }}
        >
          조회된 데이터가 없습니다.
        </div>
      )}
    </div>
  );
}