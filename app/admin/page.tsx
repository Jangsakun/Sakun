"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TabType = "employees" | "attendance" | "payroll";

type Employee = {
  id: string;
  name: string;
  birth_date: string | null;
  phone_last4: string | null;
  hourly_wage: number | null;
  created_at?: string;
};

type AttendanceItem = {
  id?: string;
  employee_id?: string;
  employee_name?: string;
  record_type?: string;
  checked_at?: string;
  created_at?: string;
  lat?: number | null;
  lng?: number | null;
  employees?: {
    id?: string;
    name?: string;
    birth_date?: string | null;
    phone_last4?: string | null;
    hourly_wage?: number | null;
  } | null;
};

type PayrollItem = {
  employeeId: string;
  employeeName: string;
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  hourlyWage: number;
  basePay: number;
  weeklyAllowance: number;
  grossPay: number;
  netPay: number;
  daysWorked?: number;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function formatNumber(value?: number | null) {
  const num = Number(value ?? 0);
  return num.toLocaleString("ko-KR");
}

function formatCurrency(value?: number | null) {
  const num = Number(value ?? 0);
  return `${num.toLocaleString("ko-KR")}원`;
}

function formatHours(value?: number | null) {
  const num = Number(value ?? 0);
  return `${num.toFixed(2)}시간`;
}

function getTodayString() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          if (value.includes(",") || value.includes('"') || value.includes("\n")) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(",")
    )
    .join("\n");

  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

