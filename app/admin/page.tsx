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
    phone?: string;
    resident_number?: string;
    resident_number_masked?: string;
    bank_name?: string;
    account_number?: string;
    is_active?: boolean;
    hourly_wage?: number;
    contract_start_date?: string | null;
    contract_end_date?: string | null;
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
  phone: string;
  resident_number: string;
  resident_number_masked?: string;
  bank_name: string;
  account_number: string;
  is_active: boolean;
  created_at?: string;
  hourly_wage?: number;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
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
  hourlyWage: number;
  grossPay: number | null;
  netPay: number | null;
  statusText: string;
  statusColor: string;
  statusBg: string;
};

type AttendanceUpdateResponse = {
  success: boolean;
  message?: string;
};

type PayrollRow = {
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
};

type PayrollResponse = {
  success: boolean;
  payrolls?: PayrollRow[];
  message?: string;
};

type ContractUpdateResponse = {
  success: boolean;
  message?: string;
  contractStartDate?: string;
  contractEndDate?: string;
};

type ExpiringContractRow = Employee & {
  daysLeft: number;
};

type ReconnectIssueResponse = {
  success: boolean;
  reconnectCode?: string;
  expiresAt?: string;
  message?: string;
};

type ReconnectCodeInfo = {
  code: string;
  expiresAt: string;
};

