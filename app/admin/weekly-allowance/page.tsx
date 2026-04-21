"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
            {employees.map((employee) => (
              <EmployeeAllowanceCard
                key={employee.id}
                employee={employee}
                onSaved={fetchEmployees}
                setParentMessage={setMessage}
              />
            ))}
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
  const [hourlyWage, setHourlyWage] = useState(
    String(employee.hourly_wage ?? 10320)
  );
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
          hourlyWage: Number(hourlyWage || 0),
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

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">{employee.name}</h2>
        <p className="mt-1 text-sm text-gray-500">
          생년월일: {employee.birth_date} / 전화번호 뒤 4자리:{" "}
          {employee.phone_last4}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            시급
          </label>
          <input
            type="text"
            value={hourlyWage}
            onChange={(e) =>
              setHourlyWage(e.target.value.replace(/[^0-9]/g, ""))
            }
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
            placeholder="10320"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            주휴수당 상태
          </label>
          <select
            value={weeklyAllowanceStatus}
            onChange={(e) => setWeeklyAllowanceStatus(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
          >
            <option value="대상">대상</option>
            <option value="비대상">비대상</option>
            <option value="검토필요">검토필요</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            비대상 사유
          </label>
          <input
            type="text"
            value={weeklyAllowanceReason}
            onChange={(e) => setWeeklyAllowanceReason(e.target.value)}
            placeholder="예: 계약조건상 비대상"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
          />
        </div>

        <div className="md:col-span-2 xl:col-span-4">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            관리자 메모
          </label>
          <textarea
            value={weeklyAllowanceNote}
            onChange={(e) => setWeeklyAllowanceNote(e.target.value)}
            placeholder="관리자 내부 메모"
            rows={3}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "저장 중..." : "저장하기"}
        </button>
      </div>
    </div>
  );
}