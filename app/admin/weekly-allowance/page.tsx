"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Employee = {
  id: string;
  name: string;
  birth_date: string;
  phone_last4: string;
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

    if (!keyword) return employees;

    return employees.filter((employee) => {
      const name = String(employee.name || "").toLowerCase();
      const birthDate = String(employee.birth_date || "").toLowerCase();
      const phoneLast4 = String(employee.phone_last4 || "").toLowerCase();

      return (
        name.includes(keyword) ||
        birthDate.includes(keyword) ||
        phoneLast4.includes(keyword)
      );
    });
  }, [employees, searchTerm]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                주휴수당 대상 관리
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                관리자 내부값은 대상 / 비대상 / 검토필요로 관리되고,
                근로자 화면에는 금액 또는 해당 없음만 표시됩니다.
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

          <div className="mt-4">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="직원 이름 검색"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-black"
            />
          </div>
        </div>

        {message && (
          <div className="mb-4 rounded-xl bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-white p-10 text-center text-gray-500 shadow-sm">
            불러오는 중...
          </div>
        ) : (
          <div className="space-y-4">
            {filteredEmployees.length === 0 ? (
              <div className="rounded-2xl bg-white p-10 text-center text-gray-500 shadow-sm">
                검색 결과가 없습니다.
              </div>
            ) : (
              filteredEmployees.map((employee) => (
                <EmployeeAllowanceCard
                  key={employee.id}
                  employee={employee}
                  onSaved={fetchEmployees}
                  setParentMessage={setMessage}
                />
              ))
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function EmployeeAllowanceCard({
  employee,
  onSaved,
  setParentMessage,
}: {
  employee: Employee;
  onSaved: () => Promise<void>;
  setParentMessage: (message: string) => void;
}) {
  const [weeklyAllowanceStatus, setWeeklyAllowanceStatus] = useState(
    employee.weekly_allowance_status || "검토필요"
  );
  const [weeklyAllowanceReason, setWeeklyAllowanceReason] = useState(
    employee.weekly_allowance_reason || ""
  );
  const [weeklyAllowanceNote, setWeeklyAllowanceNote] = useState(
    employee.weekly_allowance_note || ""
  );
  const [saving, setSaving] = useState(false);

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
        setParentMessage(data.message || "저장 실패");
        return;
      }

      setParentMessage(`${employee.name} 저장 완료`);
      await onSaved();
    } catch {
      setParentMessage("오류 발생");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm border border-gray-200">
      {/* 1줄 구조 */}
      <div className="flex items-center gap-3 flex-wrap">

        {/* 이름 */}
        <div className="w-[120px] font-semibold text-gray-900">
          {employee.name}
        </div>

        {/* 상태 */}
        <select
          value={weeklyAllowanceStatus}
          onChange={(e) => setWeeklyAllowanceStatus(e.target.value)}
          className="h-10 rounded-lg border px-3 text-sm"
        >
          <option value="대상">대상</option>
          <option value="비대상">비대상</option>
          <option value="검토필요">검토필요</option>
        </select>

        {/* 비대상 사유 */}
        <input
          type="text"
          value={weeklyAllowanceReason}
          onChange={(e) => setWeeklyAllowanceReason(e.target.value)}
          placeholder="비대상 사유"
          className="flex-1 min-w-[160px] h-10 rounded-lg border px-3 text-sm"
        />

        {/* 저장 */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold"
        >
          {saving ? "저장중" : "저장"}
        </button>
      </div>

      {/* 관리자 메모 (작게) */}
      <div className="mt-2">
        <textarea
          value={weeklyAllowanceNote}
          onChange={(e) => setWeeklyAllowanceNote(e.target.value)}
          placeholder="관리자 메모"
          rows={2}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}