export default function AdminPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabType>("employees");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceItem[]>([]);
  const [payrollRows, setPayrollRows] = useState<PayrollItem[]>([]);

  const [attendanceStartDate, setAttendanceStartDate] = useState(getTodayString());
  const [attendanceEndDate, setAttendanceEndDate] = useState(getTodayString());

  const [payrollStartDate, setPayrollStartDate] = useState(getTodayString());
  const [payrollEndDate, setPayrollEndDate] = useState(getTodayString());
  const [payrollNameKeyword, setPayrollNameKeyword] = useState("");

  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editingWage, setEditingWage] = useState<string>("");

  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);

  async function handleLogout() {
    try {
      await fetch("/api/admin/logout", {
        method: "POST",
      });
    } catch (error) {
      console.error(error);
    } finally {
      router.push("/admin/login");
      router.refresh();
    }
  }

  async function fetchEmployees() {
    try {
      setLoading(true);
      setMessage("");

      const res = await fetch("/api/admin/employees", {
        method: "GET",
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(data.message || "직원 목록을 불러오지 못했습니다.");
        return;
      }

      setEmployees(data.employees ?? []);
    } catch (error) {
      console.error(error);
      setMessage("직원 목록 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchAttendance() {
    try {
      setLoading(true);
      setMessage("");

      const res = await fetch("/api/admin/attendance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: attendanceStartDate,
          endDate: attendanceEndDate,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setAttendanceRows([]);
        setMessage(data.message || "출퇴근 기록을 불러오지 못했습니다.");
        return;
      }

      const rows = data.records || data.attendance || data.data || [];
      setAttendanceRows(rows);
    } catch (error) {
      console.error(error);
      setAttendanceRows([]);
      setMessage("출퇴근 기록 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchPayroll() {
    try {
      setLoading(true);
      setMessage("");

      const res = await fetch("/api/admin/payroll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: payrollStartDate,
          endDate: payrollEndDate,
          name: payrollNameKeyword,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setPayrollRows([]);
        setMessage(data.message || "급여 데이터를 불러오지 못했습니다.");
        return;
      }

      const rows = data.payrolls || data.records || data.data || [];
      setPayrollRows(rows);
    } catch (error) {
      console.error(error);
      setPayrollRows([]);
      setMessage("급여 데이터 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function saveHourlyWage(employeeId: string) {
    try {
      const numericWage = Number(editingWage);

      if (Number.isNaN(numericWage) || numericWage < 0) {
        setMessage("시급을 올바르게 입력해주세요.");
        return;
      }

      setLoading(true);
      setMessage("");

      const res = await fetch(`/api/admin/employees/${employeeId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hourlyWage: numericWage,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(data.message || "시급 수정에 실패했습니다.");
        return;
      }

      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === employeeId
            ? {
                ...emp,
                hourly_wage: numericWage,
              }
            : emp
        )
      );

      setEditingEmployeeId(null);
      setEditingWage("");
      setMessage("시급이 수정되었습니다.");
    } catch (error) {
      console.error(error);
      setMessage("시급 수정 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteEmployee(employeeId: string) {
    try {
      setDeletingEmployeeId(employeeId);
      setLoading(true);
      setMessage("");

      const res = await fetch(`/api/admin/employees/${employeeId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(data.message || "직원 삭제에 실패했습니다.");
        return;
      }

      setEmployees((prev) => prev.filter((emp) => emp.id !== employeeId));
      setMessage("직원이 삭제되었습니다.");
    } catch (error) {
      console.error(error);
      setMessage("직원 삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingEmployeeId(null);
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEmployees();
  }, []);

  const payrollSummary = useMemo(() => {
    const totalHours = payrollRows.reduce((sum, row) => sum + Number(row.totalHours || 0), 0);
    const totalBasePay = payrollRows.reduce((sum, row) => sum + Number(row.basePay || 0), 0);
    const totalWeeklyAllowance = payrollRows.reduce(
      (sum, row) => sum + Number(row.weeklyAllowance || 0),
      0
    );
    const totalGrossPay = payrollRows.reduce((sum, row) => sum + Number(row.grossPay || 0), 0);
    const totalNetPay = payrollRows.reduce((sum, row) => sum + Number(row.netPay || 0), 0);

    return {
      totalHours,
      totalBasePay,
      totalWeeklyAllowance,
      totalGrossPay,
      totalNetPay,
    };
  }, [payrollRows]);

  function handlePayrollCsvDownload() {
    if (!payrollRows.length) {
      setMessage("다운로드할 급여 데이터가 없습니다.");
      return;
    }

    const rows: (string | number)[][] = [
      [
        "이름",
        "정산 시작일",
        "정산 종료일",
        "총 근무시간",
        "시급",
        "기본급",
        "주휴수당",
        "주휴포함 세전",
        "주휴포함 세후",
      ],
      ...payrollRows.map((row) => [
        row.employeeName,
        row.weekStart,
        row.weekEnd,
        row.totalHours.toFixed(2),
        row.hourlyWage,
        Math.round(row.basePay),
        Math.round(row.weeklyAllowance),
        Math.round(row.grossPay),
        Math.round(row.netPay),
      ]),
    ];

    downloadCsv(
      `payroll_${payrollStartDate}_${payrollEndDate}.csv`,
      rows
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">관리자 페이지</h1>
              <p className="mt-1 text-sm text-gray-500">
                직원 관리, 출퇴근 기록, 급여 관리를 한 곳에서 확인할 수 있습니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setActiveTab("employees");
                  fetchEmployees();
                }}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  activeTab === "employees"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                직원 관리
              </button>

              <button
                onClick={() => {
                  setActiveTab("attendance");
                  fetchAttendance();
                }}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  activeTab === "attendance"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                출퇴근 기록
              </button>

              <button
                onClick={() => {
                  setActiveTab("payroll");
                  fetchPayroll();
                }}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  activeTab === "payroll"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                급여 관리
              </button>

              <button
                onClick={handleLogout}
                className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
              >
                로그아웃
              </button>
            </div>
          </div>

          {message ? (
            <div className="border-b border-gray-100 bg-yellow-50 px-5 py-3 text-sm text-yellow-800">
              {message}
            </div>
          ) : null}

          {activeTab === "employees" && (
            <div className="p-5">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">직원 목록</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    직원 정보와 시급을 여기서 관리합니다.
                  </p>
                </div>

                <button
                  onClick={fetchEmployees}
                  disabled={loading}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {loading ? "불러오는 중..." : "새로고침"}
                </button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-gray-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 text-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">이름</th>
                        <th className="px-4 py-3 text-left font-semibold">생년월일</th>
                        <th className="px-4 py-3 text-left font-semibold">전화번호 뒤4자리</th>
                        <th className="px-4 py-3 text-left font-semibold">시급</th>
                        <th className="px-4 py-3 text-left font-semibold">등록일</th>
                        <th className="px-4 py-3 text-left font-semibold">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                            직원 데이터가 없습니다.
                          </td>
                        </tr>
                      ) : (
                        employees.map((employee) => {
                          const isEditing = editingEmployeeId === employee.id;

                          return (
                            <tr key={employee.id} className="border-t border-gray-100">
                              <td className="px-4 py-3 font-medium text-gray-900">
                                {employee.name}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {employee.birth_date || "-"}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {employee.phone_last4 || "-"}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {isEditing ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      value={editingWage}
                                      onChange={(e) => setEditingWage(e.target.value)}
                                      className="w-32 rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                                      placeholder="시급"
                                    />
                                    <span className="text-gray-500">원</span>
                                  </div>
                                ) : (
                                  formatCurrency(employee.hourly_wage ?? 0)
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {formatDate(employee.created_at)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  {isEditing ? (
                                    <>
                                      <button
                                        onClick={() => saveHourlyWage(employee.id)}
                                        disabled={loading}
                                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                      >
                                        저장
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditingEmployeeId(null);
                                          setEditingWage("");
                                        }}
                                        className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200"
                                      >
                                        취소
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setEditingEmployeeId(employee.id);
                                        setEditingWage(String(employee.hourly_wage ?? 0));
                                      }}
                                      className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                                    >
                                      시급 수정
                                    </button>
                                  )}

                                  <button
                                    onClick={() => {
                                      const ok = window.confirm(
                                        `${employee.name} 직원을 삭제하시겠습니까?`
                                      );
                                      if (ok) {
                                        deleteEmployee(employee.id);
                                      }
                                    }}
                                    disabled={deletingEmployeeId === employee.id}
                                    className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                                  >
                                    {deletingEmployeeId === employee.id ? "삭제 중..." : "삭제"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "attendance" && (
            <div className="p-5">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900">출퇴근 기록 조회</h2>
                <p className="mt-1 text-sm text-gray-500">
                  시작일과 종료일을 직접 선택해서 기록을 조회합니다.
                </p>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    시작일
                  </label>
                  <input
                    type="date"
                    value={attendanceStartDate}
                    onChange={(e) => setAttendanceStartDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    종료일
                  </label>
                  <input
                    type="date"
                    value={attendanceEndDate}
                    onChange={(e) => setAttendanceEndDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:border-blue-500"
                  />
                </div>

                <div className="md:col-span-2 flex items-end">
                  <button
                    onClick={fetchAttendance}
                    disabled={loading}
                    className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? "조회 중..." : "출퇴근 기록 조회"}
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-gray-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 text-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">이름</th>
                        <th className="px-4 py-3 text-left font-semibold">구분</th>
                        <th className="px-4 py-3 text-left font-semibold">시간</th>
                        <th className="px-4 py-3 text-left font-semibold">위도</th>
                        <th className="px-4 py-3 text-left font-semibold">경도</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                            조회된 출퇴근 기록이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        attendanceRows.map((row, index) => (
                          <tr key={`${row.id || row.checked_at || index}`} className="border-t border-gray-100">
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {row.employees?.name || row.employee_name || "-"}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {row.record_type === "check_in"
                                ? "출근"
                                : row.record_type === "check_out"
                                ? "퇴근"
                                : row.record_type || "-"}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {formatDateTime(row.checked_at || row.created_at)}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {row.lat ?? "-"}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {row.lng ?? "-"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "payroll" && (
            <div className="p-5">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900">급여 관리</h2>
                <p className="mt-1 text-sm text-gray-500">
                  기간을 직접 선택해서 직원별 주차 합산 급여를 확인합니다.
                </p>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-5">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    시작일
                  </label>
                  <input
                    type="date"
                    value={payrollStartDate}
                    onChange={(e) => setPayrollStartDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    종료일
                  </label>
                  <input
                    type="date"
                    value={payrollEndDate}
                    onChange={(e) => setPayrollEndDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    이름 검색
                  </label>
                  <input
                    type="text"
                    value={payrollNameKeyword}
                    onChange={(e) => setPayrollNameKeyword(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:border-blue-500"
                    placeholder="직원 이름"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={fetchPayroll}
                    disabled={loading}
                    className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? "조회 중..." : "급여 조회"}
                  </button>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={handlePayrollCsvDownload}
                    className="w-full rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
                  >
                    CSV 다운로드
                  </button>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5">
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-sm text-gray-500">총 근무시간</div>
                  <div className="mt-2 text-xl font-bold text-gray-900">
                    {formatHours(payrollSummary.totalHours)}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-sm text-gray-500">기본급 합계</div>
                  <div className="mt-2 text-xl font-bold text-gray-900">
                    {formatCurrency(Math.round(payrollSummary.totalBasePay))}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-sm text-gray-500">주휴수당 합계</div>
                  <div className="mt-2 text-xl font-bold text-gray-900">
                    {formatCurrency(Math.round(payrollSummary.totalWeeklyAllowance))}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-sm text-gray-500">세전 급여 합계</div>
                  <div className="mt-2 text-xl font-bold text-gray-900">
                    {formatCurrency(Math.round(payrollSummary.totalGrossPay))}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-sm text-gray-500">세후 급여 합계</div>
                  <div className="mt-2 text-xl font-bold text-gray-900">
                    {formatCurrency(Math.round(payrollSummary.totalNetPay))}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-gray-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 text-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">이름</th>
                        <th className="px-4 py-3 text-left font-semibold">정산 시작</th>
                        <th className="px-4 py-3 text-left font-semibold">정산 종료</th>
                        <th className="px-4 py-3 text-left font-semibold">총 근무시간</th>
                        <th className="px-4 py-3 text-left font-semibold">시급</th>
                        <th className="px-4 py-3 text-left font-semibold">기본급</th>
                        <th className="px-4 py-3 text-left font-semibold">주휴수당</th>
                        <th className="px-4 py-3 text-left font-semibold">주휴포함 세전</th>
                        <th className="px-4 py-3 text-left font-semibold">주휴포함 세후</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                            조회된 급여 데이터가 없습니다.
                          </td>
                        </tr>
                      ) : (
                        payrollRows.map((row, index) => (
                          <tr
                            key={`${row.employeeId}-${row.weekStart}-${row.weekEnd}-${index}`}
                            className="border-t border-gray-100"
                          >
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {row.employeeName}
                            </td>
                            <td className="px-4 py-3 text-gray-700">{row.weekStart}</td>
                            <td className="px-4 py-3 text-gray-700">{row.weekEnd}</td>
                            <td className="px-4 py-3 text-gray-700">
                              {formatHours(row.totalHours)}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {formatCurrency(row.hourlyWage)}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {formatCurrency(Math.round(row.basePay))}
                            </td>
                            <td className="px-4 py-3 text-blue-700 font-semibold">
                              {formatCurrency(Math.round(row.weeklyAllowance))}
                            </td>
                            <td className="px-4 py-3 text-gray-900 font-semibold">
                              {formatCurrency(Math.round(row.grossPay))}
                            </td>
                            <td className="px-4 py-3 text-emerald-700 font-semibold">
                              {formatCurrency(Math.round(row.netPay))}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">
                주휴수당 계산 방식: <strong>(해당 주 총근무시간 ÷ 5) × 시급</strong>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}