"use client";

import { useEffect, useState } from "react";

type Employee = {
  id: number;
  name: string;
};

export default function ContractTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);

  const [contractType, setContractType] = useState<"weekly" | "freelance_11">("weekly");
  const [startDate, setStartDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // 직원 목록 불러오기
  useEffect(() => {
    fetch("/api/admin/employees")
      .then((res) => res.json())
      .then((data) => {
        if (data?.employees) {
          setEmployees(data.employees);
        }
      });
  }, []);

  const handleCreateContract = async () => {
    if (!selectedEmployeeId) {
      setMessage("직원을 선택하세요");
      return;
    }

    if (!startDate) {
      setMessage("시작일을 선택하세요");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/contracts/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          contractType,
          contractStartDate: startDate,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage("✅ 계약서 생성 완료");
      } else {
        setMessage("❌ " + data.message);
      }
    } catch (error) {
      setMessage("❌ 오류 발생");
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 16 }}>
        근로계약서 관리
      </h2>

      {/* 직원 선택 */}
      <div style={{ marginBottom: 12 }}>
        <label>직원 선택</label>
        <select
          style={{ width: "100%", padding: 8, marginTop: 4 }}
          value={selectedEmployeeId ?? ""}
          onChange={(e) => setSelectedEmployeeId(Number(e.target.value))}
        >
          <option value="">선택하세요</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </select>
      </div>

      {/* 계약 종류 */}
      <div style={{ marginBottom: 12 }}>
        <label>계약 종류</label>
        <select
          style={{ width: "100%", padding: 8, marginTop: 4 }}
          value={contractType}
          onChange={(e) =>
            setContractType(e.target.value as "weekly" | "freelance_11")
          }
        >
          <option value="weekly">7일 근로계약서</option>
          <option value="freelance_11">11개월 용역계약서</option>
        </select>
      </div>

      {/* 시작일 */}
      <div style={{ marginBottom: 12 }}>
        <label>계약 시작일</label>
        <input
          type="date"
          style={{ width: "100%", padding: 8, marginTop: 4 }}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>

      {/* 생성 버튼 */}
      <button
        onClick={handleCreateContract}
        disabled={loading}
        style={{
          width: "100%",
          padding: 12,
          background: "black",
          color: "white",
          fontWeight: "bold",
        }}
      >
        {loading ? "생성중..." : "계약서 생성"}
      </button>

      {/* 메시지 */}
      {message && (
        <div style={{ marginTop: 12, color: "#333" }}>{message}</div>
      )}
    </div>
  );
}