"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type WorkplaceName = "장사꾼" | "헤모즈";
type AllowanceStatus = "대상" | "비대상" | "검토필요";

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

const STATUS_OPTIONS: AllowanceStatus[] = ["대상", "비대상", "검토필요"];

export default function AdminWeeklyAllowancePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"전체" | AllowanceStatus>(
    "전체"
  );
  const [selectedWorkplace, setSelectedWorkplace] =
    useState<WorkplaceName>("장사꾼");

  const fetchEmployees = async () => {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/employees", {
        cache: "no-store",
      });
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

  const workplaceEmployees = useMemo(() => {
    return employees.filter(
      (employee) => (employee.workplace_name || "장사꾼") === selectedWorkplace
    );
  }, [employees, selectedWorkplace]);

  const filteredEmployees = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return workplaceEmployees.filter((employee) => {
      const name = String(employee.name || "").toLowerCase();
      const status = getDefaultWeeklyAllowanceStatus(employee);

      const matchesKeyword = !keyword || name.includes(keyword);
      const matchesStatus = statusFilter === "전체" || status === statusFilter;

      return matchesKeyword && matchesStatus;
    });
  }, [workplaceEmployees, searchTerm, statusFilter]);

  const summary = useMemo(() => {
    return {
      target: workplaceEmployees.filter(
        (employee) => getDefaultWeeklyAllowanceStatus(employee) === "대상"
      ).length,
      excluded: workplaceEmployees.filter(
        (employee) => getDefaultWeeklyAllowanceStatus(employee) === "비대상"
      ).length,
      review: workplaceEmployees.filter(
        (employee) => getDefaultWeeklyAllowanceStatus(employee) === "검토필요"
      ).length,
    };
  }, [workplaceEmployees]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              주휴수당 대상 관리
            </h1>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
              직원의 주휴수당 대상 여부를 관리합니다. 관리자 내부값은 대상 /
              비대상 / 검토필요로 관리됩니다.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/admin"
              className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              관리자 홈으로
            </Link>

            <button
              type="button"
              onClick={fetchEmployees}
              className="inline-flex h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
            >
              새로고침
            </button>
          </div>
        </header>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[280px_1fr_220px_360px] lg:items-end">
            <div>
              <label className="mb-2 block text-sm font-black text-slate-800">
                근무지
              </label>

              <div className="flex gap-2 rounded-2xl bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setSelectedWorkplace("장사꾼")}
                  className={
                    selectedWorkplace === "장사꾼"
                      ? "h-11 flex-1 rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow"
                      : "h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                  }
                >
                  장사꾼
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedWorkplace("헤모즈")}
                  className={
                    selectedWorkplace === "헤모즈"
                      ? "h-11 flex-1 rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow"
                      : "h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                  }
                >
                  헤모즈
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-slate-800">
                검색
              </label>

              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="직원 이름을 입력하세요"
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 placeholder-slate-400 outline-none transition focus:border-slate-950"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-slate-800">
                상태 필터
              </label>

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "전체" | AllowanceStatus)
                }
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-950"
              >
                <option value="전체">전체 상태</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold leading-6 text-blue-700">
              관리자 내부값은 대상 / 비대상 / 검토필요로 관리되고, 근로자
              화면에는 금액 또는 해당 없음만 표시됩니다.
            </div>
          </div>
        </section>

        <section className="mb-5 grid gap-3 md:grid-cols-3">
          <SummaryCard label="대상" value={`${summary.target}명`} tone="green" />
          <SummaryCard
            label="비대상"
            value={`${summary.excluded}명`}
            tone="red"
          />
          <SummaryCard
            label="검토필요"
            value={`${summary.review}명`}
            tone="orange"
          />
        </section>

        {message && (
          <div className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
            {message}
          </div>
        )}

        {loading ? (
          <EmptyBox message="불러오는 중..." />
        ) : filteredEmployees.length === 0 ? (
          <EmptyBox message="검색 결과가 없습니다." />
        ) : (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1220px] border-collapse bg-white text-sm">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-100">
                    <TableHead>직원</TableHead>
                    <TableHead>근무지</TableHead>
                    <TableHead>고용형태</TableHead>
                    <TableHead>시급</TableHead>
                    <TableHead>주휴수당 상태</TableHead>
                    <TableHead>비대상 사유</TableHead>
                    <TableHead>관리자 메모</TableHead>
                    <TableHead align="center">작업</TableHead>
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

            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-600">
              <span>전체 {filteredEmployees.length}명</span>
              <span>변경사항은 저장 버튼을 눌러야 반영됩니다.</span>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function TableHead({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    <th
      className={
        align === "center"
          ? "px-4 py-4 text-center text-xs font-black uppercase tracking-wide text-slate-500"
          : "px-4 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500"
      }
    >
      {children}
    </th>
  );
}

function EmptyBox({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500 shadow-sm">
      {message}
    </div>
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
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : tone === "red"
      ? "border-red-100 bg-red-50 text-red-600"
      : "border-orange-100 bg-orange-50 text-orange-600";

  const helper =
    tone === "green"
      ? "주휴수당 지급 대상"
      : tone === "red"
      ? "주휴수당 지급 비대상"
      : "검토가 필요한 상태";

  return (
    <div className={`rounded-3xl border px-6 py-6 ${toneClass}`}>
      <div className="text-sm font-black">{label}</div>
      <div className="mt-2 text-3xl font-black tracking-tight">{value}</div>
      <div className="mt-2 text-sm font-semibold opacity-80">{helper}</div>
    </div>
  );
}

function getDefaultWeeklyAllowanceStatus(employee: Employee): AllowanceStatus {
  const savedStatus = String(employee.weekly_allowance_status || "").trim();

  if (
    savedStatus === "대상" ||
    savedStatus === "비대상" ||
    savedStatus === "검토필요"
  ) {
    return savedStatus;
  }

  if (employee.employment_type === "fixed") {
    return "대상";
  }

  if (employee.employment_type === "carrot") {
    return "비대상";
  }

  return "검토필요";
}

function getEmploymentTypeLabel(employee: Employee) {
  if (employee.employment_type === "carrot") {
    return "당근";
  }

  if (employee.employment_type === "fixed") {
    return "고정";
  }

  return "미지정";
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

  const [weeklyAllowanceStatus, setWeeklyAllowanceStatus] =
    useState<AllowanceStatus>(defaultWeeklyAllowanceStatus);
  const [weeklyAllowanceReason, setWeeklyAllowanceReason] = useState(
    employee.weekly_allowance_reason || ""
  );
  const [weeklyAllowanceNote, setWeeklyAllowanceNote] = useState(
    employee.weekly_allowance_note || ""
  );
  const [saving, setSaving] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);

  useEffect(() => {
    setWeeklyAllowanceStatus(defaultWeeklyAllowanceStatus);
    setWeeklyAllowanceReason(employee.weekly_allowance_reason || "");
    setWeeklyAllowanceNote(employee.weekly_allowance_note || "");
  }, [
    defaultWeeklyAllowanceStatus,
    employee.weekly_allowance_reason,
    employee.weekly_allowance_note,
  ]);

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
  const employmentTypeLabel = getEmploymentTypeLabel(employee);

  return (
    <>
      <tr className="border-b border-slate-100 transition-colors hover:bg-slate-50/70">
        <td className="px-4 py-4">
          <div className="font-black text-slate-950">{employee.name}</div>
          <div className="mt-1 text-xs font-medium text-slate-400">
            ID {employee.id}
          </div>
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
                : "rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600"
            }
          >
            {employmentTypeLabel}
          </span>
        </td>

        <td className="px-4 py-4 font-semibold text-slate-900">
          {(employee.hourly_wage ?? 10320).toLocaleString("ko-KR")}원
        </td>

        <td className="px-4 py-4">
          <select
            value={weeklyAllowanceStatus}
            onChange={(e) =>
              setWeeklyAllowanceStatus(e.target.value as AllowanceStatus)
            }
            className={`h-11 w-[160px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-black outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${statusClass}`}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </td>

        <td className="px-4 py-4">
          <input
            type="text"
            value={weeklyAllowanceReason}
            onChange={(e) => setWeeklyAllowanceReason(e.target.value)}
            placeholder="예: 계약조건상 비대상"
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </td>

        <td className="px-4 py-4">
          <input
            type="text"
            value={weeklyAllowanceNote}
            onChange={(e) => setWeeklyAllowanceNote(e.target.value)}
            placeholder="메모 입력 (선택)"
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </td>

        <td className="px-4 py-4">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "저장중" : "저장"}
            </button>

            <button
              type="button"
              onClick={() => setWeeklyAllowanceStatus(defaultWeeklyAllowanceStatus)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              초기화
            </button>

            <button
              type="button"
              onClick={() => setMemoOpen((prev) => !prev)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl leading-none text-slate-700 transition hover:bg-slate-50"
            >
              {memoOpen ? "⌃" : "⌄"}
            </button>
          </div>
        </td>
      </tr>

      {memoOpen && (
        <tr className="border-b border-slate-100 bg-slate-50">
          <td colSpan={8} className="px-4 py-4">
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              관리자 메모
            </label>
            <textarea
              value={weeklyAllowanceNote}
              onChange={(e) => setWeeklyAllowanceNote(e.target.value)}
              placeholder="관리자 내부 메모를 입력하세요. 근로자에게는 표시되지 않습니다."
              rows={3}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </td>
        </tr>
      )}
    </>
  );
}
