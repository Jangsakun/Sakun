"use client";

import { useEffect, useMemo, useState } from "react";

type ScheduleDay = {
  day: string;
  label: string;
  fullDate: string;
  available: boolean;
};

type EmployeeItem = {
  id?: number | string;
  name: string;
  gender?: string | null;
  schedule?: ScheduleDay[];
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

type ScheduleSaveResponse = {
  success: boolean;
  message?: string;
};

type DayItem = {
  label: string;
  value: string;
  day: string;
};

type WeekMode = "current" | "next";

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

function getWeekDaysInKst(weekMode: WeekMode): DayItem[] {
  const currentMonday = getMondayOfCurrentWeekInKst();
  const weekStart =
    weekMode === "next" ? addDays(currentMonday, 7) : currentMonday;

  const labels = ["월", "화", "수", "목", "금"];

  return [0, 1, 2, 3, 4].map((offset) => {
    const date = addDays(weekStart, offset);

    return {
      day: labels[offset],
      label: `${labels[offset]} (${formatMonthDay(date)})`,
      value: formatDateKey(date),
    };
  });
}

function getWeekStartAndEnd(days: DayItem[]) {
  return {
    weekStartDate: days[0]?.value || "",
    weekEndDate: days[days.length - 1]?.value || "",
  };
}

function getWeekTitle(weekMode: WeekMode) {
  return weekMode === "current" ? "이번 주" : "다음 주";
}

export default function ScheduleTab() {
  const [weekMode, setWeekMode] = useState<WeekMode>("current");

  const days = useMemo(() => getWeekDaysInKst(weekMode), [weekMode]);

  const { weekStartDate, weekEndDate } = useMemo(
    () => getWeekStartAndEnd(days),
    [days]
  );

  const [selectedDate, setSelectedDate] = useState<string>(days[0]?.value || "");
  const [data, setData] = useState<ScheduleApiResponse["data"] | null>(null);
  const [loading, setLoading] = useState(false);

  const [showUnavailable, setShowUnavailable] = useState(false);
  const [showNotSubmitted, setShowNotSubmitted] = useState(false);

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeItem | null>(
    null
  );
  const [editSchedule, setEditSchedule] = useState<ScheduleDay[]>([]);
  const [saving, setSaving] = useState(false);

  const allEmployees = useMemo(() => {
    const map = new Map<string, EmployeeItem>();

    [
      ...(data?.available || []),
      ...(data?.unavailable || []),
      ...(data?.notSubmitted || []),
    ].forEach((emp) => {
      const key = String(emp.id ?? emp.name);
      map.set(key, emp);
    });

    return Array.from(map.values());
  }, [data]);

  const searchResults = useMemo(() => {
    const keyword = employeeSearch.trim().toLowerCase();

    if (!keyword) return [];

    return allEmployees.filter((emp) =>
      emp.name.toLowerCase().includes(keyword)
    );
  }, [employeeSearch, allEmployees]);

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

  const handleChangeWeekMode = (nextWeekMode: WeekMode) => {
    const nextDays = getWeekDaysInKst(nextWeekMode);

    setWeekMode(nextWeekMode);
    setSelectedDate(nextDays[0]?.value || "");
    setShowUnavailable(false);
    setShowNotSubmitted(false);
    setSelectedEmployee(null);
    setEditSchedule([]);
    setEmployeeSearch("");
  };

  const openEditModal = (employee: EmployeeItem) => {
    const selectedAvailableDates = new Set<string>();

    const matchedEmployee = [
      ...(data?.available || []),
      ...(data?.unavailable || []),
      ...(data?.notSubmitted || []),
    ].find(
      (emp) => String(emp.id ?? emp.name) === String(employee.id ?? employee.name)
    );

    const employeeSchedule = matchedEmployee?.schedule;

    if (Array.isArray(employeeSchedule)) {
      employeeSchedule.forEach((item) => {
        if (item.available === true && item.fullDate) {
          selectedAvailableDates.add(item.fullDate);
        }
      });
    } else {
      if (
        data?.available.some(
          (emp) =>
            String(emp.id ?? emp.name) === String(employee.id ?? employee.name)
        )
      ) {
        selectedAvailableDates.add(selectedDate);
      }
    }

    const nextSchedule = days.map((day) => ({
      day: day.day,
      label: day.label,
      fullDate: day.value,
      available: selectedAvailableDates.has(day.value),
    }));

    setSelectedEmployee(employee);
    setEditSchedule(nextSchedule);
    setEmployeeSearch("");
  };

  const closeEditModal = () => {
    setSelectedEmployee(null);
    setEditSchedule([]);
    setSaving(false);
  };

  const toggleEditSchedule = (fullDate: string) => {
    setEditSchedule((prev) =>
      prev.map((item) =>
        item.fullDate === fullDate
          ? {
              ...item,
              available: !item.available,
            }
          : item
      )
    );
  };

  const saveEmployeeSchedule = async () => {
    if (!selectedEmployee) {
      alert("수정할 직원을 선택해주세요.");
      return;
    }

    try {
      setSaving(true);

      const res = await fetch("/api/admin/schedule", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: selectedEmployee.id,
          name: selectedEmployee.name,
          gender: selectedEmployee.gender || null,
          weekStartDate,
          weekEndDate,
          schedule: editSchedule.map((item) => ({
            day: item.day,
            label: item.label,
            fullDate: item.fullDate,
            available: item.available,
          })),
        }),
      });

      const result: ScheduleSaveResponse = await res.json();

      if (!result.success) {
        alert(result.message || "스케줄 저장 실패");
        return;
      }

      alert("스케줄이 수정되었습니다.");
      closeEditModal();
      fetchSchedule(selectedDate);
    } catch (error) {
      console.error("스케줄 저장 실패:", error);
      alert("스케줄 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
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
          관리자는 요일과 상관없이 이번 주 / 다음 주 스케줄을 자유롭게 조회하고 수정할 수 있습니다.
          월요일 00시가 지나면 다음 주가 자동으로 이번 주로 롤링됩니다.
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            marginBottom: "16px",
          }}
        >
          <button
            type="button"
            onClick={() => handleChangeWeekMode("current")}
            style={{
              padding: "11px 18px",
              borderRadius: "999px",
              border: weekMode === "current" ? "none" : "1px solid #d1d5db",
              background: weekMode === "current" ? "#111827" : "#ffffff",
              color: weekMode === "current" ? "#ffffff" : "#111827",
              fontWeight: 900,
              cursor: "pointer",
              boxShadow:
                weekMode === "current"
                  ? "0 8px 18px rgba(17, 24, 39, 0.18)"
                  : "none",
            }}
          >
            이번 주
          </button>

          <button
            type="button"
            onClick={() => handleChangeWeekMode("next")}
            style={{
              padding: "11px 18px",
              borderRadius: "999px",
              border: weekMode === "next" ? "none" : "1px solid #d1d5db",
              background: weekMode === "next" ? "#111827" : "#ffffff",
              color: weekMode === "next" ? "#ffffff" : "#111827",
              fontWeight: 900,
              cursor: "pointer",
              boxShadow:
                weekMode === "next"
                  ? "0 8px 18px rgba(17, 24, 39, 0.18)"
                  : "none",
            }}
          >
            다음 주
          </button>

          <div
            style={{
              padding: "11px 14px",
              borderRadius: "999px",
              background: "#f3f4f6",
              color: "#374151",
              fontSize: "13px",
              fontWeight: 800,
            }}
          >
            {getWeekTitle(weekMode)} {weekStartDate} ~ {weekEndDate}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "8px",
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
                  background:
                    selectedDate === day.value ? "#111827" : "#e5e7eb",
                  color: selectedDate === day.value ? "#ffffff" : "#111827",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {day.label}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "flex-end",
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

            <div
              style={{
                position: "relative",
                width: "260px",
                maxWidth: "100%",
              }}
            >
              <input
                type="text"
                placeholder="직원 이름 검색"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  color: "#111827",
                  backgroundColor: "#ffffff",
                  outline: "none",
                }}
              />

              {employeeSearch.trim() && (
                <div
                  style={{
                    position: "absolute",
                    top: "44px",
                    left: 0,
                    right: 0,
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)",
                    zIndex: 30,
                    overflow: "hidden",
                  }}
                >
                  {searchResults.length === 0 ? (
                    <div
                      style={{
                        padding: "12px",
                        color: "#6b7280",
                        fontSize: "13px",
                      }}
                    >
                      검색 결과가 없습니다.
                    </div>
                  ) : (
                    searchResults.map((emp, index) => (
                      <button
                        key={`${emp.id ?? emp.name}-${index}`}
                        type="button"
                        onClick={() => openEditModal(emp)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "12px",
                          border: "none",
                          borderBottom:
                            index === searchResults.length - 1
                              ? "none"
                              : "1px solid #f3f4f6",
                          background: "#ffffff",
                          cursor: "pointer",
                          color: "#111827",
                          fontWeight: 700,
                        }}
                      >
                        {emp.name}
                        <span
                          style={{
                            marginLeft: "6px",
                            fontSize: "12px",
                            color:
                              emp.gender === "남성"
                                ? "#2563eb"
                                : emp.gender === "여성"
                                ? "#db2777"
                                : "#6b7280",
                          }}
                        >
                          {emp.gender || "성별 미등록"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
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
                          <button
                            key={`${emp.id ?? emp.name}-${index}`}
                            type="button"
                            onClick={() => openEditModal(emp)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "999px",
                              background: "#dbeafe",
                              fontSize: "13px",
                              color: "#1d4ed8",
                              fontWeight: 700,
                              border: "none",
                              cursor: "pointer",
                            }}
                          >
                            {emp.name}
                          </button>
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
                          <button
                            key={`${emp.id ?? emp.name}-${index}`}
                            type="button"
                            onClick={() => openEditModal(emp)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "999px",
                              background: "#fce7f3",
                              fontSize: "13px",
                              color: "#be185d",
                              fontWeight: 700,
                              border: "none",
                              cursor: "pointer",
                            }}
                          >
                            {emp.name}
                          </button>
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
                        <button
                          key={`${emp.id ?? emp.name}-${index}`}
                          type="button"
                          onClick={() => openEditModal(emp)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "999px",
                            background: "#e5e7eb",
                            fontSize: "13px",
                            color: "#374151",
                            fontWeight: 700,
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          {emp.name}
                        </button>
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
                      <button
                        key={`${emp.id ?? emp.name}-${index}`}
                        type="button"
                        onClick={() => openEditModal(emp)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "999px",
                          background: "#fee2e2",
                          fontSize: "13px",
                          color: "#991b1b",
                          fontWeight: 700,
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        {emp.name}
                      </button>
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
                      <button
                        key={`${emp.id ?? emp.name}-${index}`}
                        type="button"
                        onClick={() => openEditModal(emp)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "999px",
                          background: "#e5e7eb",
                          fontSize: "13px",
                          color: "#374151",
                          fontWeight: 700,
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        {emp.name}
                      </button>
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

      {selectedEmployee && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            zIndex: 100,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "520px",
              background: "#ffffff",
              borderRadius: "18px",
              boxShadow: "0 20px 60px rgba(15, 23, 42, 0.28)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 900,
                    color: "#111827",
                  }}
                >
                  직원 스케줄 수정
                </div>
                <div
                  style={{
                    marginTop: "6px",
                    color: "#6b7280",
                    fontSize: "13px",
                  }}
                >
                  {selectedEmployee.name}
                  {selectedEmployee.gender ? ` (${selectedEmployee.gender})` : ""}
                  {" · "}
                  {getWeekTitle(weekMode)} {weekStartDate} ~ {weekEndDate}
                </div>
              </div>

              <button
                type="button"
                onClick={closeEditModal}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "#111827",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "20px" }}>
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "14px",
                  overflow: "hidden",
                  marginBottom: "16px",
                }}
              >
                {editSchedule.map((item, index) => (
                  <label
                    key={item.fullDate}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "70px 1fr 130px",
                      gap: "10px",
                      alignItems: "center",
                      padding: "14px",
                      borderBottom:
                        index === editSchedule.length - 1
                          ? "none"
                          : "1px solid #e5e7eb",
                      cursor: "pointer",
                      background: item.available ? "#eff6ff" : "#ffffff",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 800,
                        color: "#111827",
                      }}
                    >
                      {item.day}
                    </span>

                    <span
                      style={{
                        color: "#374151",
                        fontSize: "14px",
                      }}
                    >
                      {item.label}
                    </span>

                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        justifyContent: "flex-end",
                        color: item.available ? "#2563eb" : "#6b7280",
                        fontWeight: 800,
                        fontSize: "14px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={item.available}
                        onChange={() => toggleEditSchedule(item.fullDate)}
                        style={{
                          width: "18px",
                          height: "18px",
                          cursor: "pointer",
                        }}
                      />
                      출근 가능
                    </span>
                  </label>
                ))}
              </div>

              <div
                style={{
                  padding: "12px",
                  borderRadius: "12px",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  color: "#1d4ed8",
                  fontSize: "13px",
                  fontWeight: 700,
                  marginBottom: "16px",
                }}
              >
                수정 후 저장하면 해당 직원의 {getWeekTitle(weekMode)} 스케줄이 변경됩니다.
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={saving}
                  style={{
                    padding: "12px 18px",
                    borderRadius: "12px",
                    border: "1px solid #d1d5db",
                    background: "#ffffff",
                    color: "#111827",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  취소
                </button>

                <button
                  type="button"
                  onClick={saveEmployeeSchedule}
                  disabled={saving}
                  style={{
                    padding: "12px 22px",
                    borderRadius: "12px",
                    border: "none",
                    background: "#111827",
                    color: "#ffffff",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  {saving ? "저장중..." : "저장"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}