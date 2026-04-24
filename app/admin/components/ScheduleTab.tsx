"use client";

import { useEffect, useMemo, useState } from "react";

type EmployeeItem = {
  id?: number | string;
  name: string;
  gender?: string | null;
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

  const maleAvailableEmployees = useMemo(() => {
    return (data?.available || []).filter((emp) => emp.gender === "남성");
  }, [data]);

  const femaleAvailableEmployees = useMemo(() => {
    return (data?.available || []).filter((emp) => emp.gender === "여성");
  }, [data]);

  const unknownGenderAvailableEmployees = useMemo(() => {
    return (data?.available || []).filter(
      (emp) => emp.gender !== "남성" && emp.gender !== "여성"
    );
  }, [data]);

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

  const handleDateSearch = () => {
    if (!selectedDate) {
      alert("조회할 날짜를 선택해주세요.");
      return;
    }

    setShowUnavailable(false);
    setShowNotSubmitted(false);
    fetchSchedule(selectedDate);
  };

  return (
    <div style={{ marginTop: "20px" }}>
      <div style={{ marginBottom: "18px" }}>
        <div
          style={{
            fontSize: "14px",
            color: "#6b7280",
            lineHeight: 1.5,
            marginBottom: "14px",
          }}
        >
          이번 주 요일 버튼으로 빠르게 확인하거나, 날짜를 직접 선택해서 조회할 수 있습니다.
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: "16px",
          }}
        >
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #d1d5db",
              fontSize: "14px",
              color: "#111827",
              backgroundColor: "#ffffff",
              minWidth: "170px",
              outline: "none",
            }}
          />

          <button
            type="button"
            onClick={handleDateSearch}
            style={{
              padding: "10px 16px",
              borderRadius: "10px",
              border: "none",
              background: "#111827",
              color: "#ffffff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            날짜 조회
          </button>
        </div>

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
            <div style={{ fontWeight: 700, marginBottom: "12px" }}>
              🟢 출근 가능 {data.summary.available}명
            </div>

            {data.available.length === 0 ? (
              <div style={{ color: "#6b7280", fontSize: "14px" }}>
                출근 가능 인원이 없습니다.
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      border: "1px solid #bfdbfe",
                      borderRadius: "10px",
                      background: "#ffffff",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "9px 12px",
                        background: "#eff6ff",
                        color: "#1d4ed8",
                        fontSize: "13px",
                        fontWeight: 800,
                        borderBottom: "1px solid #bfdbfe",
                      }}
                    >
                      남자 {maleAvailableEmployees.length}명 출근
                    </div>

                    <div
                      style={{
                        padding: "12px",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        minHeight: "54px",
                        alignItems: "flex-start",
                      }}
                    >
                      {maleAvailableEmployees.length === 0 ? (
                        <span style={{ color: "#9ca3af", fontSize: "13px" }}>
                          없음
                        </span>
                      ) : (
                        maleAvailableEmployees.map((emp, index) => (
                          <span
                            key={`${emp.id ?? emp.name}-${index}`}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "999px",
                              background: "#dbeafe",
                              fontSize: "13px",
                              color: "#1d4ed8",
                              fontWeight: 700,
                            }}
                          >
                            {emp.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid #fbcfe8",
                      borderRadius: "10px",
                      background: "#ffffff",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "9px 12px",
                        background: "#fdf2f8",
                        color: "#db2777",
                        fontSize: "13px",
                        fontWeight: 800,
                        borderBottom: "1px solid #fbcfe8",
                      }}
                    >
                      여자 {femaleAvailableEmployees.length}명 출근
                    </div>

                    <div
                      style={{
                        padding: "12px",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        minHeight: "54px",
                        alignItems: "flex-start",
                      }}
                    >
                      {femaleAvailableEmployees.length === 0 ? (
                        <span style={{ color: "#9ca3af", fontSize: "13px" }}>
                          없음
                        </span>
                      ) : (
                        femaleAvailableEmployees.map((emp, index) => (
                          <span
                            key={`${emp.id ?? emp.name}-${index}`}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "999px",
                              background: "#fce7f3",
                              fontSize: "13px",
                              color: "#be185d",
                              fontWeight: 700,
                            }}
                          >
                            {emp.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {unknownGenderAvailableEmployees.length > 0 && (
                  <div
                    style={{
                      marginTop: "10px",
                      border: "1px solid #d1d5db",
                      borderRadius: "10px",
                      background: "#ffffff",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "9px 12px",
                        background: "#f9fafb",
                        color: "#4b5563",
                        fontSize: "13px",
                        fontWeight: 800,
                        borderBottom: "1px solid #d1d5db",
                      }}
                    >
                      성별 미등록 {unknownGenderAvailableEmployees.length}명 출근
                    </div>

                    <div
                      style={{
                        padding: "12px",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                      }}
                    >
                      {unknownGenderAvailableEmployees.map((emp, index) => (
                        <span
                          key={`${emp.id ?? emp.name}-${index}`}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "999px",
                            background: "#e5e7eb",
                            fontSize: "13px",
                            color: "#374151",
                            fontWeight: 700,
                          }}
                        >
                          {emp.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
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
              onClick={() => setShowUnavailable(!showUnavailable)}
              style={{
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <span>🔴 출근 안함 {data.summary.unavailable}명</span>
              <span>{showUnavailable ? "▲" : "▼"}</span>
            </div>

            {showUnavailable && (
              <>
                {data.unavailable.length === 0 ? (
                  <div
                    style={{
                      color: "#6b7280",
                      fontSize: "14px",
                      marginTop: "10px",
                    }}
                  >
                    출근 안함 인원이 없습니다.
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "8px",
                      marginTop: "10px",
                    }}
                  >
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
              onClick={() => setShowNotSubmitted(!showNotSubmitted)}
              style={{
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <span>⚪ 미제출 {data.summary.notSubmitted}명</span>
              <span>{showNotSubmitted ? "▲" : "▼"}</span>
            </div>

            {showNotSubmitted && (
              <>
                {data.notSubmitted.length === 0 ? (
                  <div
                    style={{
                      color: "#6b7280",
                      fontSize: "14px",
                      marginTop: "10px",
                    }}
                  >
                    미제출 인원이 없습니다.
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "8px",
                      marginTop: "10px",
                    }}
                  >
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