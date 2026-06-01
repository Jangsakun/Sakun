"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type WorkplaceName = "장사꾼" | "헤모즈";

type Employee = {
  id: string;
  name: string;
  birth_date: string;
  phone_last4: string;
  workplace_name?: string | null;
  employment_type?: string | null;
  hourly_wage?: number | null;
  weekly_allowance_status?: string | null;
  weekly_allowance_reason?: string | null;
  weekly_allowance_note?: string | null;
};

export default function AdminWeeklyAllowancePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [selectedWorkplace, setSelectedWorkplace] =
    useState<WorkplaceName>("장사꾼");

  const fetchEmployees = async () => {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/employees");
      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(data.message || "직원 목록을 불러오지 못했습니다.");
        return;
      }

      setEmployees(data.employees || []);
    } catch {
      setMessage("직원 목록 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const filteredEmployees = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return employees.filter((employee) => {
      const name = String(employee.name || "").toLowerCase();
      const status = getDefaultWeeklyAllowanceStatus(employee);
      const workplaceName = employee.workplace_name || "장사꾼";

      const matchesKeyword = !keyword || name.includes(keyword);
      const matchesStatus = statusFilter === "전체" || status === statusFilter;
      const matchesWorkplace = workplaceName === selectedWorkplace;

      return matchesKeyword && matchesStatus && matchesWorkplace;
    });
  }, [employees, searchTerm, statusFilter, selectedWorkplace]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 text-gray-900">
      <div className="mx-auto max-w-7xl rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              Weekly Allowance
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-gray-950">
              주휴수당 대상 관리
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              고정/당근 고용형태 기준으로 기본 상태를 보여주고, 필요 시 관리자가 직접 대상 여부를 수정할 수 있습니다.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/admin"
              className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700"
            >
              관리자 홈
            </Link>
            <button
              onClick={fetchEmployees}
              className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              새로고침
            </button>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-black text-gray-800">근무지</span>

          <button
            type="button"
            onClick={() => setSelectedWorkplace("장사꾼")}
            className={
              selectedWorkplace === "장사꾼"
                ? "rounded-xl bg-black px-5 py-3 text-sm font-bold text-white shadow"
                : "rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-900"
            }
          >
            장사꾼
          </button>

          <button
            type="button"
            onClick={() => setSelectedWorkplace("헤모즈")}
            className={
              selectedWorkplace === "헤모즈"
                ? "rounded-xl bg-black px-5 py-3 text-sm font-bold text-white shadow"
                : "rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-900"
            }
          >
            헤모즈
          </button>

          <span
            className={
              selectedWorkplace === "헤모즈"
                ? "ml-auto rounded-full bg-pink-100 px-4 py-2 text-sm font-black text-pink-700"
                : "ml-auto rounded-full bg-sky-100 px-4 py-2 text-sm font-black text-sky-700"
            }
          >
            현재 조회: {selectedWorkplace}
          </span>
          </div>
        </div>

        <div className="mb-5 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 md:grid-cols-[1fr_180px]">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="직원 이름 검색"
            className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-black"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-12 rounded-xl border border-gray-300 bg-white px-4 text-sm text-gray-900 outline-none focus:border-black"
          >
            <option value="전체">전체 상태</option>
            <option value="대상">대상</option>
            <option value="비대상">비대상</option>
            <option value="검토필요">검토필요</option>
          </select>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <SummaryCard
            label="대상"
            value={`${employees.filter((employee) => getDefaultWeeklyAllowanceStatus(employee) === "대상" && (employee.workplace_name || "장사꾼") === selectedWorkplace).length}명`}
            tone="green"
          />
          <SummaryCard
            label="비대상"
            value={`${employees.filter((employee) => getDefaultWeeklyAllowanceStatus(employee) === "비대상" && (employee.workplace_name || "장사꾼") === selectedWorkplace).length}명`}
            tone="red"
          />
          <SummaryCard
            label="검토필요"
            value={`${employees.filter((employee) => getDefaultWeeklyAllowanceStatus(employee) === "검토필요" && (employee.workplace_name || "장사꾼") === selectedWorkplace).length}명`}
            tone="orange"
          />
        </div>

        {message && (
          <div className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
            불러오는 중...
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
            검색 결과가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
            <table className="w-full min-w-[1180px] border-collapse bg-white text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-gray-100 transition-colors hover:bg-slate-50/70">
                  <th className="px-4 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">직원</th>
                  <th className="px-4 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">근무지</th>
                  <th className="px-4 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">고용형태</th>
                  <th className="px-4 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">시급</th>
                  <th className="px-4 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">주휴수당 상태</th>
                  <th className="px-4 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">비대상 사유</th>
                  <th className="px-4 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">관리자 메모</th>
                  <th className="px-4 py-4 text-center text-xs font-black uppercase tracking-wide text-slate-500">작업</th>
                </tr>
              </thead>

              <tbody>
                {filteredEmployees.map((employee) => (
                  <EmployeeAllowanceRow
                    key={employee.id}
                    employee={employee}
                    onSaved={fetchEmployees}
                    setParentMessage={setMessage}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <strong>TIP</strong> 고정은 기본값 대상, 당근은 기본값 비대상으로 표시됩니다. 관리자가 상태를 직접 변경한 뒤 저장할 수 있습니다.
        </div>
      </div>
    </main>
  );
}



function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "red" | "orange";
}) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : tone === "red"
      ? "bg-red-50 text-red-600 border-red-100"
      : "bg-orange-50 text-orange-600 border-orange-100";

  return (
    <div className={`rounded-2xl border px-5 py-4 ${toneClass}`}>
      <div className="text-xs font-black tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </div>
  );
}

