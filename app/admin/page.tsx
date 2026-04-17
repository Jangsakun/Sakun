"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AdminRecord = {
  id: number;
  record_type: string;
  lat: number;
  lng: number;
  checked_at: string;
  created_at: string;
  employee_id: number;
  employees: {
    id: number;
    name: string;
    birth_date: string;
    phone_last4: string;
    is_active?: boolean;
  } | null;
};

type AdminAttendanceResponse = {
  success: boolean;
  records?: AdminRecord[];
  message?: string;
};

type Employee = {
  id: number;
  name: string;
  birth_date: string;
  phone_last4: string;
  is_active: boolean;
  created_at?: string;
};

type EmployeeListResponse = {
  success: boolean;
  employees?: Employee[];
  message?: string;
};

type GroupedAttendanceRow = {
  key: string;
  employeeId: number;
  employeeName: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  checkInRecordId: number | null;
  checkOutRecordId: number | null;
  workMinutes: number | null;
  statusText: string;
  statusColor: string;
  statusBg: string;
};

type AttendanceUpdateResponse = {
  success: boolean;
  message?: string;
};

export default function AdminPage() {
  const router = useRouter();

  const [tab, setTab] = useState<"attendance" | "employees">("attendance");

  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });

  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });

  const [records, setRecords] = useState<AdminRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const [attendanceSearch, setAttendanceSearch] = useState("");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [employeeMessage, setEmployeeMessage] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");

  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editPhoneLast4, setEditPhoneLast4] = useState("");

  const [editingAttendanceKey, setEditingAttendanceKey] = useState<string | null>(null);
  const [editCheckInTime, setEditCheckInTime] = useState("");
  const [editCheckOutTime, setEditCheckOutTime] = useState("");
  const [attendanceSaving, setAttendanceSaving] = useState(false);

  const handleLogout = async () => {
    await fetch("/api/admin/logout", {
      method: "POST",
    });

    router.push("/admin/login");
    router.refresh();
  };

  const fetchRecords = async () => {
    try {
      setAttendanceLoading(true);

      const response = await fetch("/api/admin/attendance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
        }),
      });

      const data: AdminAttendanceResponse = await response.json();

      if (data.success && data.records) {
        setRecords(data.records);
        setAttendanceMessage("");
      } else {
        setRecords([]);
        setAttendanceMessage(data.message || "기록 조회 실패");
      }
    } catch (error) {
      console.error(error);
      setRecords([]);
      setAttendanceMessage("서버 요청 중 오류 발생");
    } finally {
      setAttendanceLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      setEmployeeLoading(true);

      const response = await fetch("/api/admin/employees");
      const data: EmployeeListResponse = await response.json();

      if (data.success && data.employees) {
        setEmployees(data.employees);
        setEmployeeMessage("");
      } else {
        setEmployees([]);
        setEmployeeMessage(data.message || "직원 목록 조회 실패");
      }
    } catch (error) {
      console.error(error);
      setEmployees([]);
      setEmployeeMessage("직원 목록 요청 중 오류 발생");
    } finally {
      setEmployeeLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  useEffect(() => {
    if (tab === "attendance") {
      fetchRecords();
    }
  }, [startDate, endDate, tab]);

  useEffect(() => {
    if (tab === "employees") {
      fetchEmployees();
    }
  }, [tab]);

  const filteredRecords = useMemo(() => {
    return records
      .filter((record) =>
        (record.employees?.name || "")
          .toLowerCase()
          .includes(attendanceSearch.toLowerCase())
      )
      .sort(
        (a, b) =>
          new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime()
      );
  }, [records, attendanceSearch]);

  const groupedAttendanceRows = useMemo(() => {
    const grouped = new Map<string, AdminRecord[]>();

    filteredRecords.forEach((record) => {
      const employeeName = record.employees?.name || "알 수 없음";
      const dateKey = toSeoulDateKey(record.checked_at);
      const key = `${employeeName}_${dateKey}`;

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key)!.push(record);
    });

    const rows: GroupedAttendanceRow[] = [];

    grouped.forEach((items, key) => {
      const sorted = [...items].sort(
        (a, b) =>
          new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
      );

      const employeeName = sorted[0].employees?.name || "알 수 없음";
      const employeeId = sorted[0].employee_id;
      const date = toSeoulDateKey(sorted[0].checked_at);

      const checkInRecord =
        sorted.find((item) => item.record_type === "check_in") || null;

      const checkOutCandidates = sorted.filter(
        (item) => item.record_type === "check_out"
      );
      const checkOutRecord =
        checkOutCandidates.length > 0
          ? checkOutCandidates[checkOutCandidates.length - 1]
          : null;

      let workMinutes: number | null = null;

      if (checkInRecord && checkOutRecord) {
        const checkInDate = new Date(checkInRecord.checked_at);
        const checkOutDate = new Date(checkOutRecord.checked_at);

        const dateKey = toSeoulDateKey(checkInRecord.checked_at);
        const standardStart = new Date(`${dateKey}T09:30:00+09:00`);

        const actualStartMs = checkInDate.getTime();
        const standardStartMs = standardStart.getTime();
        const workStartMs = Math.max(actualStartMs, standardStartMs);

        const diffMs = checkOutDate.getTime() - workStartMs;

        if (diffMs >= 0) {
          workMinutes = Math.floor(diffMs / 1000 / 60);
        }
      }

      let statusText = "기록 확인 필요";
      let statusColor = "#92400e";
      let statusBg = "#fef3c7";

      if (checkInRecord && checkOutRecord) {
        statusText = "완료";
        statusColor = "#166534";
        statusBg = "#dcfce7";
      } else if (checkInRecord && !checkOutRecord) {
        statusText = "퇴근 없음";
        statusColor = "#1d4ed8";
        statusBg = "#dbeafe";
      } else if (!checkInRecord && checkOutRecord) {
        statusText = "출근 없음";
        statusColor = "#b91c1c";
        statusBg = "#fee2e2";
      }

      rows.push({
        key,
        employeeId,
        employeeName,
        date,
        checkIn: checkInRecord?.checked_at || null,
        checkOut: checkOutRecord?.checked_at || null,
        checkInRecordId: checkInRecord?.id || null,
        checkOutRecordId: checkOutRecord?.id || null,
        workMinutes,
        statusText,
        statusColor,
        statusBg,
      });
    });

    return rows.sort((a, b) => {
      if (a.date === b.date) {
        return a.employeeName.localeCompare(b.employeeName, "ko");
      }
      return b.date.localeCompare(a.date);
    });
  }, [filteredRecords]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) =>
      employee.name.toLowerCase().includes(employeeSearch.toLowerCase())
    );
  }, [employees, employeeSearch]);

  const summaryCheckInCount = groupedAttendanceRows.filter(
    (row) => row.checkIn !== null
  ).length;

  const summaryCheckOutCount = groupedAttendanceRows.filter(
    (row) => row.checkOut !== null
  ).length;

  const activeEmployeeCount = employees.filter((employee) => employee.is_active).length;

  const incompleteAttendanceCount = groupedAttendanceRows.filter(
    (row) => row.checkIn === null || row.checkOut === null
  ).length;

  const startEdit = (employee: Employee) => {
    setEditingEmployeeId(employee.id);
    setEditName(employee.name);
    setEditBirthDate(employee.birth_date);
    setEditPhoneLast4(employee.phone_last4);
  };

  const cancelEdit = () => {
    setEditingEmployeeId(null);
    setEditName("");
    setEditBirthDate("");
    setEditPhoneLast4("");
  };

  const updateEmployee = async (employeeId: number) => {
    try {
      const response = await fetch(`/api/admin/employees/${employeeId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editName,
          birth_date: editBirthDate,
          phone_last4: editPhoneLast4,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.message || "직원 수정 실패");
        return;
      }

      alert("직원 정보가 수정되었습니다.");
      cancelEdit();
      fetchEmployees();
    } catch (error) {
      console.error(error);
      alert("직원 수정 중 오류 발생");
    }
  };

  const toggleEmployeeActive = async (employee: Employee) => {
    const nextActive = !employee.is_active;
    const actionText = nextActive ? "활성화" : "비활성화";

    const ok = window.confirm(`${employee.name} 직원을 ${actionText}할까요?`);
    if (!ok) return;

    try {
      const response = await fetch(`/api/admin/employees/${employee.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_active: nextActive,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.message || `직원 ${actionText} 실패`);
        return;
      }

      alert(`직원이 ${actionText}되었습니다.`);
      fetchEmployees();
    } catch (error) {
      console.error(error);
      alert(`직원 ${actionText} 중 오류 발생`);
    }
  };

  const startAttendanceEdit = (row: GroupedAttendanceRow) => {
    setEditingAttendanceKey(row.key);
    setEditCheckInTime(toDateTimeLocalValue(row.checkIn));
    setEditCheckOutTime(toDateTimeLocalValue(row.checkOut));
  };

  const cancelAttendanceEdit = () => {
    setEditingAttendanceKey(null);
    setEditCheckInTime("");
    setEditCheckOutTime("");
  };

  const saveAttendanceEdit = async (row: GroupedAttendanceRow) => {
    if (!editCheckInTime && !editCheckOutTime) {
      alert("출근 또는 퇴근 시간 중 하나는 입력해야 합니다.");
      return;
    }

    if (editCheckInTime && editCheckOutTime) {
      const inTime = new Date(editCheckInTime).getTime();
      const outTime = new Date(editCheckOutTime).getTime();

      if (outTime < inTime) {
        alert("퇴근 시간은 출근 시간보다 빠를 수 없습니다.");
        return;
      }
    }

    try {
      setAttendanceSaving(true);

      const response = await fetch("/api/admin/attendance/update", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          checkInRecordId: row.checkInRecordId,
          checkOutRecordId: row.checkOutRecordId,
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          date: row.date,
          checkInTime: editCheckInTime || null,
          checkOutTime: editCheckOutTime || null,
        }),
      });

      const data: AttendanceUpdateResponse = await response.json();

      if (!data.success) {
        alert(data.message || "출퇴근 수정 실패");
        return;
      }

      alert("출퇴근 시간이 수정되었습니다.");
      cancelAttendanceEdit();
      fetchRecords();
    } catch (error) {
      console.error(error);
      alert("출퇴근 수정 중 오류 발생");
    } finally {
      setAttendanceSaving(false);
    }
  };

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <header style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Admin Dashboard</p>
            <h1 style={titleStyle}>장사꾼 관리자 대시보드</h1>
            <p style={descriptionStyle}>
              직원 상태와 출퇴근 기록을 한 화면에서 관리할 수 있습니다.
            </p>
          </div>

          <div style={headerButtonWrapStyle}>
            <button
              onClick={tab === "attendance" ? fetchRecords : fetchEmployees}
              style={secondaryTopButtonStyle}
            >
              새로고침
            </button>

            <button onClick={handleLogout} style={logoutButtonStyle}>
              로그아웃
            </button>
          </div>
        </header>

        <section style={summaryGridStyle}>
          <SummaryCard
            label="조회 결과"
            value={`${groupedAttendanceRows.length}건`}
            helper="직원 + 날짜 묶음"
          />
          <SummaryCard
            label="출근 있음"
            value={`${summaryCheckInCount}건`}
            helper="출근 기록 포함"
          />
          <SummaryCard
            label="퇴근 있음"
            value={`${summaryCheckOutCount}건`}
            helper="퇴근 기록 포함"
          />
          <SummaryCard
            label="활성 직원"
            value={`${activeEmployeeCount}명`}
            helper="직원 관리 기준"
          />
        </section>

        {tab === "attendance" && incompleteAttendanceCount > 0 && (
          <div style={warningBoxStyle}>
            출근 또는 퇴근이 비어 있는 기록이 <strong>{incompleteAttendanceCount}건</strong> 있습니다.
          </div>
        )}

        <div style={tabWrapStyle}>
          <button
            onClick={() => setTab("attendance")}
            style={{
              ...tabButtonStyle,
              backgroundColor: tab === "attendance" ? "#111827" : "#f3f4f6",
              color: tab === "attendance" ? "#ffffff" : "#111827",
            }}
          >
            출퇴근 기록
          </button>

          <button
            onClick={() => setTab("employees")}
            style={{
              ...tabButtonStyle,
              backgroundColor: tab === "employees" ? "#111827" : "#f3f4f6",
              color: tab === "employees" ? "#ffffff" : "#111827",
            }}
          >
            직원 관리
          </button>
        </div>

        {tab === "attendance" && (
          <section style={cardStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <h2 style={sectionTitleStyle}>출퇴근 기록</h2>
                <p style={sectionDescriptionStyle}>
                  기간과 이름으로 조회하고, 직원별로 출근/퇴근 시간을 한 줄로 확인할 수 있습니다.
                </p>
              </div>
            </div>

            <div style={filterRowStyle}>
              <div style={fieldGroupStyle}>
                <label style={labelStyle}>시작일</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>종료일</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>이름 검색</label>
                <input
                  type="text"
                  placeholder="직원 이름 입력"
                  value={attendanceSearch}
                  onChange={(e) => setAttendanceSearch(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={fieldButtonGroupStyle}>
                <button onClick={fetchRecords} style={primaryButtonStyle}>
                  조회하기
                </button>
              </div>
            </div>

            {attendanceLoading ? (
              <div style={emptyBoxStyle}>기록을 불러오는 중입니다...</div>
            ) : attendanceMessage ? (
              <div style={emptyBoxStyle}>{attendanceMessage}</div>
            ) : groupedAttendanceRows.length === 0 ? (
              <div style={emptyBoxStyle}>검색 결과가 없습니다.</div>
            ) : (
              <div style={tableScrollStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>이름</th>
                      <th style={thStyle}>날짜</th>
                      <th style={thStyle}>출근</th>
                      <th style={thStyle}>퇴근</th>
                      <th style={thStyle}>총 근무시간</th>
                      <th style={thStyle}>상태</th>
                      <th style={thStyle}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedAttendanceRows.map((row) => {
                      const isEditingAttendance = editingAttendanceKey === row.key;

                      return (
                        <tr key={row.key}>
                          <td style={tdStyle}>
                            <span style={nameTextStyle}>{row.employeeName}</span>
                          </td>

                          <td style={tdStyle}>{formatDate(row.date)}</td>

                          <td style={tdStyle}>
                            {isEditingAttendance ? (
                              <input
                                type="datetime-local"
                                value={editCheckInTime}
                                onChange={(e) => setEditCheckInTime(e.target.value)}
                                style={dateTimeInputStyle}
                              />
                            ) : (
                              formatTime(row.checkIn)
                            )}
                          </td>

                          <td style={tdStyle}>
                            {isEditingAttendance ? (
                              <input
                                type="datetime-local"
                                value={editCheckOutTime}
                                onChange={(e) => setEditCheckOutTime(e.target.value)}
                                style={dateTimeInputStyle}
                              />
                            ) : (
                              formatTime(row.checkOut)
                            )}
                          </td>

                          <td style={tdStyle}>{formatWorkMinutes(row.workMinutes)}</td>

                          <td style={tdStyle}>
                            <span
                              style={{
                                ...badgeStyle,
                                color: row.statusColor,
                                backgroundColor: row.statusBg,
                              }}
                            >
                              {row.statusText}
                            </span>
                          </td>

                          <td style={tdStyle}>
                            <div style={actionWrapStyle}>
                              {isEditingAttendance ? (
                                <>
                                  <button
                                    onClick={() => saveAttendanceEdit(row)}
                                    style={primarySmallButtonStyle}
                                    disabled={attendanceSaving}
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={cancelAttendanceEdit}
                                    style={secondarySmallButtonStyle}
                                    disabled={attendanceSaving}
                                  >
                                    취소
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => startAttendanceEdit(row)}
                                  style={primarySmallButtonStyle}
                                >
                                  시간수정
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === "employees" && (
          <section style={cardStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <h2 style={sectionTitleStyle}>직원 관리</h2>
                <p style={sectionDescriptionStyle}>
                  직원 검색, 정보 수정, 활성/비활성 상태 변경이 가능합니다.
                </p>
              </div>
            </div>

            <div style={filterRowStyle}>
              <div style={fieldGroupStyle}>
                <label style={labelStyle}>직원 이름 검색</label>
                <input
                  type="text"
                  placeholder="직원 이름 입력"
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={fieldButtonGroupStyle}>
                <button onClick={fetchEmployees} style={primaryButtonStyle}>
                  직원 새로고침
                </button>
              </div>
            </div>

            {employeeLoading ? (
              <div style={emptyBoxStyle}>직원 목록을 불러오는 중입니다...</div>
            ) : employeeMessage ? (
              <div style={emptyBoxStyle}>{employeeMessage}</div>
            ) : filteredEmployees.length === 0 ? (
              <div style={emptyBoxStyle}>직원이 없습니다.</div>
            ) : (
              <div style={tableScrollStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>이름</th>
                      <th style={thStyle}>생년월일</th>
                      <th style={thStyle}>전화번호 끝 4자리</th>
                      <th style={thStyle}>상태</th>
                      <th style={thStyle}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((employee) => {
                      const isEditing = editingEmployeeId === employee.id;

                      return (
                        <tr key={employee.id}>
                          <td style={tdStyle}>
                            {isEditing ? (
                              <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                style={smallInputStyle}
                              />
                            ) : (
                              <span style={nameTextStyle}>{employee.name}</span>
                            )}
                          </td>

                          <td style={tdStyle}>
                            {isEditing ? (
                              <input
                                type="date"
                                value={editBirthDate}
                                onChange={(e) => setEditBirthDate(e.target.value)}
                                style={smallInputStyle}
                              />
                            ) : (
                              employee.birth_date
                            )}
                          </td>

                          <td style={tdStyle}>
                            {isEditing ? (
                              <input
                                value={editPhoneLast4}
                                onChange={(e) => setEditPhoneLast4(e.target.value)}
                                maxLength={4}
                                style={smallInputStyle}
                              />
                            ) : (
                              employee.phone_last4
                            )}
                          </td>

                          <td style={tdStyle}>
                            <span
                              style={{
                                ...badgeStyle,
                                backgroundColor: employee.is_active ? "#e8f5e9" : "#ffebee",
                                color: employee.is_active ? "#2e7d32" : "#c62828",
                              }}
                            >
                              {employee.is_active ? "활성" : "비활성"}
                            </span>
                          </td>

                          <td style={tdStyle}>
                            <div style={actionWrapStyle}>
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => updateEmployee(employee.id)}
                                    style={primarySmallButtonStyle}
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    style={secondarySmallButtonStyle}
                                  >
                                    취소
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => startEdit(employee)}
                                  style={primarySmallButtonStyle}
                                >
                                  수정
                                </button>
                              )}

                              <button
                                onClick={() => toggleEmployeeActive(employee)}
                                style={{
                                  ...secondarySmallButtonStyle,
                                  backgroundColor: employee.is_active ? "#fff7ed" : "#ecfdf5",
                                }}
                              >
                                {employee.is_active ? "비활성화" : "활성화"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div style={summaryCardStyle}>
      <p style={summaryLabelStyle}>{label}</p>
      <p style={summaryValueStyle}>{value}</p>
      <p style={summaryHelperStyle}>{helper}</p>
    </div>
  );
}

function toSeoulDateKey(value: string) {
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function formatTime(value: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

function formatWorkMinutes(minutes: number | null) {
  if (minutes === null || minutes < 0) return "-";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins}분`;
  if (mins === 0) return `${hours}시간`;

  return `${hours}시간 ${mins}분`;
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  const kstMs = date.getTime() + 9 * 60 * 60 * 1000;
  const kstDate = new Date(kstMs);

  return kstDate.toISOString().slice(0, 16);
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  backgroundColor: "#f8fafc",
  padding: "24px",
  fontFamily: "sans-serif",
};

const containerStyle: CSSProperties = {
  maxWidth: "1200px",
  margin: "0 auto",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  flexWrap: "wrap",
  marginBottom: "24px",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: "12px",
  fontWeight: 700,
  color: "#64748b",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const titleStyle: CSSProperties = {
  margin: "8px 0 8px",
  fontSize: "32px",
  fontWeight: 800,
  color: "#0f172a",
};

const descriptionStyle: CSSProperties = {
  margin: 0,
  fontSize: "15px",
  color: "#475569",
};

const headerButtonWrapStyle: CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
  marginBottom: "24px",
};

const summaryCardStyle: CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "18px",
  padding: "18px",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
};

const summaryLabelStyle: CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: "#64748b",
  fontWeight: 600,
};

const summaryValueStyle: CSSProperties = {
  margin: "10px 0 6px",
  fontSize: "28px",
  fontWeight: 800,
  color: "#0f172a",
};

const summaryHelperStyle: CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: "#94a3b8",
};

const warningBoxStyle: CSSProperties = {
  marginBottom: "20px",
  padding: "14px 16px",
  borderRadius: "14px",
  backgroundColor: "#fff7ed",
  color: "#9a3412",
  border: "1px solid #fed7aa",
};

const tabWrapStyle: CSSProperties = {
  display: "flex",
  gap: "10px",
  marginBottom: "20px",
  flexWrap: "wrap",
};

const tabButtonStyle: CSSProperties = {
  padding: "12px 18px",
  border: "none",
  borderRadius: "12px",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "14px",
};

const cardStyle: CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "20px",
  padding: "22px",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  marginBottom: "18px",
  flexWrap: "wrap",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "22px",
  fontWeight: 800,
  color: "#111827",
};

const sectionDescriptionStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: "14px",
  color: "#6b7280",
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  gap: "12px",
  alignItems: "flex-end",
  flexWrap: "wrap",
  marginBottom: "18px",
};

const fieldGroupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  minWidth: "220px",
  flex: "1 1 220px",
};

const fieldButtonGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
};

const labelStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#374151",
};

const inputStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: "14px",
  backgroundColor: "#ffffff",
};

const smallInputStyle: CSSProperties = {
  padding: "8px 10px",
  width: "100%",
  minWidth: "110px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: "14px",
};

const dateTimeInputStyle: CSSProperties = {
  padding: "8px 10px",
  width: "100%",
  minWidth: "180px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: "14px",
};

const primaryButtonStyle: CSSProperties = {
  padding: "12px 16px",
  border: "none",
  borderRadius: "12px",
  cursor: "pointer",
  backgroundColor: "#111827",
  color: "#ffffff",
  fontWeight: 700,
  fontSize: "14px",
};

const secondaryTopButtonStyle: CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #d1d5db",
  borderRadius: "12px",
  cursor: "pointer",
  backgroundColor: "#ffffff",
  color: "#111827",
  fontWeight: 700,
};

const logoutButtonStyle: CSSProperties = {
  padding: "10px 14px",
  border: "none",
  borderRadius: "12px",
  cursor: "pointer",
  backgroundColor: "#111827",
  color: "#ffffff",
  fontWeight: 700,
};

const tableScrollStyle: CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: "900px",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "14px 16px",
  fontSize: "13px",
  fontWeight: 800,
  color: "#475569",
  backgroundColor: "#f8fafc",
  borderBottom: "1px solid #e5e7eb",
};

const tdStyle: CSSProperties = {
  padding: "14px 16px",
  fontSize: "14px",
  color: "#111827",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
};

const badgeStyle: CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: "999px",
  fontWeight: 700,
  fontSize: "13px",
};

const nameTextStyle: CSSProperties = {
  fontWeight: 700,
  color: "#0f172a",
};

const actionWrapStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const primarySmallButtonStyle: CSSProperties = {
  padding: "8px 12px",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
  backgroundColor: "#111827",
  color: "#ffffff",
  fontWeight: 700,
};

const secondarySmallButtonStyle: CSSProperties = {
  padding: "8px 12px",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
  backgroundColor: "#f3f4f6",
  color: "#111827",
  fontWeight: 700,
};

const emptyBoxStyle: CSSProperties = {
  padding: "24px",
  borderRadius: "14px",
  backgroundColor: "#f8fafc",
  color: "#475569",
  textAlign: "center",
};