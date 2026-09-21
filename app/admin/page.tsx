"use client";

import {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import ScheduleTab from "./components/ScheduleTab";
import DbSizeTab from "./components/DbSizeTab";
import {
  cell,
  downloadXlsx,
  downloadXlsxNoHeader,
  textCell,
} from "@/app/lib/excelExport";
import { summarizePayrollByEmployee } from "@/app/lib/payrollSummary";
import { getWorkplaceBadgeColor } from "@/app/lib/workplaceBadge";
import {
  ROWS_PER_FILE,
  buildBankTransferRows,
  buildTransferFileName,
} from "@/app/lib/bankTransfer";

type AdminRecord = {
  id: number;
  record_type: string;
  lat: number;
  lng: number;
  checked_at: string;
  created_at: string;
  employee_id: number;
  hourly_wage_snapshot?: number | null;
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
    workplace_name?: string | null;
    employment_type?: string | null;
    schedule_group?: string | null;
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
  workplace_name?: string | null;
  employment_type?: string | null;
  schedule_group?: string | null;
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
  residentPrefix: string;
  workplaceName: string;
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
  workplaceName?: string | null;
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

type WorkplaceName = "장사꾼" | "헤모즈" | "깨소금" | "로엔티크";
type WorkplaceFilter = "전체" | WorkplaceName;
type StatusFilter = "전체" | "활성" | "비활성";

const JANGSAGGUN_SCHEDULE_GROUP_OPTIONS = [
  { value: "", label: "선택안함" },
  { value: "랄라", label: "랄라" },
  { value: "모아림", label: "모아림" },
  { value: "몽글솜", label: "몽글솜" },
  { value: "택배", label: "택배" },
  { value: "자수", label: "자수" },
];

const HEMOZ_SCHEDULE_GROUP_OPTIONS = [
  { value: "", label: "선택안함" },
  { value: "오픈", label: "오픈" },
  { value: "주간", label: "주간" },
];

const KKAESOGEUM_SCHEDULE_GROUP_OPTIONS = [
  { value: "", label: "선택안함" },
];

function getScheduleGroupOptions(workplaceName: WorkplaceName) {
  if (workplaceName === "헤모즈") {
    return HEMOZ_SCHEDULE_GROUP_OPTIONS;
  }

  if (workplaceName === "깨소금" || workplaceName === "로엔티크") {
    return KKAESOGEUM_SCHEDULE_GROUP_OPTIONS;
  }

  return JANGSAGGUN_SCHEDULE_GROUP_OPTIONS;
}

function isValidScheduleGroupForWorkplace(
  workplaceName: WorkplaceName,
  scheduleGroup: string
) {
  return getScheduleGroupOptions(workplaceName).some(
    (option) => option.value === scheduleGroup
  );
}


// 직원 상태 필터. is_active 는 employees 테이블의 boolean 컬럼입니다.
// 목록의 상태 뱃지(employee.is_active ? "활성" : "비활성")와 같은 truthy 기준으로 판정합니다.
function matchesStatusFilter(
  isActive: boolean | undefined,
  statusFilter: StatusFilter
) {
  if (statusFilter === "전체") return true;

  const isActiveEmployee = Boolean(isActive);

  return statusFilter === "활성" ? isActiveEmployee : !isActiveEmployee;
}

export default function AdminPage() {
  const router = useRouter();

  const [tab, setTab] = useState<
    "attendance" | "employees" | "payroll" | "contracts" | "schedule" | "dbSize"
  >("attendance");

  const [selectedWorkplace, setSelectedWorkplace] =
    useState<WorkplaceFilter>("전체");

  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("전체");

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
  const [contractSearch, setContractSearch] = useState("");
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
  const [editWorkplaceName, setEditWorkplaceName] =
    useState<WorkplaceName>("장사꾼");
  const [editEmploymentType, setEditEmploymentType] = useState<"fixed" | "carrot">(
    "fixed"
  );
  const [editScheduleGroup, setEditScheduleGroup] = useState("");

  const [editingAttendanceKey, setEditingAttendanceKey] = useState<
    string | null
  >(null);
  const [editCheckInTime, setEditCheckInTime] = useState("");
  const [editCheckOutTime, setEditCheckOutTime] = useState("");
  const [attendanceSaving, setAttendanceSaving] = useState(false);

  // 수동 출퇴근 추가는 행 단위로 입력합니다.
  // 직원마다 날짜·출퇴근시간이 다르기 때문에 한 줄에 하나씩 담습니다.
  const [manualRows, setManualRows] = useState<ManualRow[]>(() => [
    createManualRow(),
  ]);
  const [manualSubmitting, setManualSubmitting] = useState(false);

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

        data.employees.forEach((emp) => {
          initialWages[emp.id] = emp.hourly_wage || 0;
        });

        setWages(initialWages);
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
    if (tab === "employees") {
      fetchEmployees();
    }
  }, [tab]);

  useEffect(() => {
    if (tab === "payroll") {
      fetchPayroll();
    }
  }, [tab]);

  // 수동 출퇴근 추가용 직원 목록.
  // 줄마다 근무지가 다를 수 있으므로 활성 직원 전체를 담고,
  // 동명이인 구분을 위해 주민번호 앞 6자리와 근무지를 함께 보여줍니다.
  const manualEmployeeOptions = useMemo(() => {
    return employees
      .filter((employee) => employee.is_active)
      .map((employee) => {
        const prefix = getResidentPrefix(employee.resident_number_masked);
        const workplace = employee.workplace_name || "장사꾼";
        const name = prefix ? `${employee.name} (${prefix})` : employee.name;

        return {
          id: employee.id,
          name: employee.name,
          workplace,
          label: `${name} · ${workplace}`,
        };
      })
      .sort(
        (a, b) =>
          a.workplace.localeCompare(b.workplace, "ko") ||
          a.label.localeCompare(b.label, "ko")
      );
  }, [employees]);

  // 저장 가능한(직원·날짜·출근시간이 모두 채워진) 줄 수.
  const manualReadyRowCount = useMemo(
    () =>
      manualRows.filter((row) => row.employeeId && row.date && row.checkInTime)
        .length,
    [manualRows]
  );

  const updateManualRow = (index: number, patch: Partial<ManualRow>) => {
    setManualRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  };

  const addManualRow = () => {
    // 같은 날 여러 명을 넣는 경우가 많아 직전 줄의 날짜를 물려줍니다.
    setManualRows((prev) => [
      ...prev,
      createManualRow({ date: prev[prev.length - 1]?.date }),
    ]);
  };

  const copyLastManualRow = () => {
    setManualRows((prev) => {
      const last = prev[prev.length - 1];

      // 직원만 비우고 날짜·시간은 그대로 둡니다.
      // 같은 직원·같은 날을 두 줄 넣으면 어차피 건너뛰기 때문입니다.
      return [
        ...prev,
        createManualRow({
          date: last?.date,
          checkInTime: last?.checkInTime,
          checkOutTime: last?.checkOutTime,
        }),
      ];
    });
  };

  const removeManualRow = (index: number) => {
    setManualRows((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)
    );
  };

  const resetManualRows = () => {
    setManualRows([createManualRow()]);
  };

  const submitManualRows = async () => {
    // 아무것도 입력 안 된 빈 줄은 그냥 무시합니다.
    const filled = manualRows
      .map((row, index) => ({ row, rowNo: index + 1 }))
      .filter(
        ({ row }) =>
          row.employeeId || row.date || row.checkInTime || row.checkOutTime
      );

    if (filled.length === 0) {
      alert("추가할 내용을 입력해주세요.");
      return;
    }

    for (const { row, rowNo } of filled) {
      if (!row.employeeId) {
        alert(`${rowNo}번째 줄: 직원을 선택해주세요.`);
        return;
      }

      if (!row.date) {
        alert(`${rowNo}번째 줄: 날짜를 입력해주세요.`);
        return;
      }

      if (!row.checkInTime) {
        alert(`${rowNo}번째 줄: 출근시간을 입력해주세요.`);
        return;
      }

      if (row.checkOutTime && row.checkOutTime < row.checkInTime) {
        alert(`${rowNo}번째 줄: 퇴근시간이 출근시간보다 빠릅니다.`);
        return;
      }
    }

    // 같은 직원·같은 날이 두 줄 있으면 뒷줄이 통째로 건너뛰어집니다.
    // 저장하기 전에 알려주는 편이 낫습니다.
    const seen = new Map<string, number>();

    for (const { row, rowNo } of filled) {
      const key = `${row.employeeId}|${row.date}`;
      const firstRowNo = seen.get(key);

      if (firstRowNo) {
        alert(
          `${firstRowNo}번째 줄과 ${rowNo}번째 줄이 같은 직원·같은 날짜입니다. 한 줄로 합쳐주세요.`
        );
        return;
      }

      seen.set(key, rowNo);
    }

    setManualSubmitting(true);

    try {
      const response = await fetch("/api/admin/attendance", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entries: filled.map(({ row }) => ({
            employeeId: Number(row.employeeId),
            date: row.date,
            checkInTime: row.checkInTime,
            checkOutTime: row.checkOutTime,
          })),
        }),
      });

      const data = await response.json();

      // 처리 안 된 줄은 조용히 넘기지 않고 전부 보여줍니다.
      const problems: {
        index: number;
        employeeName: string;
        date: string;
        message: string;
      }[] = (data.results || []).filter(
        (item: { success: boolean }) => !item.success
      );

      const lines: string[] = [
        data.message || (data.success ? "추가 완료" : "추가 실패"),
      ];

      if (problems.length > 0) {
        lines.push("", "처리되지 않은 줄:");

        problems.slice(0, 20).forEach((item) => {
          const rowNo = filled[item.index]?.rowNo ?? item.index + 1;

          lines.push(
            `  · ${rowNo}번째 줄 ${item.employeeName} ${item.date}: ${item.message}`
          );
        });

        if (problems.length > 20) {
          lines.push(`  … 외 ${problems.length - 20}줄`);
        }
      }

      alert(lines.join("\n"));

      if (data.success) {
        // 성공한 줄만 치우고, 문제가 있던 줄은 고칠 수 있게 남겨둡니다.
        const failedKeys = new Set(
          problems
            .map((item) => filled[item.index]?.row.key)
            .filter((key): key is string => Boolean(key))
        );

        setManualRows((prev) => {
          const kept = prev.filter((row) => failedKeys.has(row.key));

          return kept.length > 0 ? kept : [createManualRow()];
        });

        fetchRecords();
      }
    } catch (error) {
      console.error(error);
      alert("추가 중 오류 발생");
    } finally {
      setManualSubmitting(false);
    }
  };

  const employeeMap = useMemo(() => {
    const map = new Map<number, Employee>();
    employees.forEach((employee) => {
      map.set(employee.id, employee);
    });
    return map;
  }, [employees]);


  const filteredRecords = useMemo(() => {
    return records
      .filter((record) => {
        const matchesName = (record.employees?.name || "")
          .toLowerCase()
          .includes(attendanceSearch.toLowerCase());

        const employeeWorkplace = record.employees?.workplace_name || "장사꾼";

        const matchesWorkplace =
          selectedWorkplace === "전체" || employeeWorkplace === selectedWorkplace;

        return matchesName && matchesWorkplace;
      })
      .sort(
        (a, b) =>
          new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime()
      );
  }, [records, attendanceSearch, selectedWorkplace]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const matchesName = employee.name
        .toLowerCase()
        .includes(employeeSearch.toLowerCase());

      const employeeWorkplace = employee.workplace_name || "장사꾼";
      const matchesWorkplace =
        selectedWorkplace === "전체" || employeeWorkplace === selectedWorkplace;

      const matchesStatus = matchesStatusFilter(
        employee.is_active,
        selectedStatus
      );

      return matchesName && matchesWorkplace && matchesStatus;
    });
  }, [employees, employeeSearch, selectedWorkplace, selectedStatus]);

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
      const workplaceName = sorted[0].employees?.workplace_name || "장사꾼";
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
        const savedCheckIn = new Date(checkInRecord.checked_at);
        const savedCheckOut = new Date(checkOutRecord.checked_at);

        const diffMs = savedCheckOut.getTime() - savedCheckIn.getTime();

        if (diffMs >= 0) {
          let calculatedMinutes = Math.floor(diffMs / 1000 / 60);

          const lunchStart = createSeoulDateTime(date, 12, 30);
          const lunchEnd = createSeoulDateTime(date, 13, 30);

          const includesFullLunch =
            savedCheckIn.getTime() <= lunchStart.getTime() &&
            savedCheckOut.getTime() >= lunchEnd.getTime();

          if (includesFullLunch) {
            calculatedMinutes = Math.max(0, calculatedMinutes - 60);
          }

          workMinutes = calculatedMinutes;
        }
      }

      const employee = employeeMap.get(employeeId);

      // 과거 출퇴근 기록은 당시 저장된 시급 스냅샷을 우선 사용합니다.
      // 스냅샷이 없는 구버전 기록만 현재 직원 시급을 임시 fallback으로 사용합니다.
      const snapshotWage =
        sorted
          .map((item) => Number(item.hourly_wage_snapshot || 0))
          .find((wage) => wage > 0) || 0;

      const hourlyWage =
        snapshotWage > 0 ? snapshotWage : employee?.hourly_wage || 0;

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
        residentPrefix: getResidentPrefix(employee?.resident_number_masked),
        workplaceName,
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

  const activeEmployeeCount = employees.filter((employee) => {
    const employeeWorkplace = employee.workplace_name || "장사꾼";

    const matchesWorkplace =
      selectedWorkplace === "전체" || employeeWorkplace === selectedWorkplace;

    const matchesStatus = matchesStatusFilter(
      employee.is_active,
      selectedStatus
    );

    return employee.is_active && matchesWorkplace && matchesStatus;
  }).length;

  const incompleteAttendanceCount = groupedAttendanceRows.filter(
    (row) => row.checkIn === null || row.checkOut === null
  ).length;

  const totalGrossPay = groupedAttendanceRows.reduce((sum, row) => {
    return sum + (row.grossPay || 0);
  }, 0);

  const totalNetPay = groupedAttendanceRows.reduce((sum, row) => {
    return sum + (row.netPay || 0);
  }, 0);

  const filteredPayrollRows = useMemo(() => {
    return payrollRows.filter((row) => {
      const employee = employeeMap.get(Number(row.employeeId));
      const workplaceName = row.workplaceName || employee?.workplace_name || "장사꾼";

      return selectedWorkplace === "전체" || workplaceName === selectedWorkplace;
    });
  }, [payrollRows, employeeMap, selectedWorkplace]);

  const monthlyPayrollRows = useMemo(() => {
    const grouped = new Map<string, PayrollRow>();

    filteredPayrollRows.forEach((row) => {
      const key = row.employeeId;

      if (!grouped.has(key)) {
        grouped.set(key, {
          ...row,
          weekStart: startDate,
          weekEnd: endDate,
          totalHours: 0,
          basePay: 0,
          weeklyAllowance: 0,
          grossPay: 0,
          netPay: 0,
        });
      }

      const target = grouped.get(key);
      if (!target) return;

      target.totalHours += row.totalHours || 0;
      target.basePay += row.basePay || 0;
      target.weeklyAllowance += row.weeklyAllowance || 0;
      target.grossPay += row.grossPay || 0;
      target.netPay += row.netPay || 0;
    });

    return Array.from(grouped.values()).sort((a, b) =>
      a.employeeName.localeCompare(b.employeeName, "ko")
    );
  }, [filteredPayrollRows, startDate, endDate]);

  const filteredContractEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const employeeWorkplace = employee.workplace_name || "장사꾼";
      const keyword = contractSearch.trim().toLowerCase();

      const matchesName =
        keyword === "" || employee.name.toLowerCase().includes(keyword);

      const matchesWorkplace =
        selectedWorkplace === "전체" ||
        employeeWorkplace === selectedWorkplace;

      return matchesName && matchesWorkplace;
    });
  }, [employees, selectedWorkplace, contractSearch]);

  const payrollSummary = useMemo(() => {
    return filteredPayrollRows.reduce(
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
  }, [filteredPayrollRows]);

  const startEdit = (employee: Employee) => {
    const rawWorkplaceName = employee.workplace_name;
    const workplaceName: WorkplaceName =
      rawWorkplaceName === "헤모즈" ||
      rawWorkplaceName === "깨소금" ||
      rawWorkplaceName === "로엔티크"
        ? rawWorkplaceName
        : "장사꾼";
    const scheduleGroup = employee.schedule_group || "";

    setEditingEmployeeId(employee.id);
    setEditName(employee.name);
    setEditPhone(employee.phone || "");
    setEditResidentNumber(employee.resident_number || "");
    setEditBankName(employee.bank_name || "");
    setEditAccountNumber(employee.account_number || "");
    setEditWorkplaceName(workplaceName);
    setEditEmploymentType(employee.employment_type === "carrot" ? "carrot" : "fixed");
    setEditScheduleGroup(
      isValidScheduleGroupForWorkplace(workplaceName, scheduleGroup)
        ? scheduleGroup
        : ""
    );
  };

  const cancelEdit = () => {
    setEditingEmployeeId(null);
    setEditName("");
    setEditPhone("");
    setEditResidentNumber("");
    setEditBankName("");
    setEditAccountNumber("");
    setEditWorkplaceName("장사꾼");
    setEditEmploymentType("fixed");
    setEditScheduleGroup("");
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
          workplaceName: editWorkplaceName,
          employmentType: editEmploymentType,
          employment_type: editEmploymentType,
          scheduleGroup: editScheduleGroup || null,
          schedule_group: editScheduleGroup || null,
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
      await fetchEmployees();
      await fetchRecords();
    } catch (error) {
      console.error(error);
      alert("시급 수정 중 오류 발생");
    }
  };

  const [deletingEmployeeId, setDeletingEmployeeId] = useState<number | null>(
    null
  );

  // 직원 완전 삭제. 출퇴근 기록까지 함께 지워지며 되돌릴 수 없습니다.
  // 확인 문구에 실제로 지워질 건수를 띄우기 위해 먼저 dryRun 으로 건수를 받아옵니다.
  const deleteEmployee = async (employee: Employee) => {
    try {
      setDeletingEmployeeId(employee.id);

      const previewResponse = await fetch(
        `/api/admin/employees/${employee.id}?dryRun=1`,
        { method: "DELETE" }
      );

      const preview = await previewResponse.json();

      if (!preview.success) {
        alert(preview.message || "삭제 대상 확인에 실패했습니다.");
        return;
      }

      const { attendance, devices, schedules } = preview.counts;

      const ok = window.confirm(
        [
          `${employee.name} 직원을 완전히 삭제합니다.`,
          ``,
          `함께 삭제되는 데이터`,
          `  · 출퇴근 기록 ${attendance.toLocaleString("ko-KR")}건`,
          `  · 등록 기기 ${devices}건`,
          `  · 주간 스케줄 ${schedules}건`,
          ``,
          attendance > 0
            ? `⚠ 출퇴근 기록 ${attendance.toLocaleString(
                "ko-KR"
              )}건이 사라지며 이 직원의 과거 급여 내역을 다시 조회할 수 없습니다.`
            : `출퇴근 기록은 없습니다.`,
          `⚠ 되돌릴 수 없습니다.`,
          ``,
          `단순히 목록에서 숨기려면 "비활성화"를 쓰세요.`,
          ``,
          `정말 삭제할까요?`,
        ].join("\n")
      );

      if (!ok) return;

      const response = await fetch(`/api/admin/employees/${employee.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.message || "직원 삭제 실패");
        return;
      }

      alert(
        `${data.deleted.employeeName} 직원이 삭제되었습니다.\n` +
          `출퇴근 기록 ${data.deleted.attendance.toLocaleString(
            "ko-KR"
          )}건 / 기기 ${data.deleted.devices}건 / 스케줄 ${
            data.deleted.schedules
          }건 함께 삭제됨`
      );

      fetchEmployees();
      fetchRecords();
    } catch (error) {
      console.error("직원 삭제 실패:", error);
      alert("직원 삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingEmployeeId(null);
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


  const deleteAttendanceRow = async (row: GroupedAttendanceRow) => {
    const recordIds = [row.checkInRecordId, row.checkOutRecordId].filter(
      (id): id is number => typeof id === "number"
    );

    if (recordIds.length === 0) {
      alert("삭제할 출퇴근 기록이 없습니다.");
      return;
    }

    const ok = window.confirm(
      `${row.employeeName} / ${formatDate(row.date)} 출퇴근 기록을 삭제할까요?\n\n출근 기록과 퇴근 기록이 함께 삭제됩니다.`
    );

    if (!ok) return;

    try {
      const response = await fetch("/api/admin/attendance/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recordIds,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.message || "출퇴근 기록 삭제 실패");
        return;
      }

      alert("출퇴근 기록이 삭제되었습니다.");
      fetchRecords();
    } catch (error) {
      console.error(error);
      alert("출퇴근 기록 삭제 중 오류 발생");
    }
  };

  const downloadAttendanceExcel = () => {
    if (groupedAttendanceRows.length === 0) {
      alert("다운로드할 출퇴근 기록이 없습니다.");
      return;
    }

    const headers = [
      "이름",
      "근무지",
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
      row.workplaceName,
      formatDate(row.date),
      formatCheckInTime(row.checkIn),
      formatCheckOutTime(row.checkOut),
      formatWorkMinutes(row.workMinutes),
      row.hourlyWage ? String(row.hourlyWage) : "0",
      row.grossPay !== null ? String(row.grossPay) : "-",
      row.netPay !== null ? String(row.netPay) : "-",
      row.statusText,
    ]);

    // \uc774 \ud45c\uc5d0\ub294 \uc55e\uc790\ub9ac 0 \uc774 \uc788\uc744 \uc218 \uc788\ub294 \uceec\ub7fc(\uc8fc\ubbfc\ubc88\ud638/\uacc4\uc88c\ubc88\ud638/\uc804\ud654\ubc88\ud638)\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.
    downloadXlsx({
      fileName: `attendance_${startDate}_${endDate}.xlsx`,
      columns: headers.map((header) => ({ header })),
      rows: rows.map((line) => line.map((value) => cell(value))),
    }).catch((error) => {
      console.error("\ucd9c\ud1f4\uadfc \uc5d1\uc140 \ub2e4\uc6b4\ub85c\ub4dc \uc2e4\ud328:", error);
      alert("\uc5d1\uc140 \ud30c\uc77c\uc744 \ub9cc\ub4dc\ub294 \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.");
    });
  };

  const downloadPayrollExcel = () => {
    if (filteredPayrollRows.length === 0) {
      alert("다운로드할 급여 데이터가 없습니다.");
      return;
    }

    const headers = [
      "이름",
      "근무지",
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

    const rows = filteredPayrollRows.map((row) => {
      const employee = employeeMap.get(Number(row.employeeId));
      const workplaceName = row.workplaceName || employee?.workplace_name || "장사꾼";

      return [
        cell(row.employeeName),
        cell(workplaceName),
        // \uc8fc\ubbfc\ubc88\ud638\u00b7\uacc4\uc88c\ubc88\ud638\ub294 \uc55e\uc790\ub9ac 0 \uc774 \uc0ac\ub77c\uc9c0\uc9c0 \uc54a\ub3c4\ub85d \ud14d\uc2a4\ud2b8 \uc140\ub85c \uace0\uc815\ud569\ub2c8\ub2e4.
        textCell(employee?.resident_number || "-"),
        cell(employee?.bank_name || "-"),
        textCell(employee?.account_number || "-"),
        cell(row.weekStart),
        cell(row.weekEnd),
        cell(formatHoursToText(row.totalHours)),
        cell(row.hourlyWage),
        cell(Math.round(row.basePay)),
        cell(Math.round(row.weeklyAllowance)),
        cell(Math.round(row.grossPay)),
        cell(Math.round(row.netPay)),
      ];
    });

    downloadXlsx({
      fileName: `payroll_${startDate}_${endDate}.xlsx`,
      columns: headers.map((header) => ({ header })),
      rows,
    }).catch((error) => {
      console.error("\uae09\uc5ec \uc5d1\uc140 \ub2e4\uc6b4\ub85c\ub4dc \uc2e4\ud328:", error);
      alert("\uc5d1\uc140 \ud30c\uc77c\uc744 \ub9cc\ub4dc\ub294 \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.");
    });
  };


  const downloadPayrollSummaryExcel = () => {
    if (filteredPayrollRows.length === 0) {
      alert("다운로드할 급여 데이터가 없습니다.");
      return;
    }

    // 합산 로직은 app/lib/payrollSummary.ts 로 추출했습니다.
    // 은행제출용 다건이체도 같은 함수를 써서 금액이 갈리지 않게 합니다.
    const grouped = summarizePayrollByEmployee({
      rows: filteredPayrollRows,
      getEmployee: (id) => employeeMap.get(id),
      startDate,
      endDate,
    });

    const headers = [
      "이름",
      "근무지",
      "주민번호",
      "은행",
      "계좌번호",
      "조회 기간",
      "총 근무시간",
      "시급",
      "기본급 합계",
      "주휴수당 합계",
      "세전 급여 합계",
      "세후 급여 합계",
    ];

    const rows = grouped.map((row) => [
      cell(row.employeeName),
      cell(row.workplaceName),
      // \uc8fc\ubbfc\ubc88\ud638\u00b7\uacc4\uc88c\ubc88\ud638\ub294 \uc55e\uc790\ub9ac 0 \uc774 \uc0ac\ub77c\uc9c0\uc9c0 \uc54a\ub3c4\ub85d \ud14d\uc2a4\ud2b8 \uc140\ub85c \uace0\uc815\ud569\ub2c8\ub2e4.
      textCell(row.residentNumber),
      cell(row.bankName),
      textCell(row.accountNumber),
      cell(row.period),
      cell(formatHoursToText(row.totalHours)),
      cell(row.hourlyWage),
      cell(Math.round(row.basePay)),
      cell(Math.round(row.weeklyAllowance)),
      cell(Math.round(row.grossPay)),
      cell(Math.round(row.netPay)),
    ]);

    downloadXlsx({
      fileName: `payroll_summary_${startDate}_${endDate}.xlsx`,
      columns: headers.map((header) => ({ header })),
      rows,
    }).catch((error) => {
      console.error("\uae09\uc5ec \uc694\uc57d \uc5d1\uc140 \ub2e4\uc6b4\ub85c\ub4dc \uc2e4\ud328:", error);
      alert("\uc5d1\uc140 \ud30c\uc77c\uc744 \ub9cc\ub4dc\ub294 \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.");
    });
  };

  // ── 은행제출용(다건이체) ──────────────────────────────────────────
  // 기존 급여대장 다운로드와 완전히 분리된 경로입니다.
  // 금액은 새로 계산하지 않고 summarizePayrollByEmployee 의 netPay 를 그대로 씁니다.
  const bankTransfer = useMemo(() => {
    const summaries = summarizePayrollByEmployee({
      rows: filteredPayrollRows,
      getEmployee: (id) => employeeMap.get(id),
      startDate,
      endDate,
    });

    return buildBankTransferRows({ summaries });
  }, [filteredPayrollRows, employeeMap, startDate, endDate]);

  const [bankTransferDownloading, setBankTransferDownloading] = useState(false);

  const downloadBankTransferExcel = async () => {
    const { chunks, rows, excluded } = bankTransfer;

    if (rows.length === 0) {
      alert(
        excluded.length > 0
          ? "이체 가능한 직원이 없습니다. 아래 제외 목록을 확인해주세요."
          : "다운로드할 급여 데이터가 없습니다."
      );
      return;
    }

    const confirmed = window.confirm(
      [
        `은행제출용 다건이체 파일을 받습니다.`,
        ``,
        `대상 ${rows.length}건 / 파일 ${chunks.length}개`,
        excluded.length > 0
          ? `제외 ${excluded.length}명: ${excluded
              .map((item) => item.employeeName)
              .join(", ")}`
          : `제외 없음`,
        ``,
        `진행할까요?`,
      ].join("\n")
    );

    if (!confirmed) return;

    try {
      setBankTransferDownloading(true);

      for (let index = 0; index < chunks.length; index += 1) {
        // A~E 순서 고정. 헤더 행 없음.
        // 계좌번호는 텍스트 셀(textCell) — 숫자로 저장되면 앞자리 0 이 잘려 이체 사고가 납니다.
        const sheetRows = chunks[index].map((row) => [
          cell(row.bankName),
          textCell(row.accountNumber),
          cell(row.amount),
          cell(row.receiverMemo),
          cell(row.senderMemo),
        ]);

        await downloadXlsxNoHeader({
          fileName: buildTransferFileName(startDate, index),
          rows: sheetRows,
          columnWidths: [14, 22, 14, 14, 18],
        });

        // 브라우저가 연속 다운로드를 팝업으로 보고 막는 경우가 있어 간격을 둡니다.
        if (index < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    } catch (error) {
      console.error("은행제출용 다운로드 실패:", error);
      alert("은행제출용 파일을 만드는 중 오류가 발생했습니다.");
    } finally {
      setBankTransferDownloading(false);
    }
  };

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <header style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Admin Dashboard</p>
            <h1 style={titleStyle}>장사꾼/헤모즈/깨소금/로엔티크 관리자 대시보드</h1>
            <p style={descriptionStyle}>
              직원 상태와 출퇴근 기록, 급여를 한 화면에서 관리할 수 있습니다.
            </p>
          </div>

          <div style={headerButtonWrapStyle}>
            <button
              onClick={() => {
                if (tab === "attendance") {
                  fetchRecords();
                } else if (tab === "employees") {
                  fetchEmployees();
                } else if (tab === "payroll") {
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
            onClick={() => setTab("schedule")}
            style={{
              ...tabButtonStyle,
              backgroundColor: tab === "schedule" ? "#111827" : "#f3f4f6",
              color: tab === "schedule" ? "#ffffff" : "#111827",
            }}
          >
            스케줄 조회
          </button>

          <button
            onClick={() => setTab("dbSize")}
            style={{
              ...tabButtonStyle,
              backgroundColor: tab === "dbSize" ? "#111827" : "#f3f4f6",
              color: tab === "dbSize" ? "#ffffff" : "#111827",
            }}
          >
            DB 용량
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
        <button
          onClick={downloadAttendanceExcel}
          style={primaryButtonStyle}
        >
          엑셀 다운로드
        </button>
      </div>
    </div>

    <div
  style={{
    marginTop: "24px",
    marginBottom: "24px",
    padding: "20px",
    borderRadius: "20px",
    border: "1px solid #bbf7d0",
    background: "linear-gradient(to bottom right, #f0fdf4, #ffffff)",
  }}
>
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginBottom: "8px",
    }}
  >
    <span
      style={{
        width: "22px",
        height: "22px",
        borderRadius: "999px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#d1fae5",
        color: "#059669",
        fontSize: "16px",
        fontWeight: 800,
      }}
    >
      +
    </span>

    <h3
      style={{
        margin: 0,
        fontSize: "19px",
        fontWeight: 800,
        color: "#059669",
      }}
    >
      수동 출퇴근 추가
    </h3>
  </div>

  <p
    style={{
      margin: "0 0 18px 0",
      color: "#64748b",
      fontSize: "13px",
      lineHeight: 1.5,
    }}
  >
    직원마다 날짜와 출퇴근 시간이 달라서 한 줄씩 따로 입력합니다.
    필요한 만큼 행을 추가하면 한 번에 저장됩니다.
    이미 기록이 있는 날은 중복 방지를 위해 자동으로 건너뜁니다.
  </p>

  <div
    style={{
      padding: "14px",
      borderRadius: "14px",
      border: "1px solid #d1fae5",
      background: "#ffffff",
    }}
  >
    {manualEmployeeOptions.length === 0 ? (
      <div
        style={{
          padding: "18px",
          textAlign: "center",
          color: "#9ca3af",
          fontSize: "13px",
          fontWeight: 700,
        }}
      >
        활성 직원이 없습니다.
      </div>
    ) : (
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            minWidth: "720px",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr>
              <th style={{ ...manualThStyle, width: "36px" }}>#</th>
              <th style={manualThStyle}>직원</th>
              <th style={{ ...manualThStyle, width: "150px" }}>날짜</th>
              <th style={{ ...manualThStyle, width: "120px" }}>출근시간</th>
              <th style={{ ...manualThStyle, width: "120px" }}>퇴근시간</th>
              <th style={{ ...manualThStyle, width: "64px" }}>삭제</th>
            </tr>
          </thead>

          <tbody>
            {manualRows.map((row, index) => (
              <tr key={row.key}>
                <td
                  style={{
                    ...manualTdStyle,
                    textAlign: "center",
                    color: "#9ca3af",
                    fontWeight: 800,
                  }}
                >
                  {index + 1}
                </td>

                <td style={manualTdStyle}>
                  <EmployeePicker
                    options={manualEmployeeOptions}
                    value={row.employeeId}
                    onChange={(employeeId) =>
                      updateManualRow(index, { employeeId })
                    }
                  />
                </td>

                <td style={manualTdStyle}>
                  <input
                    type="date"
                    value={row.date}
                    onChange={(event) =>
                      updateManualRow(index, { date: event.target.value })
                    }
                    style={manualFieldStyle}
                  />
                </td>

                <td style={manualTdStyle}>
                  <input
                    type="time"
                    value={row.checkInTime}
                    onChange={(event) =>
                      updateManualRow(index, {
                        checkInTime: event.target.value,
                      })
                    }
                    style={manualFieldStyle}
                  />
                </td>

                <td style={manualTdStyle}>
                  <input
                    type="time"
                    value={row.checkOutTime}
                    onChange={(event) =>
                      updateManualRow(index, {
                        checkOutTime: event.target.value,
                      })
                    }
                    style={manualFieldStyle}
                  />
                </td>

                <td style={{ ...manualTdStyle, textAlign: "center" }}>
                  <button
                    type="button"
                    onClick={() => removeManualRow(index)}
                    disabled={manualRows.length === 1}
                    style={{
                      ...manualSelectButtonStyle,
                      padding: "0 10px",
                      backgroundColor: "#fef2f2",
                      borderColor: "#fecaca",
                      color: "#b91c1c",
                      cursor: manualRows.length === 1 ? "default" : "pointer",
                      opacity: manualRows.length === 1 ? 0.4 : 1,
                    }}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
        marginTop: "14px",
      }}
    >
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={addManualRow}
          style={manualSelectButtonStyle}
        >
          + 행 추가
        </button>

        <button
          type="button"
          onClick={copyLastManualRow}
          style={manualSelectButtonStyle}
          title="마지막 줄의 날짜·출퇴근시간을 그대로 가진 빈 줄을 추가합니다"
        >
          마지막 줄 복사
        </button>

        <button
          type="button"
          onClick={resetManualRows}
          style={manualSelectButtonStyle}
        >
          전체 비우기
        </button>
      </div>

      <button
        onClick={submitManualRows}
        disabled={manualSubmitting || manualReadyRowCount === 0}
        style={{
          height: "44px",
          minWidth: "132px",
          border: "none",
          borderRadius: "12px",
          background: "linear-gradient(to right, #10b981, #22c55e)",
          color: "#ffffff",
          fontWeight: 800,
          fontSize: "14px",
          cursor:
            manualSubmitting || manualReadyRowCount === 0
              ? "default"
              : "pointer",
          opacity: manualSubmitting || manualReadyRowCount === 0 ? 0.5 : 1,
          boxShadow: "0 8px 16px rgba(16,185,129,0.16)",
        }}
      >
        {manualSubmitting
          ? "추가 중..."
          : `${manualReadyRowCount}줄 기록 추가`}
      </button>
    </div>
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

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>근무지 필터</label>
                <select
                  value={selectedWorkplace}
                  onChange={(e) =>
                    setSelectedWorkplace(
                      e.target.value as WorkplaceFilter
                    )
                  }
                  style={inputStyle}
                >
                  <option value="전체">전체</option>
                  <option value="장사꾼">장사꾼</option>
                  <option value="헤모즈">헤모즈</option>
                  <option value="깨소금">깨소금</option>
                  <option value="로엔티크">로엔티크</option>
                </select>
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
                      <th style={thStyle}>주민번호</th>
                      <th style={thStyle}>근무지</th>
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

                          <td style={tdStyle}>{row.residentPrefix || "-"}</td>

                          <td style={tdStyle}>
                            <span
                              style={{
                                ...badgeStyle,
                                ...getWorkplaceBadgeColor(row.workplaceName),
                              }}
                            >
                              {row.workplaceName}
                            </span>
                          </td>

                          <td style={tdStyle}>{formatDate(row.date)}</td>

                          <td style={tdStyle}>
                            {isEditingAttendance ? (
                              <input
                                type="datetime-local"
                                step={60}
                                value={editCheckInTime}
                                onChange={(e) =>
                                  setEditCheckInTime(e.target.value)
                                }
                                style={dateTimeInputStyle}
                              />
                            ) : (
                              formatCheckInTime(row.checkIn)
                            )}
                          </td>

                          <td style={tdStyle}>
                            {isEditingAttendance ? (
                              <input
                                type="datetime-local"
                                step={60}
                                value={editCheckOutTime}
                                onChange={(e) =>
                                  setEditCheckOutTime(e.target.value)
                                }
                                style={dateTimeInputStyle}
                              />
                            ) : (
                              formatCheckOutTime(row.checkOut)
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
                                <>
                                  <button
                                    onClick={() => startAttendanceEdit(row)}
                                    style={primarySmallButtonStyle}
                                  >
                                    시간수정
                                  </button>
                                  <button
                                    onClick={() => deleteAttendanceRow(row)}
                                    style={{
                                      ...secondarySmallButtonStyle,
                                      backgroundColor: "#fee2e2",
                                      color: "#b91c1c",
                                      borderColor: "#fecaca",
                                    }}
                                  >
                                    삭제
                                  </button>
                                </>
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
              휴대폰을 바꾼 직원이 있으면 <strong>기기 재연결</strong> 버튼을
              눌러 코드를 발급한 뒤, 새 휴대폰에서 회원등록 화면에 재연결
              코드를 입력하게 하면 됩니다.
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

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>근무지 필터</label>
                <select
                  value={selectedWorkplace}
                  onChange={(e) =>
                    setSelectedWorkplace(
                      e.target.value as WorkplaceFilter
                    )
                  }
                  style={inputStyle}
                >
                  <option value="전체">전체</option>
                  <option value="장사꾼">장사꾼</option>
                  <option value="헤모즈">헤모즈</option>
                  <option value="깨소금">깨소금</option>
                  <option value="로엔티크">로엔티크</option>
                </select>
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>상태 필터</label>
                <select
                  value={selectedStatus}
                  onChange={(e) =>
                    setSelectedStatus(e.target.value as StatusFilter)
                  }
                  style={inputStyle}
                >
                  <option value="전체">전체</option>
                  <option value="활성">활성</option>
                  <option value="비활성">비활성</option>
                </select>
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
                      <th style={thStyle}>근무지</th>
                      <th style={thStyle}>고용형태</th>
                      <th style={thStyle}>역할그룹</th>
                      <th style={thStyle}>시급</th>
                      <th style={thStyle}>상태</th>
                      <th style={thStyle}>기기 재연결</th>
                      <th style={thStyle}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((employee) => {
                      const reconnectInfo = reconnectInfoMap[employee.id];

                      return (
                        <tr key={employee.id}>
                          <td style={tdStyle}>
                            <span style={nameTextStyle}>{employee.name}</span>
                          </td>

                          <td style={tdStyle}>{formatPhone(employee.phone)}</td>

                          <td style={tdStyle}>{getMaskedResidentNumber(employee)}</td>

                          <td style={tdStyle}>{employee.bank_name || "-"}</td>

                          <td style={tdStyle}>{employee.account_number || "-"}</td>

                          <td style={tdStyle}>
                            <span
                              style={{
                                ...badgeStyle,
                                ...getWorkplaceBadgeColor(
                                  employee.workplace_name || "장사꾼"
                                ),
                              }}
                            >
                              {employee.workplace_name || "장사꾼"}
                            </span>
                          </td>

                          <td style={tdStyle}>
                            <span
                              style={{
                                ...badgeStyle,
                                backgroundColor:
                                  employee.employment_type === "carrot"
                                    ? "#ffedd5"
                                    : "#dcfce7",
                                color:
                                  employee.employment_type === "carrot"
                                    ? "#c2410c"
                                    : "#166534",
                              }}
                            >
                              {employee.employment_type === "carrot" ? "당근" : "고정"}
                            </span>
                          </td>

                          <td style={tdStyle}>
  {employee.workplace_name === "헤모즈" ||
  employee.workplace_name === "깨소금" ||
  employee.workplace_name === "로엔티크" ? (
    <span style={mutedTextStyle}>없음</span>
  ) : employee.schedule_group ? (
    <span
      style={{
        ...badgeStyle,
        backgroundColor: "#f5f3ff",
        color: "#6d28d9",
      }}
    >
      {employee.schedule_group}
    </span>
  ) : (
    <span style={mutedTextStyle}>선택안함</span>
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
                                color: employee.is_active
                                  ? "#2e7d32"
                                  : "#c62828",
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
                              <button
                                onClick={() => startEdit(employee)}
                                style={primarySmallButtonStyle}
                              >
                                수정
                              </button>

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

                              <button
                                onClick={() => deleteEmployee(employee)}
                                disabled={deletingEmployeeId === employee.id}
                                style={{
                                  ...secondarySmallButtonStyle,
                                  backgroundColor: "#fee2e2",
                                  color: "#b91c1c",
                                  borderColor: "#fecaca",
                                  opacity:
                                    deletingEmployeeId === employee.id ? 0.6 : 1,
                                }}
                              >
                                {deletingEmployeeId === employee.id
                                  ? "삭제중..."
                                  : "삭제"}
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

        {tab === "employees" && editingEmployeeId !== null && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100,
              backgroundColor: "rgba(15, 23, 42, 0.46)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "620px",
                borderRadius: "22px",
                backgroundColor: "#ffffff",
                boxShadow: "0 24px 80px rgba(15, 23, 42, 0.28)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "20px 22px",
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "12px",
                  background: "linear-gradient(to bottom right, #f8fafc, #ffffff)",
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
                    직원 정보 수정
                  </div>
                  <div
                    style={{
                      marginTop: "6px",
                      fontSize: "13px",
                      color: "#6b7280",
                      fontWeight: 600,
                    }}
                  >
                    기본 정보와 근무지, 고용형태, 역할그룹을 한 번에 수정합니다.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={cancelEdit}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "999px",
                    border: "1px solid #e5e7eb",
                    backgroundColor: "#ffffff",
                    color: "#111827",
                    fontSize: "22px",
                    fontWeight: 800,
                    cursor: "pointer",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>

              <div style={{ padding: "22px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "14px",
                  }}
                >
                  <div>
                    <label style={labelStyle}>이름</label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>휴대폰번호</label>
                    <input
                      value={editPhone}
                      onChange={(e) =>
                        setEditPhone(e.target.value.replace(/[^0-9]/g, ""))
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>주민번호</label>
                    <input
                      value={editResidentNumber}
                      onChange={(e) =>
                        setEditResidentNumber(
                          e.target.value.replace(/[^0-9]/g, "").slice(0, 13)
                        )
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>은행</label>
                    <input
                      value={editBankName}
                      onChange={(e) => setEditBankName(e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>계좌번호</label>
                    <input
                      value={editAccountNumber}
                      onChange={(e) =>
                        setEditAccountNumber(
                          e.target.value.replace(/[^0-9-]/g, "")
                        )
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>근무지</label>
                    <select
                      value={editWorkplaceName}
                      onChange={(e) => {
                        const nextWorkplace = e.target.value as WorkplaceName;

                        setEditWorkplaceName(nextWorkplace);

                        if (!isValidScheduleGroupForWorkplace(nextWorkplace, editScheduleGroup)) {
                          setEditScheduleGroup("");
                        }
                      }}
                      style={inputStyle}
                    >
                      <option value="장사꾼">장사꾼</option>
                      <option value="헤모즈">헤모즈</option>
                      <option value="깨소금">깨소금</option>
                  <option value="로엔티크">로엔티크</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>고용형태</label>
                    <select
                      value={editEmploymentType}
                      onChange={(e) =>
                        setEditEmploymentType(e.target.value as "fixed" | "carrot")
                      }
                      style={inputStyle}
                    >
                      <option value="fixed">고정</option>
                      <option value="carrot">당근</option>
                    </select>
                  </div>

                  {editWorkplaceName !== "로엔티크" && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelStyle}>역할그룹</label>
                      <select
                        value={editScheduleGroup}
                        onChange={(e) => setEditScheduleGroup(e.target.value)}
                        style={inputStyle}
                      >
                        {getScheduleGroupOptions(editWorkplaceName).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "10px",
                    marginTop: "22px",
                  }}
                >
                  <button
                    type="button"
                    onClick={cancelEdit}
                    style={secondarySmallButtonStyle}
                  >
                    취소
                  </button>

                  <button
                    type="button"
                    onClick={() => updateEmployee(editingEmployeeId)}
                    style={primarySmallButtonStyle}
                  >
                    저장
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

                {tab === "payroll" && (
          <section style={cardStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <h2 style={sectionTitleStyle}>급여 관리</h2>
                <p style={sectionDescriptionStyle}>
                  기간을 직접 선택해서 직원별 합산 급여와 주휴수당을 한 줄로 확인할
                  수 있습니다.
                </p>
              </div>

              <div style={sectionHeaderButtonWrapStyle}>
                <button onClick={downloadPayrollExcel} style={primaryButtonStyle}>
                  상세 엑셀 다운로드
                </button>

                <button
                  onClick={downloadPayrollSummaryExcel}
                  style={primaryButtonStyle}
                >
                  직원별 합산 다운로드
                </button>
              </div>
            </div>

            <div style={bankTransferBoxStyle}>
              <div style={bankTransferHeaderStyle}>
                <div>
                  <h3 style={bankTransferTitleStyle}>은행제출용 (다건이체)</h3>
                  <p style={bankTransferDescStyle}>
                    선택한 기간의 세후 급여를 은행 대량이체 업로드 양식으로
                    받습니다. 금액은 위 급여대장과 같은 값을 씁니다.
                  </p>
                </div>

                <button
                  onClick={downloadBankTransferExcel}
                  disabled={bankTransferDownloading}
                  style={{
                    ...primaryButtonStyle,
                    backgroundColor: "#1d4ed8",
                    opacity: bankTransferDownloading ? 0.6 : 1,
                    cursor: bankTransferDownloading ? "default" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {bankTransferDownloading
                    ? "생성 중..."
                    : "은행제출용 다운로드"}
                </button>
              </div>

              <div style={bankTransferStatWrapStyle}>
                <span style={bankTransferStatStyle}>
                  이체 대상 <strong>{bankTransfer.rows.length}건</strong>
                </span>
                <span style={bankTransferStatStyle}>
                  파일 <strong>{bankTransfer.chunks.length}개</strong>
                  {bankTransfer.rows.length > ROWS_PER_FILE &&
                    ` (${ROWS_PER_FILE}건씩 분할)`}
                </span>
                <span style={bankTransferStatStyle}>
                  이체금액 합계{" "}
                  <strong>
                    {formatCurrency(
                      bankTransfer.rows.reduce((sum, row) => sum + row.amount, 0)
                    )}
                  </strong>
                </span>
              </div>

              {bankTransfer.excluded.length > 0 && (
                <div style={bankTransferWarnStyle}>
                  <strong>
                    {bankTransfer.excluded.length}명 제외됨 — 이 직원은 급여가
                    이체되지 않습니다
                  </strong>
                  <ul style={bankTransferWarnListStyle}>
                    {bankTransfer.excluded.map((item, index) => (
                      <li key={`${item.employeeName}-${index}`}>
                        {item.employeeName} — {item.reason}
                        {item.detail ? ` ("${item.detail}")` : ""}
                      </li>
                    ))}
                  </ul>
                  <div style={bankTransferWarnHelpStyle}>
                    직원 관리에서 은행명·계좌번호를 채우면 다음 다운로드부터
                    포함됩니다.
                  </div>
                </div>
              )}

              <div style={bankTransferHintStyle}>
                파일이 여러 개면 순서대로 자동 다운로드됩니다. 자동으로 안 뜨면
                브라우저의 팝업·다중 다운로드 차단을 해제한 뒤 다시 눌러주세요.
              </div>
            </div>

            <div style={paySummaryWrapStyle}>
              <div style={paySummaryCardStyle}>
                <div style={paySummaryLabelStyle}>총 근무시간 합계</div>
                <div style={paySummaryValueStyle}>
                  {formatHoursToText(payrollSummary.totalHours)}
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

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>근무지 필터</label>
                <select
                  value={selectedWorkplace}
                  onChange={(e) =>
                    setSelectedWorkplace(
                      e.target.value as WorkplaceFilter
                    )
                  }
                  style={inputStyle}
                >
                  <option value="전체">전체</option>
                  <option value="장사꾼">장사꾼</option>
                  <option value="헤모즈">헤모즈</option>
                  <option value="깨소금">깨소금</option>
                  <option value="로엔티크">로엔티크</option>
                </select>
              </div>

              <div style={fieldButtonGroupStyle}>
                <button onClick={fetchPayroll} style={primaryButtonStyle}>
                  조회하기
                </button>
              </div>
            </div>

            <div style={{ ...warningBoxStyle, marginBottom: "18px" }}>
              화면은 직원별 합산으로 표시됩니다. 상세 엑셀 다운로드는 기존처럼 주차별로 내려받을 수 있습니다.
            </div>

            {payrollLoading ? (
              <div style={emptyBoxStyle}>급여 데이터를 불러오는 중입니다...</div>
            ) : payrollMessage ? (
              <div style={emptyBoxStyle}>{payrollMessage}</div>
            ) : monthlyPayrollRows.length === 0 ? (
              <div style={emptyBoxStyle}>급여 데이터가 없습니다.</div>
            ) : (
              <div style={tableScrollStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>이름</th>
                      <th style={thStyle}>근무지</th>
                      <th style={thStyle}>주민번호</th>
                      <th style={thStyle}>은행</th>
                      <th style={thStyle}>계좌번호</th>
                      <th style={thStyle}>조회 시작</th>
                      <th style={thStyle}>조회 종료</th>
                      <th style={thStyle}>총 근무시간</th>
                      <th style={thStyle}>시급</th>
                      <th style={thStyle}>기본급</th>
                      <th style={thStyle}>주휴수당</th>
                      <th style={thStyle}>세전 급여</th>
                      <th style={thStyle}>세후 급여</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyPayrollRows.map((row, index) => {
                      const employee = employeeMap.get(Number(row.employeeId));
                      const workplaceName = row.workplaceName || employee?.workplace_name || "장사꾼";

                      return (
                        <tr key={`${row.employeeId}-${row.weekStart}-${index}`}>
                          <td style={tdStyle}>
                            <span style={nameTextStyle}>{row.employeeName}</span>
                          </td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                ...badgeStyle,
                                ...getWorkplaceBadgeColor(workplaceName),
                              }}
                            >
                              {workplaceName}
                            </span>
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
                          <td style={tdStyle}>
                            {formatHoursToText(row.totalHours)}
                          </td>
                          <td style={tdStyle}>
                            {formatCurrency(row.hourlyWage)}
                          </td>
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
    {/* 🔥 만료 임박 경고 카드 */}
    <section
      style={{
        ...warningBoxStyle,
        marginBottom: "16px",
        backgroundColor: "#fef2f2",
        border: "1px solid #fecaca",
        color: "#991b1b",
      }}
    >
      <strong>⚠️ 계약 종료일이 임박한 직원</strong>

      <div style={{ marginTop: "12px" }}>
        {filteredContractEmployees.filter((emp) => {
          if (!emp.contract_end_date) return false;

          const today = new Date();
          const end = new Date(`${emp.contract_end_date}T00:00:00`);
          const diffDays = Math.ceil(
            (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );

          return diffDays >= 0 && diffDays <= 7;
        }).length === 0 ? (
          <div style={{ color: "#6b7280", marginTop: "8px" }}>
            현재 선택한 근무지 기준 7일 이내 계약 종료 예정 직원이 없습니다.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filteredContractEmployees
              .filter((emp) => {
                if (!emp.contract_end_date) return false;

                const today = new Date();
                const end = new Date(`${emp.contract_end_date}T00:00:00`);
                const diffDays = Math.ceil(
                  (end.getTime() - today.getTime()) /
                    (1000 * 60 * 60 * 24)
                );

                return diffDays >= 0 && diffDays <= 7;
              })
              .map((emp) => {
                const today = new Date();
                const end = new Date(`${emp.contract_end_date}T00:00:00`);
                const diffDays = Math.ceil(
                  (end.getTime() - today.getTime()) /
                    (1000 * 60 * 60 * 24)
                );

                const workplaceName = emp.workplace_name || "장사꾼";

                return (
                  <div
                    key={emp.id}
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #fecaca",
                      borderRadius: "12px",
                      padding: "10px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      <strong>{emp.name}</strong> / {formatPhone(emp.phone)} /{" "}
                      <span
                        style={{
                          ...badgeStyle,
                          ...getWorkplaceBadgeColor(workplaceName),
                        }}
                      >
                        {workplaceName}
                      </span>
                    </span>
                    <span>
                      종료일: {formatDate(emp.contract_end_date || "")} /{" "}
                      <strong>
                        {diffDays === 0
                          ? "오늘 만료"
                          : `${diffDays}일 남음`}
                      </strong>
                    </span>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </section>

    {/* 🔥 계약 관리 테이블 */}
    <section style={cardStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <h2 style={sectionTitleStyle}>근로계약서 관리</h2>
          <p style={sectionDescriptionStyle}>
            직원별 계약 시작일과 종료일을 근무지 기준으로 관리할 수 있습니다.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 1.2fr) minmax(240px, 1fr) auto",
          gap: "12px",
          alignItems: "end",
          marginBottom: "18px",
        }}
      >
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>직원 이름 검색</label>
          <input
            type="text"
            value={contractSearch}
            onChange={(e) => setContractSearch(e.target.value)}
            placeholder="직원 이름을 입력하세요"
            style={{
              ...inputStyle,
              width: "100%",
            }}
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>근무지 필터</label>
          <select
            value={selectedWorkplace}
            onChange={(e) =>
              setSelectedWorkplace(e.target.value as WorkplaceFilter)
            }
            style={inputStyle}
          >
            <option value="전체">전체</option>
            <option value="장사꾼">장사꾼</option>
            <option value="헤모즈">헤모즈</option>
            <option value="깨소금">깨소금</option>
            <option value="로엔티크">로엔티크</option>
          </select>
        </div>

        <div style={fieldButtonGroupStyle}>
          <button onClick={fetchEmployees} style={primaryButtonStyle}>
            직원 새로고침
          </button>
        </div>
      </div>

      {filteredContractEmployees.length === 0 ? (
        <div style={emptyBoxStyle}>선택한 근무지에 해당하는 직원이 없습니다.</div>
      ) : (
        <div style={tableScrollStyle}>
          <table style={employeeTableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>근무지</th>
                <th style={thStyle}>휴대폰번호</th>
                <th style={thStyle}>주민번호</th>
                <th style={thStyle}>계약 시작일</th>
                <th style={thStyle}>계약 종료일</th>
                <th style={thStyle}>관리</th>
              </tr>
            </thead>

            <tbody>
              {filteredContractEmployees.map((emp) => {
                const workplaceName = emp.workplace_name || "장사꾼";

                return (
                  <tr key={emp.id}>
                    <td style={tdStyle}>{emp.name}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          ...badgeStyle,
                          ...getWorkplaceBadgeColor(workplaceName),
                        }}
                      >
                        {workplaceName}
                      </span>
                    </td>
                    <td style={tdStyle}>{formatPhone(emp.phone)}</td>
                    <td style={tdStyle}>{getMaskedResidentNumber(emp)}</td>

                    <td style={tdStyle}>
                      <input
                        type="date"
                        value={emp.contract_start_date || ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setEmployees((prev) =>
                            prev.map((p) =>
                              p.id === emp.id
                                ? { ...p, contract_start_date: value }
                                : p
                            )
                          );
                        }}
                        style={smallInputStyle}
                      />
                    </td>

                    <td style={tdStyle}>
                      <input
                        type="date"
                        value={emp.contract_end_date || ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setEmployees((prev) =>
                            prev.map((p) =>
                              p.id === emp.id
                                ? { ...p, contract_end_date: value }
                                : p
                            )
                          );
                        }}
                        style={smallInputStyle}
                      />
                    </td>

                    <td style={tdStyle}>
                      <button
                        onClick={async () => {
                          await fetch(`/api/admin/employees/${emp.id}`, {
                            method: "PATCH",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              contract_start_date: emp.contract_start_date,
                              contract_end_date: emp.contract_end_date,
                            }),
                          });
                          alert("저장 완료");
                        }}
                        style={primarySmallButtonStyle}
                      >
                        저장
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </>
)}
        {tab === "schedule" && (
          <section style={cardStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <h2 style={sectionTitleStyle}>스케줄 조회</h2>
                <p style={sectionDescriptionStyle}>
                  이번 주 요일별 출근 가능 / 출근 안함 / 미제출 인원을 확인할 수 있습니다.
                </p>
              </div>
            </div>

            <ScheduleTab />
          </section>
        )}

        {tab === "dbSize" && (
          <section style={cardStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <h2 style={sectionTitleStyle}>DB 용량 모니터링</h2>
                <p style={sectionDescriptionStyle}>
                  Supabase 데이터베이스 사용량과 일별 증가 추세, 한도 도달 예상
                  시점을 확인할 수 있습니다.
                </p>
              </div>
            </div>

            <DbSizeTab />
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

// 동명이인 구분용. 직원 목록 API 가 이미 내려주는
// resident_number_masked("710906-2******") 에서 앞 6자리만 사용합니다.
function getResidentPrefix(residentNumberMasked?: string | null) {
  const digits = String(residentNumberMasked || "").replace(/[^0-9]/g, "");

  return digits.length >= 6 ? digits.slice(0, 6) : "";
}

function createSeoulDateTime(dateKey: string, hour: number, minute: number) {
  return new Date(
    `${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0"
    )}:00+09:00`
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

function formatCheckInTime(value: string | null) {
  if (!value) return "-";
  return formatTime(value);
}

function formatCheckOutTime(value: string | null) {
  if (!value) return "-";
  return formatTime(value);
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

function formatHoursToText(hours: number | null | undefined) {
  if (hours === null || hours === undefined || Number.isNaN(hours) || hours < 0) {
    return "-";
  }

  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;

  return `${h}시간 ${m}분`;
}

function formatCurrency(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const seoulDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);

  const year = seoulDate.getUTCFullYear();
  const month = String(seoulDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(seoulDate.getUTCDate()).padStart(2, "0");
  const hour = String(seoulDate.getUTCHours()).padStart(2, "0");
  const minute = String(seoulDate.getUTCMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
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

const bankTransferBoxStyle: CSSProperties = {
  marginTop: "20px",
  padding: "20px",
  borderRadius: "18px",
  border: "1px solid #bfdbfe",
  background: "linear-gradient(to bottom right, #eff6ff, #ffffff)",
};

const bankTransferHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  flexWrap: "wrap",
};

const bankTransferTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "18px",
  fontWeight: 900,
  color: "#1d4ed8",
};

const bankTransferDescStyle: CSSProperties = {
  margin: "6px 0 0 0",
  fontSize: "13px",
  color: "#64748b",
  lineHeight: 1.5,
};

const bankTransferStatWrapStyle: CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginTop: "16px",
};

const bankTransferStatStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: "999px",
  background: "#ffffff",
  border: "1px solid #dbeafe",
  color: "#1e3a8a",
  fontSize: "13px",
  fontWeight: 700,
};

const bankTransferWarnStyle: CSSProperties = {
  marginTop: "14px",
  padding: "14px 16px",
  borderRadius: "14px",
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  fontSize: "13px",
  lineHeight: 1.6,
};

const bankTransferWarnListStyle: CSSProperties = {
  margin: "8px 0 0 0",
  paddingLeft: "18px",
  fontWeight: 700,
};

const bankTransferWarnHelpStyle: CSSProperties = {
  marginTop: "8px",
  color: "#7f1d1d",
  fontWeight: 600,
};

const bankTransferHintStyle: CSSProperties = {
  marginTop: "12px",
  fontSize: "12px",
  color: "#64748b",
  fontWeight: 600,
  lineHeight: 1.5,
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
  marginBottom: "8px",
  display: "block",
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
  padding: "6px 8px",
  width: "100%",
  minWidth: "90px",
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
  display: "inline-flex",
  gap: "6px",
  alignItems: "center",
  flexWrap: "nowrap",
  whiteSpace: "nowrap",
};

const wageInputStyle: CSSProperties = {
  height: "32px",
  padding: "0 8px",
  width: "94px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: "12px",
  backgroundColor: "#ffffff",
  color: "#111827",
  boxSizing: "border-box",
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
  minWidth: "1180px",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: "12px",
  fontWeight: 800,
  color: "#475569",
  backgroundColor: "#f8fafc",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "7px 10px",
  fontSize: "12px",
  color: "#111827",
  borderBottom: "1px solid #e5e7eb",
  verticalAlign: "middle",
  backgroundColor: "#ffffff",
  lineHeight: 1.35,
};

const nameTextStyle: CSSProperties = {
  fontWeight: 700,
  color: "#111827",
};

type EmployeeOption = {
  id: number;
  name: string;
  workplace: string;
  label: string;
};

// 직원이 100명 가까이 되어 목록을 훑는 것보다 이름을 치는 쪽이 빠릅니다.
// 기본 select 는 한글 검색이 안 돼서 입력칸 + 목록으로 직접 만들었습니다.
function EmployeePicker({
  options,
  value,
  onChange,
}: {
  options: EmployeeOption[];
  value: string;
  onChange: (employeeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // ↓↓Enter 를 빠르게 누르면 세 이벤트가 한 번에 처리돼서
  // Enter 가 아직 반영 안 된 옛 highlight 를 읽습니다. ref 로 같이 들고 갑니다.
  const highlightRef = useRef(0);

  const applyHighlight = (next: number) => {
    highlightRef.current = next;
    setHighlight(next);
  };

  const selected =
    options.find((option) => String(option.id) === value) ?? null;

  // 이름·주민번호 앞자리·근무지 중 아무거나로 찾을 수 있게 합니다.
  // 공백은 무시해서 "이 은혜" 로 쳐도 걸리게 합니다.
  const filtered = useMemo(() => {
    const keyword = query.replace(/\s+/g, "").toLowerCase();

    if (!keyword) return options;

    return options.filter((option) =>
      option.label.replace(/\s+/g, "").toLowerCase().includes(keyword)
    );
  }, [options, query]);

  const place = () => {
    const box = boxRef.current;

    if (!box) return;

    const bounds = box.getBoundingClientRect();
    const gap = 4;
    const margin = 8;
    const width = Math.max(bounds.width, 220);

    const spaceBelow = window.innerHeight - bounds.bottom - gap - margin;
    const spaceAbove = bounds.top - gap - margin;

    // 화면 아래쪽 행에서는 목록이 화면 밖으로 밀려 안 보입니다.
    // 아래가 좁으면 위로 펼칩니다.
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const height = Math.min(240, Math.max(120, openUp ? spaceAbove : spaceBelow));

    setRect({
      top: openUp ? Math.max(margin, bounds.top - gap - height) : bounds.bottom + gap,
      left: Math.min(
        Math.max(margin, bounds.left),
        Math.max(margin, window.innerWidth - width - margin)
      ),
      width,
      height,
    });
  };

  const openList = () => {
    place();
    setQuery("");
    applyHighlight(0);
    setOpen(true);
  };

  const closeList = () => {
    setOpen(false);
    setQuery("");
  };

  const pick = (option: EmployeeOption) => {
    onChange(String(option.id));
    closeList();
  };

  // 목록은 화면 기준(fixed)으로 띄웁니다.
  // 표가 가로 스크롤되는 상자 안에 있어서 그 안에 그리면 잘립니다.
  useEffect(() => {
    if (!open) return;

    const handleScroll = (event: Event) => {
      // 목록 자체를 스크롤하는 중이면 위치를 다시 잡을 필요가 없습니다.
      if (listRef.current?.contains(event.target as Node)) return;

      place();
    };

    const handleDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (boxRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;

      closeList();
    };

    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", handleDown);

    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", handleDown);
    };
  }, [open]);

  // 키보드로 내려갈 때 가려진 항목이 보이도록 따라 내립니다.
  useEffect(() => {
    if (!open) return;

    const item = listRef.current?.children[highlight] as
      | HTMLElement
      | undefined;

    item?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (!open) {
        openList();
        return;
      }

      if (filtered.length === 0) return;

      const step = event.key === "ArrowDown" ? 1 : -1;

      applyHighlight(
        (highlightRef.current + step + filtered.length) % filtered.length
      );

      return;
    }

    if (event.key === "Enter" && open) {
      event.preventDefault();

      const option = filtered[highlightRef.current];

      if (option) pick(option);

      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeList();
    }
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        type="text"
        data-role="employee-picker-input"
        value={open ? query : selected?.label ?? ""}
        autoComplete="off"
        placeholder={selected ? selected.label : "이름 검색"}
        onFocus={openList}
        onClick={() => {
          if (!open) openList();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          applyHighlight(0);

          // 닫힌 상태에서 바로 타이핑하는 경우.
          // openList() 를 쓰면 방금 친 글자가 지워집니다.
          if (!open) {
            place();
            setOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
        style={{
          ...manualFieldStyle,
          paddingRight: selected ? "30px" : "10px",
          color: selected || open ? "#111827" : "#9ca3af",
        }}
      />

      {selected && (
        <button
          type="button"
          // 입력칸 포커스를 뺏으면 목록이 닫히면서 버튼도 같이 사라집니다.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange("");
            closeList();
          }}
          title="선택 해제"
          style={{
            position: "absolute",
            top: "50%",
            right: "6px",
            transform: "translateY(-50%)",
            width: "20px",
            height: "20px",
            padding: 0,
            border: "none",
            borderRadius: "999px",
            background: "#f1f5f9",
            color: "#64748b",
            fontSize: "12px",
            fontWeight: 800,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      )}

      {open && rect && (
        <div
          ref={listRef}
          data-role="employee-picker-list"
          style={{
            position: "fixed",
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            maxHeight: `${rect.height}px`,
            overflowY: "auto",
            zIndex: 60,
            borderRadius: "12px",
            border: "1px solid #d1d5db",
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15,23,42,0.16)",
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "12px",
                fontSize: "13px",
                color: "#9ca3af",
                textAlign: "center",
              }}
            >
              일치하는 직원이 없습니다
            </div>
          ) : (
            filtered.map((option, index) => (
              <div
                key={option.id}
                // mousedown 을 막아야 input 의 blur 로 목록이 닫히지 않습니다.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => applyHighlight(index)}
                onClick={() => pick(option)}
                style={{
                  padding: "9px 12px",
                  fontSize: "13px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: "#111827",
                  fontWeight: String(option.id) === value ? 800 : 600,
                  backgroundColor:
                    index === highlight ? "#ecfdf5" : "transparent",
                }}
              >
                {option.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

type ManualRow = {
  key: string;
  employeeId: string;
  date: string;
  checkInTime: string;
  checkOutTime: string;
};

// React key 용 일련번호.
// 배열 index 를 key 로 쓰면 중간 줄을 지울 때 입력값이 옆줄로 딸려갑니다.
let manualRowSeq = 0;

function createManualRow(base?: Partial<ManualRow>): ManualRow {
  manualRowSeq += 1;

  return {
    key: `manual-${manualRowSeq}`,
    employeeId: base?.employeeId ?? "",
    date: base?.date ?? "",
    checkInTime: base?.checkInTime ?? "",
    checkOutTime: base?.checkOutTime ?? "",
  };
}

const manualThStyle: CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontSize: "12px",
  fontWeight: 800,
  color: "#6b7280",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const manualTdStyle: CSSProperties = {
  padding: "6px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
};

const manualFieldStyle: CSSProperties = {
  width: "100%",
  height: "38px",
  padding: "0 10px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
  backgroundColor: "#ffffff",
  fontSize: "13px",
  color: "#111827",
  boxSizing: "border-box",
};

const manualSelectButtonStyle: CSSProperties = {
  height: "30px",
  padding: "0 12px",
  borderRadius: "999px",
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#374151",
  fontSize: "12px",
  fontWeight: 800,
  cursor: "pointer",
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "4px 8px",
  borderRadius: "999px",
  fontSize: "11px",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const actionWrapStyle: CSSProperties = {
  display: "inline-flex",
  gap: "6px",
  alignItems: "center",
  flexWrap: "nowrap",
  whiteSpace: "nowrap",
};

const primarySmallButtonStyle: CSSProperties = {
  height: "32px",
  padding: "0 10px",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  backgroundColor: "#111827",
  color: "#ffffff",
  fontWeight: 700,
  fontSize: "12px",
  whiteSpace: "nowrap",
};

const secondarySmallButtonStyle: CSSProperties = {
  height: "32px",
  padding: "0 10px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  cursor: "pointer",
  backgroundColor: "#ffffff",
  color: "#111827",
  fontWeight: 700,
  fontSize: "12px",
  whiteSpace: "nowrap",
};

const reconnectCellStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  minWidth: "230px",
  whiteSpace: "nowrap",
};

const reconnectButtonStyle: CSSProperties = {
  height: "32px",
  padding: "0 12px",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontWeight: 700,
  fontSize: "12px",
  whiteSpace: "nowrap",
};

const reconnectInfoBoxStyle: CSSProperties = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  padding: "6px 8px",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
};

const reconnectCodeTextStyle: CSSProperties = {
  fontSize: "11px",
  color: "#111827",
};

const reconnectExpireTextStyle: CSSProperties = {
  fontSize: "11px",
  color: "#6b7280",
};

const copyButtonStyle: CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  cursor: "pointer",
  backgroundColor: "#ffffff",
  color: "#111827",
  fontWeight: 700,
  fontSize: "12px",
};

const reconnectEmptyTextStyle: CSSProperties = {
  fontSize: "11px",
  color: "#94a3b8",
  whiteSpace: "nowrap",
};

const emptyBoxStyle: CSSProperties = {
  padding: "28px 20px",
  textAlign: "center",
  color: "#6b7280",
  backgroundColor: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: "16px",

  
};

const mutedTextStyle: CSSProperties = {
  fontSize: "13px",
  color: "#9ca3af",
  fontWeight: 500,
};