export default function AdminPage() {
  const router = useRouter();

  const [tab, setTab] = useState<
    "attendance" | "employees" | "payroll" | "contracts"
  >("attendance");

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
  const [wages, setWages] = useState<{ [key: number]: number }>({});

  const [payrollRows, setPayrollRows] = useState<PayrollRow[]>([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollMessage, setPayrollMessage] = useState("");

  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(
    null
  );
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editResidentNumber, setEditResidentNumber] = useState("");
  const [editBankName, setEditBankName] = useState("");
  const [editAccountNumber, setEditAccountNumber] = useState("");

  const [editingAttendanceKey, setEditingAttendanceKey] = useState<
    string | null
  >(null);
  const [editCheckInTime, setEditCheckInTime] = useState("");
  const [editCheckOutTime, setEditCheckOutTime] = useState("");
  const [attendanceSaving, setAttendanceSaving] = useState(false);

  const [contractStartDateMap, setContractStartDateMap] = useState<
    Record<number, string>
  >({});
  const [contractEndDateMap, setContractEndDateMap] = useState<
    Record<number, string>
  >({});
  const [contractSavingId, setContractSavingId] = useState<number | null>(null);

  const [reconnectLoadingId, setReconnectLoadingId] = useState<number | null>(
    null
  );
  const [reconnectInfoMap, setReconnectInfoMap] = useState<
    Record<number, ReconnectCodeInfo>
  >({});

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

        const initialWages: { [key: number]: number } = {};
        const initialContractStartMap: Record<number, string> = {};
        const initialContractEndMap: Record<number, string> = {};

        data.employees.forEach((emp) => {
          initialWages[emp.id] = emp.hourly_wage || 0;
          initialContractStartMap[emp.id] = emp.contract_start_date || "";
          initialContractEndMap[emp.id] = emp.contract_end_date || "";
        });

        setWages(initialWages);
        setContractStartDateMap(initialContractStartMap);
        setContractEndDateMap(initialContractEndMap);
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

  const fetchPayroll = async () => {
    try {
      setPayrollLoading(true);

      const response = await fetch("/api/admin/payroll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
          name: employeeSearch,
        }),
      });

      const data: PayrollResponse = await response.json();

      if (data.success && data.payrolls) {
        setPayrollRows(data.payrolls);
        setPayrollMessage("");
      } else {
        setPayrollRows([]);
        setPayrollMessage(data.message || "급여 조회 실패");
      }
    } catch (error) {
      console.error(error);
      setPayrollRows([]);
      setPayrollMessage("급여 조회 중 오류 발생");
    } finally {
      setPayrollLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (tab === "attendance") {
      fetchRecords();
    }
  }, [startDate, endDate, tab]);

  useEffect(() => {
    if (tab === "employees" || tab === "contracts") {
      fetchEmployees();
    }
  }, [tab]);

  useEffect(() => {
    if (tab === "payroll") {
      fetchPayroll();
    }
  }, [tab]);

  const employeeMap = useMemo(() => {
    const map = new Map<number, Employee>();
    employees.forEach((employee) => {
      map.set(employee.id, employee);
    });
    return map;
  }, [employees]);

  const expiringContracts = useMemo(() => {
    const today = new Date();
    const todayOnly = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    return employees
      .map((employee) => {
        if (!employee.contract_end_date) return null;

        const endDate = new Date(`${employee.contract_end_date}T00:00:00`);
        if (Number.isNaN(endDate.getTime())) return null;

        const diffDays = Math.floor(
          (endDate.getTime() - todayOnly.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (diffDays < 0 || diffDays > 7) return null;

        return {
          ...employee,
          daysLeft: diffDays,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aa = a as ExpiringContractRow;
        const bb = b as ExpiringContractRow;
        return aa.daysLeft - bb.daysLeft;
      }) as ExpiringContractRow[];
  }, [employees]);

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

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) =>
      employee.name.toLowerCase().includes(employeeSearch.toLowerCase())
    );
  }, [employees, employeeSearch]);

  const groupedAttendanceRows = useMemo(() => {
    const grouped = new Map<string, AdminRecord[]>();

    filteredRecords.forEach((record) => {
      const dateKey = toSeoulDateKey(record.checked_at);
      const key = `${record.employee_id}_${dateKey}`;

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
          let calculatedMinutes = Math.floor(diffMs / 1000 / 60);

          const lunchStart = new Date(`${dateKey}T12:30:00+09:00`);
          const lunchEnd = new Date(`${dateKey}T13:30:00+09:00`);

          const includesFullLunch =
            workStartMs <= lunchStart.getTime() &&
            checkOutDate.getTime() >= lunchEnd.getTime();

          if (includesFullLunch) {
            calculatedMinutes = Math.max(0, calculatedMinutes - 60);
          }

          workMinutes = calculatedMinutes;
        }
      }

      const employee = employeeMap.get(employeeId);
      const hourlyWage = employee?.hourly_wage || 0;

      let grossPay: number | null = null;
      let netPay: number | null = null;

      if (workMinutes !== null && hourlyWage > 0) {
        grossPay = Math.round((workMinutes / 60) * hourlyWage);
        netPay = Math.round(grossPay * 0.967);
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
        hourlyWage,
        grossPay,
        netPay,
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
  }, [filteredRecords, employeeMap]);

  const summaryCheckInCount = groupedAttendanceRows.filter(
    (row) => row.checkIn !== null
  ).length;

  const summaryCheckOutCount = groupedAttendanceRows.filter(
    (row) => row.checkOut !== null
  ).length;

  const activeEmployeeCount = employees.filter(
    (employee) => employee.is_active
  ).length;

  const incompleteAttendanceCount = groupedAttendanceRows.filter(
    (row) => row.checkIn === null || row.checkOut === null
  ).length;

  const totalGrossPay = groupedAttendanceRows.reduce((sum, row) => {
    return sum + (row.grossPay || 0);
  }, 0);

  const totalNetPay = groupedAttendanceRows.reduce((sum, row) => {
    return sum + (row.netPay || 0);
  }, 0);

  const payrollSummary = useMemo(() => {
    return payrollRows.reduce(
      (acc, row) => {
        acc.totalHours += row.totalHours || 0;
        acc.basePay += row.basePay || 0;
        acc.weeklyAllowance += row.weeklyAllowance || 0;
        acc.grossPay += row.grossPay || 0;
        acc.netPay += row.netPay || 0;
        return acc;
      },
      {
        totalHours: 0,
        basePay: 0,
        weeklyAllowance: 0,
        grossPay: 0,
        netPay: 0,
      }
    );
  }, [payrollRows]);

  const startEdit = (employee: Employee) => {
    setEditingEmployeeId(employee.id);
    setEditName(employee.name);
    setEditPhone(employee.phone || "");
    setEditResidentNumber(employee.resident_number || "");
    setEditBankName(employee.bank_name || "");
    setEditAccountNumber(employee.account_number || "");
  };

  const cancelEdit = () => {
    setEditingEmployeeId(null);
    setEditName("");
    setEditPhone("");
    setEditResidentNumber("");
    setEditBankName("");
    setEditAccountNumber("");
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
          phone: editPhone,
          resident_number: editResidentNumber,
          bank_name: editBankName,
          account_number: editAccountNumber,
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

  const handleWageChange = (id: number, value: number) => {
    setWages((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const updateWage = async (id: number) => {
    const wage = wages[id];

    try {
      const response = await fetch(`/api/admin/employees/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hourlyWage: wage,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.message || "시급 수정 실패");
        return;
      }

      alert("시급 수정 완료");
      fetchEmployees();
    } catch (error) {
      console.error(error);
      alert("시급 수정 중 오류 발생");
    }
  };

  const toggleEmployeeActive = async (employee: Employee) => {
    const nextActive = !employee.is_active;
    const actionText = nextActive ? "활성화" : "비활성화";

    const ok = window.confirm(`${employee.name} 직원을 ${actionText}할까요?`);
    if (!ok) return;

    try {
      const response = await fetch(
        `/api/admin/employees/${employee.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            is_active: nextActive,
          }),
        }
      );

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

  const issueReconnectCode = async (employee: Employee) => {
    const ok = window.confirm(
      `${employee.name} 직원의 기기 재연결 코드를 발급할까요?\n\n발급 후 새 휴대폰에서 재연결 코드로 다시 등록할 수 있습니다.`
    );

    if (!ok) return;

    try {
      setReconnectLoadingId(employee.id);

      const response = await fetch("/api/admin/employees/reconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
        }),
      });

      const data: ReconnectIssueResponse = await response.json();

      if (!data.success || !data.reconnectCode || !data.expiresAt) {
        alert(data.message || "재연결 코드 발급 실패");
        return;
      }

      setReconnectInfoMap((prev) => ({
        ...prev,
        [employee.id]: {
          code: data.reconnectCode!,
          expiresAt: data.expiresAt!,
        },
      }));

      alert(
        `${employee.name} 직원 재연결 코드가 발급되었습니다.\n코드: ${data.reconnectCode}`
      );
    } catch (error) {
      console.error(error);
      alert("재연결 코드 발급 중 오류 발생");
    } finally {
      setReconnectLoadingId(null);
    }
  };

  const copyReconnectCode = async (employeeId: number) => {
    const reconnectInfo = reconnectInfoMap[employeeId];
    if (!reconnectInfo?.code) {
      alert("복사할 재연결 코드가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(reconnectInfo.code);
      alert("재연결 코드가 복사되었습니다.");
    } catch (error) {
      console.error(error);
      alert("코드 복사에 실패했습니다.");
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

  const saveContract = async (employeeId: number) => {
    const contractStartDate = contractStartDateMap[employeeId] || "";
    const contractEndDate = contractEndDateMap[employeeId] || "";

    if (!contractStartDate || !contractEndDate) {
      alert("계약 시작일과 계약 종료일을 입력해주세요.");
      return;
    }

    if (contractStartDate > contractEndDate) {
      alert("계약 시작일은 계약 종료일보다 늦을 수 없습니다.");
      return;
    }

    try {
      setContractSavingId(employeeId);

      const response = await fetch("/api/admin/contracts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId,
          contractStartDate,
          contractEndDate,
        }),
      });

      const data: ContractUpdateResponse = await response.json();

      if (!data.success) {
        alert(data.message || "근로계약 기간 저장 실패");
        return;
      }

      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === employeeId
            ? {
                ...emp,
                contract_start_date: contractStartDate,
                contract_end_date: contractEndDate,
              }
            : emp
        )
      );

      setContractStartDateMap((prev) => ({
        ...prev,
        [employeeId]: contractStartDate,
      }));

      setContractEndDateMap((prev) => ({
        ...prev,
        [employeeId]: contractEndDate,
      }));

      alert("근로계약 기간이 저장되었습니다.");
    } catch (error) {
      console.error(error);
      alert("근로계약 기간 저장 중 오류 발생");
    } finally {
      setContractSavingId(null);
    }
  };

  const downloadAttendanceCsv = () => {
    if (groupedAttendanceRows.length === 0) {
      alert("다운로드할 출퇴근 기록이 없습니다.");
      return;
    }

    const headers = [
      "이름",
      "날짜",
      "출근",
      "퇴근",
      "총 근무시간",
      "시급",
      "세전 급여",
      "세후 급여(3.3% 공제)",
      "상태",
    ];

    const rows = groupedAttendanceRows.map((row) => [
      row.employeeName,
      formatDate(row.date),
      formatTime(row.checkIn),
      formatTime(row.checkOut),
      formatWorkMinutes(row.workMinutes),
      row.hourlyWage ? String(row.hourlyWage) : "0",
      row.grossPay !== null ? String(row.grossPay) : "-",
      row.netPay !== null ? String(row.netPay) : "-",
      row.statusText,
    ]);

    const csvContent = [headers, ...rows]
      .map((line) =>
        line
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const fileName = `attendance_${startDate}_${endDate}.csv`;

    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const downloadPayrollCsv = () => {
    if (payrollRows.length === 0) {
      alert("다운로드할 급여 데이터가 없습니다.");
      return;
    }

    const headers = [
      "이름",
      "주민번호",
      "은행",
      "계좌번호",
      "주 시작",
      "주 종료",
      "총 근무시간",
      "시급",
      "기본급",
      "주휴수당",
      "세전 급여",
      "세후 급여",
    ];

    const rows = payrollRows.map((row) => {
      const employee = employeeMap.get(Number(row.employeeId));

      return [
        row.employeeName,
        employee?.resident_number || "-",
        employee?.bank_name || "-",
        employee?.account_number || "-",
        row.weekStart,
        row.weekEnd,
        row.totalHours.toFixed(2),
        String(row.hourlyWage),
        String(Math.round(row.basePay)),
        String(Math.round(row.weeklyAllowance)),
        String(Math.round(row.grossPay)),
        String(Math.round(row.netPay)),
      ];
    });

    const csvContent = [headers, ...rows]
      .map((line) =>
        line
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const fileName = `payroll_${startDate}_${endDate}.csv`;

    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <header style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Admin Dashboard</p>
            <h1 style={titleStyle}>장사꾼 관리자 대시보드</h1>
            <p style={descriptionStyle}>
              직원 상태와 출퇴근 기록, 급여, 근로계약 기간을 한 화면에서 관리할 수 있습니다.
            </p>
          </div>

          <div style={headerButtonWrapStyle}>
            <button
              onClick={() => {
                if (tab === "attendance") {
                  fetchRecords();
                } else if (tab === "employees" || tab === "contracts") {
                  fetchEmployees();
                } else {
                  fetchPayroll();
                }
              }}
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
            출근 또는 퇴근이 비어 있는 기록이{" "}
            <strong>{incompleteAttendanceCount}건</strong> 있습니다.
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

          <button
            onClick={() => setTab("payroll")}
            style={{
              ...tabButtonStyle,
              backgroundColor: tab === "payroll" ? "#111827" : "#f3f4f6",
              color: tab === "payroll" ? "#ffffff" : "#111827",
            }}
          >
            급여 관리
          </button>

          <button
            onClick={() => setTab("contracts")}
            style={{
              ...tabButtonStyle,
              backgroundColor: tab === "contracts" ? "#111827" : "#f3f4f6",
              color: tab === "contracts" ? "#ffffff" : "#111827",
            }}
          >
            근로계약서
          </button>

          <button
            onClick={() => router.push("/admin/weekly-allowance")}
            style={{
              ...tabButtonStyle,
              backgroundColor: "#10b981",
              color: "#ffffff",
            }}
          >
            주휴수당 관리
          </button>
        </div>

        {tab === "attendance" && (
          <section style={cardStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <h2 style={sectionTitleStyle}>출퇴근 기록</h2>
                <p style={sectionDescriptionStyle}>
                  근무시간에 비례한 세전/세후 급여를 함께 확인하고 CSV로 다운로드할 수 있습니다.
                </p>
              </div>

              <div style={sectionHeaderButtonWrapStyle}>
                <button onClick={downloadAttendanceCsv} style={primaryButtonStyle}>
                  엑셀 다운로드
                </button>
              </div>
            </div>

            <div style={paySummaryWrapStyle}>
              <div style={paySummaryCardStyle}>
                <div style={paySummaryLabelStyle}>세전 급여 합계</div>
                <div style={paySummaryValueStyle}>
                  {formatCurrency(totalGrossPay)}
                </div>
              </div>

              <div style={paySummaryCardStyle}>
                <div style={paySummaryLabelStyle}>세후 급여 합계</div>
                <div style={paySummaryValueStyle}>
                  {formatCurrency(totalNetPay)}
                </div>
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
                      <th style={thStyle}>시급</th>
                      <th style={thStyle}>세전 급여</th>
                      <th style={thStyle}>세후 급여</th>
                      <th style={thStyle}>상태</th>
                      <th style={thStyle}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedAttendanceRows.map((row) => {
                      const isEditingAttendance =
                        editingAttendanceKey === row.key;

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
                                onChange={(e) =>
                                  setEditCheckInTime(e.target.value)
                                }
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
                                onChange={(e) =>
                                  setEditCheckOutTime(e.target.value)
                                }
                                style={dateTimeInputStyle}
                              />
                            ) : (
                              formatTime(row.checkOut)
                            )}
                          </td>

                          <td style={tdStyle}>
                            {formatWorkMinutes(row.workMinutes)}
                          </td>

                          <td style={tdStyle}>
                            {row.hourlyWage > 0
                              ? formatCurrency(row.hourlyWage)
                              : "-"}
                          </td>

                          <td style={tdStyle}>
                            {row.grossPay !== null
                              ? formatCurrency(row.grossPay)
                              : "-"}
                          </td>

                          <td style={tdStyle}>
                            {row.netPay !== null
                              ? formatCurrency(row.netPay)
                              : "-"}
                          </td>

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
                  직원 검색, 정보 수정, 활성/비활성 상태 변경, 시급 수정, 기기 재연결 코드 발급이 가능합니다.
                </p>
              </div>
            </div>

            <div style={reconnectGuideBoxStyle}>
              휴대폰을 바꾼 직원이 있으면 <strong>기기 재연결</strong> 버튼을 눌러 코드를 발급한 뒤,
              새 휴대폰에서 회원등록 화면에 재연결 코드를 입력하게 하면 됩니다.
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
                <table style={employeeTableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>이름</th>
                      <th style={thStyle}>휴대폰번호</th>
                      <th style={thStyle}>주민번호</th>
                      <th style={thStyle}>은행</th>
                      <th style={thStyle}>계좌번호</th>
                      <th style={thStyle}>시급</th>
                      <th style={thStyle}>상태</th>
                      <th style={thStyle}>기기 재연결</th>
                      <th style={thStyle}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((employee) => {
                      const isEditing = editingEmployeeId === employee.id;
                      const reconnectInfo = reconnectInfoMap[employee.id];

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
                                value={editPhone}
                                onChange={(e) =>
                                  setEditPhone(
                                    e.target.value.replace(/[^0-9]/g, "")
                                  )
                                }
                                style={smallInputStyle}
                              />
                            ) : (
                              formatPhone(employee.phone)
                            )}
                          </td>

                          <td style={tdStyle}>
                            {isEditing ? (
                              <input
                                value={editResidentNumber}
                                onChange={(e) =>
                                  setEditResidentNumber(
                                    e.target.value
                                      .replace(/[^0-9]/g, "")
                                      .slice(0, 13)
                                  )
                                }
                                style={smallInputStyle}
                              />
                            ) : (
                              getMaskedResidentNumber(employee)
                            )}
                          </td>

                          <td style={tdStyle}>
                            {isEditing ? (
                              <input
                                value={editBankName}
                                onChange={(e) => setEditBankName(e.target.value)}
                                style={smallInputStyle}
                              />
                            ) : (
                              employee.bank_name || "-"
                            )}
                          </td>

                          <td style={tdStyle}>
                            {isEditing ? (
                              <input
                                value={editAccountNumber}
                                onChange={(e) =>
                                  setEditAccountNumber(
                                    e.target.value.replace(/[^0-9-]/g, "")
                                  )
                                }
                                style={smallInputStyle}
                              />
                            ) : (
                              employee.account_number || "-"
                            )}
                          </td>

                          <td style={tdStyle}>
                            <div style={wageWrapStyle}>
                              <input
                                type="number"
                                min={0}
                                value={wages[employee.id] || 0}
                                onChange={(e) =>
                                  handleWageChange(
                                    employee.id,
                                    Number(e.target.value)
                                  )
                                }
                                style={wageInputStyle}
                              />
                              <button
                                onClick={() => updateWage(employee.id)}
                                style={primarySmallButtonStyle}
                              >
                                시급저장
                              </button>
                            </div>
                          </td>

                          <td style={tdStyle}>
                            <span
                              style={{
                                ...badgeStyle,
                                backgroundColor: employee.is_active
                                  ? "#e8f5e9"
                                  : "#ffebee",
                                color: employee.is_active ? "#2e7d32" : "#c62828",
                              }}
                            >
                              {employee.is_active ? "활성" : "비활성"}
                            </span>
                          </td>

                          <td style={tdStyle}>
                            <div style={reconnectCellStyle}>
                              <button
                                onClick={() => issueReconnectCode(employee)}
                                style={reconnectButtonStyle}
                                disabled={reconnectLoadingId === employee.id}
                              >
                                {reconnectLoadingId === employee.id
                                  ? "발급중..."
                                  : "기기 재연결"}
                              </button>

                              {reconnectInfo ? (
                                <div style={reconnectInfoBoxStyle}>
                                  <div style={reconnectCodeTextStyle}>
                                    코드: <strong>{reconnectInfo.code}</strong>
                                  </div>
                                  <div style={reconnectExpireTextStyle}>
                                    만료: {formatDateTime(reconnectInfo.expiresAt)}
                                  </div>
                                  <button
                                    onClick={() => copyReconnectCode(employee.id)}
                                    style={copyButtonStyle}
                                  >
                                    코드 복사
                                  </button>
                                </div>
                              ) : (
                                <div style={reconnectEmptyTextStyle}>
                                  아직 발급된 코드 없음
                                </div>
                              )}
                            </div>
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
                                  backgroundColor: employee.is_active
                                    ? "#fff7ed"
                                    : "#ecfdf5",
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

        {tab === "payroll" && (
          <section style={cardStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <h2 style={sectionTitleStyle}>급여 관리</h2>
                <p style={sectionDescriptionStyle}>
                  기간을 직접 선택해서 직원별 주차 합산 급여와 주휴수당을 확인할 수 있습니다.
                </p>
              </div>

              <div style={sectionHeaderButtonWrapStyle}>
                <button onClick={downloadPayrollCsv} style={primaryButtonStyle}>
                  엑셀 다운로드
                </button>
              </div>
            </div>

            <div style={paySummaryWrapStyle}>
              <div style={paySummaryCardStyle}>
                <div style={paySummaryLabelStyle}>총 근무시간 합계</div>
                <div style={paySummaryValueStyle}>
                  {payrollSummary.totalHours.toFixed(2)}시간
                </div>
              </div>

              <div style={paySummaryCardStyle}>
                <div style={paySummaryLabelStyle}>기본급 합계</div>
                <div style={paySummaryValueStyle}>
                  {formatCurrency(Math.round(payrollSummary.basePay))}
                </div>
              </div>

              <div style={paySummaryCardStyle}>
                <div style={paySummaryLabelStyle}>주휴수당 합계</div>
                <div style={paySummaryValueStyle}>
                  {formatCurrency(Math.round(payrollSummary.weeklyAllowance))}
                </div>
              </div>

              <div style={paySummaryCardStyle}>
                <div style={paySummaryLabelStyle}>세전 급여 합계</div>
                <div style={paySummaryValueStyle}>
                  {formatCurrency(Math.round(payrollSummary.grossPay))}
                </div>
              </div>

              <div style={paySummaryCardStyle}>
                <div style={paySummaryLabelStyle}>세후 급여 합계</div>
                <div style={paySummaryValueStyle}>
                  {formatCurrency(Math.round(payrollSummary.netPay))}
                </div>
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
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={fieldButtonGroupStyle}>
                <button onClick={fetchPayroll} style={primaryButtonStyle}>
                  조회하기
                </button>
              </div>
            </div>

            <div style={{ ...warningBoxStyle, marginBottom: "18px" }}>
              주휴수당 계산식: <strong>(해당 주 총근무시간 ÷ 5) × 시급</strong>
            </div>

            {payrollLoading ? (
              <div style={emptyBoxStyle}>급여 데이터를 불러오는 중입니다...</div>
            ) : payrollMessage ? (
              <div style={emptyBoxStyle}>{payrollMessage}</div>
            ) : payrollRows.length === 0 ? (
              <div style={emptyBoxStyle}>급여 데이터가 없습니다.</div>
            ) : (
              <div style={tableScrollStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>이름</th>
                      <th style={thStyle}>주민번호</th>
                      <th style={thStyle}>은행</th>
                      <th style={thStyle}>계좌번호</th>
                      <th style={thStyle}>주 시작</th>
                      <th style={thStyle}>주 종료</th>
                      <th style={thStyle}>총 근무시간</th>
                      <th style={thStyle}>시급</th>
                      <th style={thStyle}>기본급</th>
                      <th style={thStyle}>주휴수당</th>
                      <th style={thStyle}>세전 급여</th>
                      <th style={thStyle}>세후 급여</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollRows.map((row, index) => {
                      const employee = employeeMap.get(Number(row.employeeId));

                      return (
                        <tr key={`${row.employeeId}-${row.weekStart}-${index}`}>
                          <td style={tdStyle}>
                            <span style={nameTextStyle}>{row.employeeName}</span>
                          </td>
                          <td style={tdStyle}>
                            {getMaskedResidentNumber(employee)}
                          </td>
                          <td style={tdStyle}>{employee?.bank_name || "-"}</td>
                          <td style={tdStyle}>
                            {employee?.account_number || "-"}
                          </td>
                          <td style={tdStyle}>{formatDate(row.weekStart)}</td>
                          <td style={tdStyle}>{formatDate(row.weekEnd)}</td>
                          <td style={tdStyle}>{row.totalHours.toFixed(2)}시간</td>
                          <td style={tdStyle}>{formatCurrency(row.hourlyWage)}</td>
                          <td style={tdStyle}>
                            {formatCurrency(Math.round(row.basePay))}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              color: "#2563eb",
                              fontWeight: 700,
                            }}
                          >
                            {formatCurrency(Math.round(row.weeklyAllowance))}
                          </td>
                          <td style={tdStyle}>
                            {formatCurrency(Math.round(row.grossPay))}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              color: "#059669",
                              fontWeight: 700,
                            }}
                          >
                            {formatCurrency(Math.round(row.netPay))}
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

        {tab === "contracts" && (
          <>
            <section style={contractAlertCardStyle}>
              <div style={contractAlertHeaderStyle}>
                <div>
                  <div style={contractAlertTitleWrapStyle}>
                    <span style={contractAlertIconStyle}>⚠️</span>
                    <h2 style={contractAlertTitleStyle}>근로계약서 만료 임박</h2>
                  </div>
                  <p style={contractAlertDescriptionStyle}>
                    근로계약서 만료까지 7일 이하로 남은 직원 목록입니다. 계약 갱신을 검토해주세요.
                  </p>
                </div>

                <button
                  onClick={() => setEmployeeSearch("")}
                  style={contractAlertLinkButtonStyle}
                >
                  전체 근로계약서 보기
                </button>
              </div>

              {employeeLoading ? (
                <div style={emptyBoxStyle}>계약 정보를 불러오는 중입니다...</div>
              ) : expiringContracts.length === 0 ? (
                <div style={emptyBoxStyle}>
                  현재 7일 이내 만료 예정인 근로계약서는 없습니다.
                </div>
              ) : (
                <div style={tableScrollStyle}>
                  <table style={contractAlertTableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>이름</th>
                        <th style={thStyle}>휴대폰번호</th>
                        <th style={thStyle}>주민번호</th>
                        <th style={thStyle}>계약 종료일</th>
                        <th style={thStyle}>남은 기간</th>
                        <th style={thStyle}>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expiringContracts.map((employee) => (
                        <tr key={`expiring-${employee.id}`}>
                          <td style={tdStyle}>
                            <span style={nameTextStyle}>{employee.name}</span>
                          </td>
                          <td style={tdStyle}>{formatPhone(employee.phone)}</td>
                          <td style={tdStyle}>
                            {getMaskedResidentNumber(employee)}
                          </td>
                          <td style={tdStyle}>
                            {employee.contract_end_date
                              ? formatDate(employee.contract_end_date)
                              : "-"}
                          </td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                ...badgeStyle,
                                backgroundColor:
                                  employee.daysLeft === 0 ? "#fee2e2" : "#ffedd5",
                                color:
                                  employee.daysLeft === 0 ? "#b91c1c" : "#c2410c",
                                fontWeight: 800,
                              }}
                            >
                              {employee.daysLeft === 0
                                ? "D-Day"
                                : `D-${employee.daysLeft}`}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <button
                              onClick={() => {
                                setEmployeeSearch(employee.name);
                              }}
                              style={primarySmallButtonStyle}
                            >
                              계약정보 보기
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section style={cardStyle}>
              <div style={sectionHeaderStyle}>
                <div>
                  <h2 style={sectionTitleStyle}>근로계약서 관리</h2>
                  <p style={sectionDescriptionStyle}>
                    직원별 계약 시작일과 계약 종료일을 직접 입력하고 저장할 수 있습니다.
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
                    계약정보 새로고침
                  </button>
                </div>
              </div>

              {employeeLoading ? (
                <div style={emptyBoxStyle}>계약 정보를 불러오는 중입니다...</div>
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
                        <th style={thStyle}>휴대폰번호</th>
                        <th style={thStyle}>주민번호</th>
                        <th style={thStyle}>계약 시작일</th>
                        <th style={thStyle}>계약 종료일</th>
                        <th style={thStyle}>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map((employee) => (
                        <tr key={employee.id}>
                          <td style={tdStyle}>
                            <span style={nameTextStyle}>{employee.name}</span>
                          </td>
                          <td style={tdStyle}>{formatPhone(employee.phone)}</td>
                          <td style={tdStyle}>
                            {getMaskedResidentNumber(employee)}
                          </td>
                          <td style={tdStyle}>
                            <input
                              type="date"
                              value={contractStartDateMap[employee.id] || ""}
                              onChange={(e) =>
                                setContractStartDateMap((prev) => ({
                                  ...prev,
                                  [employee.id]: e.target.value,
                                }))
                              }
                              style={smallInputStyle}
                            />
                          </td>
                          <td style={tdStyle}>
                            <input
                              type="date"
                              value={contractEndDateMap[employee.id] || ""}
                              onChange={(e) =>
                                setContractEndDateMap((prev) => ({
                                  ...prev,
                                  [employee.id]: e.target.value,
                                }))
                              }
                              style={smallInputStyle}
                            />
                          </td>
                          <td style={tdStyle}>
                            <button
                              onClick={() => saveContract(employee.id)}
                              style={primarySmallButtonStyle}
                              disabled={contractSavingId === employee.id}
                            >
                              {contractSavingId === employee.id ? "저장중..." : "저장"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWorkMinutes(minutes: number | null) {
  if (minutes === null || minutes < 0) return "-";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins}분`;
  if (mins === 0) return `${hours}시간`;

  return `${hours}시간 ${mins}분`;
}

function formatCurrency(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  const kstMs = date.getTime() + 9 * 60 * 60 * 1000;
  const kstDate = new Date(kstMs);

  return kstDate.toISOString().slice(0, 16);
}

function getMaskedResidentNumber(
  employee?: Pick<Employee, "resident_number" | "resident_number_masked"> | null
) {
  if (!employee) return "-";

  if (employee.resident_number_masked) {
    return employee.resident_number_masked;
  }

  const digits = String(employee.resident_number || "").replace(/[^0-9]/g, "");
  if (digits.length !== 13) return "-";

  return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`;
}

function formatPhone(phone?: string | null) {
  const digits = String(phone || "").replace(/[^0-9]/g, "");

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return phone || "-";
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  backgroundColor: "#f8fafc",
  padding: "24px",
  fontFamily: "sans-serif",
};

const containerStyle: CSSProperties = {
  maxWidth: "1400px",
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

const reconnectGuideBoxStyle: CSSProperties = {
  marginBottom: "18px",
  padding: "14px 16px",
  borderRadius: "14px",
  backgroundColor: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
  lineHeight: 1.6,
  fontSize: "14px",
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

const contractAlertCardStyle: CSSProperties = {
  backgroundColor: "#fffdf7",
  border: "1px solid #f6c97a",
  borderRadius: "20px",
  padding: "22px",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
  marginBottom: "20px",
};

const contractAlertHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "16px",
};

const contractAlertTitleWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const contractAlertIconStyle: CSSProperties = {
  fontSize: "28px",
  lineHeight: 1,
};

const contractAlertTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "24px",
  fontWeight: 800,
  color: "#111827",
};

const contractAlertDescriptionStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "14px",
  color: "#6b7280",
};

const contractAlertLinkButtonStyle: CSSProperties = {
  padding: "10px 14px",
  border: "none",
  borderRadius: "12px",
  cursor: "pointer",
  backgroundColor: "transparent",
  color: "#2563eb",
  fontWeight: 700,
  fontSize: "14px",
};

const contractAlertTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: "1000px",
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  marginBottom: "18px",
  flexWrap: "wrap",
};

const sectionHeaderButtonWrapStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
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

const paySummaryWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
  marginBottom: "18px",
};

const paySummaryCardStyle: CSSProperties = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: "16px",
  padding: "16px",
};

const paySummaryLabelStyle: CSSProperties = {
  fontSize: "13px",
  color: "#64748b",
  fontWeight: 700,
  marginBottom: "8px",
};

const paySummaryValueStyle: CSSProperties = {
  fontSize: "24px",
  fontWeight: 800,
  color: "#0f172a",
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
  color: "#111827",
};

const smallInputStyle: CSSProperties = {
  padding: "8px 10px",
  width: "100%",
  minWidth: "110px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: "14px",
  backgroundColor: "#ffffff",
  color: "#111827",
};

const dateTimeInputStyle: CSSProperties = {
  padding: "8px 10px",
  width: "100%",
  minWidth: "180px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: "14px",
  backgroundColor: "#ffffff",
  color: "#111827",
};

const wageWrapStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
};

const wageInputStyle: CSSProperties = {
  padding: "8px 10px",
  width: "120px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: "14px",
  backgroundColor: "#ffffff",
  color: "#111827",
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
  minWidth: "1300px",
};

const employeeTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: "1650px",
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

const reconnectCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  minWidth: "190px",
};

const reconnectInfoBoxStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: "12px",
  border: "1px solid #dbeafe",
  backgroundColor: "#eff6ff",
};

const reconnectCodeTextStyle: CSSProperties = {
  fontSize: "14px",
  color: "#1e3a8a",
  marginBottom: "4px",
  wordBreak: "break-all",
};

const reconnectExpireTextStyle: CSSProperties = {
  fontSize: "12px",
  color: "#475569",
  marginBottom: "8px",
};

const reconnectEmptyTextStyle: CSSProperties = {
  fontSize: "12px",
  color: "#94a3b8",
};

const reconnectButtonStyle: CSSProperties = {
  padding: "8px 12px",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontWeight: 700,
};

const copyButtonStyle: CSSProperties = {
  padding: "7px 10px",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 700,
  fontSize: "12px",
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