function getDefaultWeeklyAllowanceStatus(employee: Employee) {
  if (employee.weekly_allowance_status) {
    return employee.weekly_allowance_status;
  }

  if (employee.employment_type === "fixed") {
    return "대상";
  }

  if (employee.employment_type === "carrot") {
    return "비대상";
  }

  return "검토필요";
}

function EmployeeAllowanceRow({
  employee,
  onSaved,
  setParentMessage,
}: {
  employee: Employee;
  onSaved: () => Promise<void>;
  setParentMessage: (message: string) => void;
}) {
  const defaultWeeklyAllowanceStatus = getDefaultWeeklyAllowanceStatus(employee);

  const [weeklyAllowanceStatus, setWeeklyAllowanceStatus] = useState(
    defaultWeeklyAllowanceStatus
  );
  const [weeklyAllowanceReason, setWeeklyAllowanceReason] = useState(
    employee.weekly_allowance_reason || ""
  );
  const [weeklyAllowanceNote, setWeeklyAllowanceNote] = useState(
    employee.weekly_allowance_note || ""
  );
  const [saving, setSaving] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setParentMessage("");

    try {
      const res = await fetch(`/api/admin/employees/${employee.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          weeklyAllowanceStatus,
          weeklyAllowanceReason,
          weeklyAllowanceNote,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setParentMessage(data.message || "저장에 실패했습니다.");
        return;
      }

      setParentMessage(`${employee.name} 직원 정보가 저장되었습니다.`);
      await onSaved();
    } catch {
      setParentMessage("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const statusClass =
    weeklyAllowanceStatus === "대상"
      ? "bg-emerald-50 text-emerald-700"
      : weeklyAllowanceStatus === "비대상"
      ? "bg-red-50 text-red-600"
      : "bg-orange-50 text-orange-600";

  const workplaceName = employee.workplace_name || "장사꾼";
  const employmentTypeLabel =
    employee.employment_type === "carrot"
      ? "당근"
      : employee.employment_type === "fixed"
      ? "고정"
      : "미지정";

  return (
    <>
      <tr className="border-b border-gray-100 transition-colors hover:bg-slate-50/70">
        <td className="px-4 py-4">
          <div className="font-black text-gray-950">{employee.name}</div>
          <div className="mt-1 text-xs font-medium text-gray-400">ID {employee.id}</div>
        </td>

        <td className="px-4 py-4">
          <span
            className={
              workplaceName === "헤모즈"
                ? "rounded-full bg-pink-100 px-3 py-1 text-xs font-bold text-pink-700"
                : "rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700"
            }
          >
            {workplaceName}
          </span>
        </td>

        <td className="px-4 py-4">
          <span
            className={
              employee.employment_type === "carrot"
                ? "rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700"
                : employee.employment_type === "fixed"
                ? "rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700"
                : "rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600"
            }
          >
            {employmentTypeLabel}
          </span>
        </td>

        <td className="px-4 py-4 font-semibold text-gray-900">
          {(employee.hourly_wage ?? 10320).toLocaleString("ko-KR")}원
        </td>

        <td className="px-4 py-4">
          <select
            value={weeklyAllowanceStatus}
            onChange={(e) => setWeeklyAllowanceStatus(e.target.value)}
            className={`h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-black outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${statusClass}`}
          >
            <option value="대상">대상</option>
            <option value="비대상">비대상</option>
            <option value="검토필요">검토필요</option>
          </select>
          <div className="mt-1 text-xs font-medium text-gray-500">
            기본값은 고용형태 기준이며, 관리자가 직접 수정할 수 있습니다.
          </div>
        </td>

        <td className="px-4 py-4">
          <input
            type="text"
            value={weeklyAllowanceReason}
            onChange={(e) => setWeeklyAllowanceReason(e.target.value)}
            placeholder="예: 계약조건상 비대상"
            className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </td>

        <td className="px-4 py-4">
          <input
            type="text"
            value={weeklyAllowanceNote}
            onChange={(e) => setWeeklyAllowanceNote(e.target.value)}
            placeholder="메모 입력 (선택)"
            className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </td>

        <td className="px-4 py-4">
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "저장중" : "저장"}
            </button>

            <button
              type="button"
              onClick={() => setMemoOpen((prev) => !prev)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-xl leading-none text-gray-700 transition hover:bg-gray-50"
            >
              {memoOpen ? "⌃" : "⌄"}
            </button>
          </div>
        </td>
      </tr>

      {memoOpen && (
        <tr className="border-b border-gray-100 bg-slate-50">
          <td colSpan={8} className="px-4 py-4">
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              관리자 메모
            </label>
            <textarea
              value={weeklyAllowanceNote}
              onChange={(e) => setWeeklyAllowanceNote(e.target.value)}
              placeholder="관리자 내부 메모를 입력하세요. 근로자에게는 표시되지 않습니다."
              rows={3}
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </td>
        </tr>
      )}
    </>
  );
}