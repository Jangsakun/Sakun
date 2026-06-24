"use client";

import { useEffect, useMemo, useState } from "react";

type ShiftType = "open" | "day" | "night";

type ScheduleDay = {
  day: string;
  label: string;
  dayLabel?: string;
  dateLabel?: string;
  fullDate: string;
  available: boolean;
  shift?: ShiftType | null;
  shiftType?: ShiftType | null;
  shiftLabel?: string | null;
};

type EmployeeItem = {
  id?: number | string;
  name: string;
  gender?: string | null;
  schedule_group?: string | null;
  scheduleGroup?: string | null;
  employment_type?: string | null;
  employmentType?: string | null;
  workplace_name?: string | null;
  workplaceName?: string | null;
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

type AttendanceItem = {
  id?: number | string | null;
  record_type?: string | null;
  recordType?: string | null;
  checked_at?: string | null;
  checkedAt?: string | null;
  employee_id?: number | string | null;
  employeeId?: number | string | null;
  employee_name?: string | null;
  employeeName?: string | null;
  name?: string | null;
  work_date?: string | null;
  workDate?: string | null;
  date?: string | null;
  check_in_time?: string | null;
  checkInTime?: string | null;
  employees?: {
    id?: number | string | null;
    name?: string | null;
    workplace_name?: string | null;
    workplaceName?: string | null;
  } | null;
};


type DayItem = {
  label: string;
  value: string;
  day: string;
};

type WeekMode = "current" | "next";

type WorkplaceName = "장사꾼" | "헤모즈";

type RoleGroupKey =
  | "rallaMoarim"
  | "monggeul"
  | "delivery"
  | "embroidery"
  | "night"
  | "carrot"
  | "unassigned"
  | "hemozOpen"
  | "hemozDay";

type RoleGroupConfig = {
  key: RoleGroupKey;
  title: string;
  subtitle: string;
  values: string[];
  accent: string;
  bg: string;
  chipBg: string;
  chipColor: string;
};

const ROLE_GROUPS: RoleGroupConfig[] = [
  {
    key: "rallaMoarim",
    title: "랄라 / 모아림",
    subtitle: "주간 생산 메인",
    values: ["랄라", "모아림"],
    accent: "#7c3aed",
    bg: "#f5f3ff",
    chipBg: "#ede9fe",
    chipColor: "#5b21b6",
  },
  {
    key: "monggeul",
    title: "몽글솜",
    subtitle: "몽글솜 담당",
    values: ["몽글솜"],
    accent: "#db2777",
    bg: "#fdf2f8",
    chipBg: "#fce7f3",
    chipColor: "#be185d",
  },
  {
    key: "delivery",
    title: "택배",
    subtitle: "포장 / 출고",
    values: ["택배"],
    accent: "#0284c7",
    bg: "#f0f9ff",
    chipBg: "#e0f2fe",
    chipColor: "#0369a1",
  },
  {
    key: "embroidery",
    title: "자수",
    subtitle: "자수 작업",
    values: ["자수"],
    accent: "#16a34a",
    bg: "#f0fdf4",
    chipBg: "#dcfce7",
    chipColor: "#166534",
  },
  {
    key: "night",
    title: "야간근무",
    subtitle: "야간 제출 인원",
    values: [],
    accent: "#4338ca",
    bg: "#eef2ff",
    chipBg: "#e0e7ff",
    chipColor: "#3730a3",
  },
  {
    key: "carrot",
    title: "당근",
    subtitle: "당근 알바 출근 인원",
    values: [],
    accent: "#f97316",
    bg: "#fff7ed",
    chipBg: "#ffedd5",
    chipColor: "#c2410c",
  },
  {
    key: "unassigned",
    title: "역할 미지정",
    subtitle: "직원관리에서 역할 설정 필요",
    values: [""],
    accent: "#6b7280",
    bg: "#f9fafb",
    chipBg: "#e5e7eb",
    chipColor: "#374151",
  },
];


const HEMOZ_ROLE_GROUPS: RoleGroupConfig[] = [
  {
    key: "hemozOpen",
    title: "오픈",
    subtitle: "헤모즈 오픈 출근 인원",
    values: [],
    accent: "#7c3aed",
    bg: "#f5f3ff",
    chipBg: "#ede9fe",
    chipColor: "#5b21b6",
  },
  {
    key: "hemozDay",
    title: "주간",
    subtitle: "헤모즈 주간 출근 인원",
    values: [],
    accent: "#2563eb",
    bg: "#eff6ff",
    chipBg: "#dbeafe",
    chipColor: "#1d4ed8",
  },
  {
    key: "carrot",
    title: "당근",
    subtitle: "당근 알바 출근 인원",
    values: [],
    accent: "#f97316",
    bg: "#fff7ed",
    chipBg: "#ffedd5",
    chipColor: "#c2410c",
  },
];

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

  const labels = ["월", "화", "수", "목", "금", "토"];

  return [0, 1, 2, 3, 4, 5].map((offset) => {
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

function normalizeShift(value: unknown): ShiftType {
  const normalized = String(value || "").toLowerCase().trim();

  if (normalized === "open" || normalized === "오픈") {
    return "open";
  }

  if (normalized === "night" || normalized === "야간") {
    return "night";
  }

  return "day";
}

function getShiftLabel(shift: ShiftType) {
  if (shift === "open") return "오픈";
  if (shift === "night") return "야간";
  return "주간";
}

function getScheduleItemShift(item?: ScheduleDay | null): ShiftType {
  return normalizeShift(item?.shift || item?.shiftType || item?.shiftLabel);
}

function getEmployeeScheduleGroup(employee: EmployeeItem) {
  return String(employee.schedule_group || employee.scheduleGroup || "").trim();
}

function getEmployeeEmploymentType(employee: EmployeeItem) {
  return String(employee.employment_type || employee.employmentType || "fixed").trim();
}

function isCarrotEmployee(employee: EmployeeItem) {
  return getEmployeeEmploymentType(employee) === "carrot";
}

function getEmployeeKey(employee: EmployeeItem) {
  return String(employee.id ?? employee.name);
}

function getAttendanceDateKey(record: AttendanceItem) {
  const rawDate =
    record.work_date ||
    record.workDate ||
    record.date ||
    record.checked_at ||
    record.checkedAt ||
    record.check_in_time ||
    record.checkInTime ||
    "";

  if (!rawDate) return "";

  return String(rawDate).slice(0, 10);
}

function getAttendanceEmployeeKey(record: AttendanceItem) {
  return String(
    record.employee_id ??
      record.employeeId ??
      record.employees?.id ??
      record.employee_name ??
      record.employeeName ??
      record.employees?.name ??
      record.name ??
      ""
  );
}

function normalizeAttendanceList(payload: unknown): AttendanceItem[] {
  if (Array.isArray(payload)) return payload as AttendanceItem[];

  if (!payload || typeof payload !== "object") return [];

  const result = payload as {
    data?: unknown;
    records?: unknown;
    attendanceRecords?: unknown;
    items?: unknown;
  };

  if (Array.isArray(result.data)) return result.data as AttendanceItem[];
  if (Array.isArray(result.records)) return result.records as AttendanceItem[];
  if (Array.isArray(result.attendanceRecords)) return result.attendanceRecords as AttendanceItem[];
  if (Array.isArray(result.items)) return result.items as AttendanceItem[];

  if (result.data && typeof result.data === "object") {
    const nested = result.data as {
      records?: unknown;
      attendanceRecords?: unknown;
      items?: unknown;
    };

    if (Array.isArray(nested.records)) return nested.records as AttendanceItem[];
    if (Array.isArray(nested.attendanceRecords)) return nested.attendanceRecords as AttendanceItem[];
    if (Array.isArray(nested.items)) return nested.items as AttendanceItem[];
  }

  return [];
}

function getScheduleItemForDate(employee: EmployeeItem, date: string) {
  return employee.schedule?.find((item) => item.fullDate === date) || null;
}

function isEmployeeAvailableOnDate(employee: EmployeeItem, date: string, _selectedDate: string) {
  const matched = getScheduleItemForDate(employee, date);

  if (!matched) {
    return false;
  }

  return matched.available === true;
}

function getDefaultShiftByEmployeeGroup(employee: EmployeeItem): ShiftType {
  const scheduleGroup = getEmployeeScheduleGroup(employee);

  if (scheduleGroup === "오픈") {
    return "open";
  }

  return "day";
}

function getEmployeeScheduleItemShift(
  employee: EmployeeItem,
  item?: ScheduleDay | null
): ShiftType {
  if (!item) {
    return getDefaultShiftByEmployeeGroup(employee);
  }

  const rawShift = item.shift || item.shiftType || item.shiftLabel;

  if (!rawShift || String(rawShift).trim() === "") {
    return getDefaultShiftByEmployeeGroup(employee);
  }

  return normalizeShift(rawShift);
}

function getEmployeeShiftForDate(employee: EmployeeItem, date: string): ShiftType {
  const matched = getScheduleItemForDate(employee, date);

  if (matched?.available === true) {
    return getEmployeeScheduleItemShift(employee, matched);
  }

  const scheduleGroup = getEmployeeScheduleGroup(employee);

  if (scheduleGroup === "오픈") {
    return "open";
  }

  if (scheduleGroup === "주간") {
    return "day";
  }

  return getDefaultShiftByEmployeeGroup(employee);
}

function getEmployeesForRoleAndDate({
  employees,
  group,
  date,
  selectedDate,
}: {
  employees: EmployeeItem[];
  group: RoleGroupConfig;
  date: string;
  selectedDate: string;
}) {
  return employees
    .filter((employee) => {
      if (!isEmployeeAvailableOnDate(employee, date, selectedDate)) {
        return false;
      }

      const shift = getEmployeeShiftForDate(employee, date);

      // 야간 근무자는 일반 역할그룹/당근 칸에 중복 표시하지 않고
      // 아래의 "야간근무" 칸에만 표시합니다.
      if (shift === "night") {
        return false;
      }

      if (group.key === "carrot") {
        return isCarrotEmployee(employee);
      }

      if (isCarrotEmployee(employee)) {
        return false;
      }

      const scheduleGroup = getEmployeeScheduleGroup(employee);
      const matchesGroup =
        group.key === "unassigned"
          ? !scheduleGroup
          : group.values.includes(scheduleGroup);

      return matchesGroup;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

function getEmployeesForHemozGroupAndDate({
  employees,
  group,
  date,
  selectedDate,
}: {
  employees: EmployeeItem[];
  group: RoleGroupConfig;
  date: string;
  selectedDate: string;
}) {
  const targetShift: ShiftType = group.key === "hemozOpen" ? "open" : "day";

  return employees
    .filter((employee) => {
      if (!isEmployeeAvailableOnDate(employee, date, selectedDate)) {
        return false;
      }

      if (group.key === "carrot") {
        return isCarrotEmployee(employee);
      }

      if (isCarrotEmployee(employee)) {
        return false;
      }

      return getEmployeeShiftForDate(employee, date) === targetShift;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

function getNotSubmittedEmployeesForDate(employees: EmployeeItem[]) {
  return employees.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

function getUnavailableEmployeesForDate({
  employees,
  notSubmittedEmployees,
  date,
}: {
  employees: EmployeeItem[];
  notSubmittedEmployees: EmployeeItem[];
  date: string;
}) {
  const notSubmittedKeys = new Set(notSubmittedEmployees.map((employee) => getEmployeeKey(employee)));

  return employees
    .filter((employee) => {
      if (notSubmittedKeys.has(getEmployeeKey(employee))) {
        return false;
      }

      const matchedSchedule = employee.schedule?.find((item) => item.fullDate === date);
      return matchedSchedule?.available !== true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export default function ScheduleTab() {
  const [weekMode, setWeekMode] = useState<WeekMode>("current");
  const [selectedWorkplace, setSelectedWorkplace] = useState<WorkplaceName>("장사꾼");

  const days = useMemo(() => getWeekDaysInKst(weekMode), [weekMode]);

  const { weekStartDate, weekEndDate } = useMemo(
    () => getWeekStartAndEnd(days),
    [days]
  );

  const [selectedDate, setSelectedDate] = useState<string>(days[0]?.value || "");
  const [data, setData] = useState<ScheduleApiResponse["data"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedInKeysByDate, setCheckedInKeysByDate] = useState<Record<string, Set<string>>>({});

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
      map.set(getEmployeeKey(emp), emp);
    });

    return Array.from(map.values());
  }, [data]);

  const availableEmployees = useMemo(() => {
    const map = new Map<string, EmployeeItem>();

    (data?.available || []).forEach((emp) => {
      map.set(getEmployeeKey(emp), emp);
    });

    allEmployees.forEach((emp) => {
      const hasAvailableInWeek = days.some((day) =>
        emp.schedule?.some(
          (item) => item.fullDate === day.value && item.available === true
        )
      );

      if (hasAvailableInWeek) {
        map.set(getEmployeeKey(emp), emp);
      }
    });

    return Array.from(map.values());
  }, [data, allEmployees, days]);


  const fetchSchedule = async (date: string) => {
    if (!date) return;

    try {
      setLoading(true);

      const params = new URLSearchParams({
        date,
        workplace: selectedWorkplace,
      });

      const res = await fetch(`/api/admin/schedule?${params.toString()}`, {
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

  const fetchAttendanceStatus = async () => {
    if (!weekStartDate || !weekEndDate) return;

    try {
      const res = await fetch("/api/admin/attendance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          startDate: weekStartDate,
          endDate: weekEndDate,
        }),
      });

      if (!res.ok) {
        setCheckedInKeysByDate({});
        return;
      }

      const result = await res.json();
      const records = normalizeAttendanceList(result);

      const nextCheckedInKeysByDate: Record<string, Set<string>> = {};

      records.forEach((record) => {
        const recordType = String(record.record_type || record.recordType || "").trim();
        const hasCheckedIn =
          recordType === "check_in" ||
          Boolean(record.check_in_time || record.checkInTime);

        const recordWorkplace = String(
          record.employees?.workplace_name ||
            record.employees?.workplaceName ||
            selectedWorkplace
        ).trim();

        const dateKey = getAttendanceDateKey(record);
        const employeeKey = getAttendanceEmployeeKey(record);
        const employeeNameKey = String(
          record.employee_name ||
            record.employeeName ||
            record.employees?.name ||
            record.name ||
            ""
        ).trim();

        if (!hasCheckedIn || !dateKey || !employeeKey) return;
        if (recordWorkplace && recordWorkplace !== selectedWorkplace) return;

        if (!nextCheckedInKeysByDate[dateKey]) {
          nextCheckedInKeysByDate[dateKey] = new Set<string>();
        }

        nextCheckedInKeysByDate[dateKey].add(String(employeeKey));
        if (employeeNameKey) {
          nextCheckedInKeysByDate[dateKey].add(employeeNameKey);
        }
      });

      setCheckedInKeysByDate(nextCheckedInKeysByDate);
    } catch (error) {
      console.error("출근 상태 조회 실패:", error);
      setCheckedInKeysByDate({});
    }
  };

  const isEmployeeCheckedInOnDate = (employee: EmployeeItem, date: string) => {
    const checkedInKeys = checkedInKeysByDate[date];

    if (!checkedInKeys) return false;

    const employeeIdKey = employee.id !== undefined && employee.id !== null ? String(employee.id) : "";
    const employeeNameKey = String(employee.name || "");

    return (
      (!!employeeIdKey && checkedInKeys.has(employeeIdKey)) ||
      (!!employeeNameKey && checkedInKeys.has(employeeNameKey))
    );
  };

  const handleChangeWorkplace = (nextWorkplace: WorkplaceName) => {
    setSelectedWorkplace(nextWorkplace);
    setSelectedEmployee(null);
    setEditSchedule([]);
  };

  const handleChangeWeekMode = (nextWeekMode: WeekMode) => {
    const nextDays = getWeekDaysInKst(nextWeekMode);

    setWeekMode(nextWeekMode);
    setSelectedDate(nextDays[0]?.value || "");
    setSelectedEmployee(null);
    setEditSchedule([]);
  };

  const handleChangeWeekModeInModal = (nextWeekMode: WeekMode) => {
    const nextDays = getWeekDaysInKst(nextWeekMode);

    setWeekMode(nextWeekMode);
    setSelectedDate(nextDays[0]?.value || "");
  };

  const openEditModal = (employee: EmployeeItem) => {
    const selectedAvailableMap = new Map<string, ShiftType>();

    const matchedEmployee = allEmployees.find(
      (emp) => String(emp.id ?? emp.name) === String(employee.id ?? employee.name)
    );

    const employeeSchedule = matchedEmployee?.schedule || employee.schedule;

    if (Array.isArray(employeeSchedule)) {
      employeeSchedule.forEach((item) => {
        if (
          item.available === true &&
          item.fullDate &&
          item.fullDate >= weekStartDate &&
          item.fullDate <= weekEndDate
        ) {
          selectedAvailableMap.set(item.fullDate, getEmployeeScheduleItemShift(matchedEmployee || employee, item));
        }
      });
    } else if (
      (data?.available || []).some(
        (emp) => String(emp.id ?? emp.name) === String(employee.id ?? employee.name)
      )
    ) {
      selectedAvailableMap.set(selectedDate, getEmployeeShiftForDate(employee, selectedDate));
    }

    const defaultShift = getDefaultShiftByEmployeeGroup(matchedEmployee || employee);

    const nextSchedule = days.map((day) => ({
      day: day.day,
      label: day.label,
      fullDate: day.value,
      available: selectedAvailableMap.has(day.value),
      shift: selectedAvailableMap.get(day.value) || defaultShift,
      shiftType: selectedAvailableMap.get(day.value) || defaultShift,
      shiftLabel: getShiftLabel(selectedAvailableMap.get(day.value) || defaultShift),
    }));

    setSelectedEmployee(matchedEmployee || employee);
    setEditSchedule(nextSchedule);
  };

  const closeEditModal = () => {
    setSelectedEmployee(null);
    setEditSchedule([]);
    setSaving(false);
  };

  const toggleEditSchedule = (fullDate: string) => {
    setEditSchedule((prev) =>
      prev.map((item) => {
        if (item.fullDate !== fullDate) return item;

        const nextAvailable = !item.available;
        const defaultShift = selectedEmployee
          ? getDefaultShiftByEmployeeGroup(selectedEmployee)
          : "day";
        const nextShift = nextAvailable
          ? item.shift || defaultShift
          : item.shift || defaultShift;

        return {
          ...item,
          available: nextAvailable,
          shift: nextShift,
          shiftType: nextShift,
          shiftLabel: getShiftLabel(nextShift),
        };
      })
    );
  };

  const changeEditScheduleShift = (fullDate: string, shift: ShiftType) => {
    setEditSchedule((prev) =>
      prev.map((item) =>
        item.fullDate === fullDate
          ? {
              ...item,
              available: true,
              shift,
              shiftType: shift,
              shiftLabel: getShiftLabel(shift),
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
          workplaceName: selectedWorkplace,
          weekStartDate,
          weekEndDate,
          schedule: editSchedule.map((item) => {
            const shift = item.available ? getScheduleItemShift(item) : "day";

            return {
              day: item.day,
              label: item.label,
              dayLabel: item.day,
              dateLabel: item.label,
              fullDate: item.fullDate,
              available: item.available,
              shift,
              shiftType: shift,
              shiftLabel: getShiftLabel(shift),
            };
          }),
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
      fetchAttendanceStatus();
    }
  }, [selectedDate, selectedWorkplace, weekStartDate, weekEndDate]);

  useEffect(() => {
    if (!selectedEmployee) return;

    const matchedEmployee = allEmployees.find(
      (emp) =>
        String(emp.id ?? emp.name) ===
        String(selectedEmployee.id ?? selectedEmployee.name)
    );

    const selectedAvailableMap = new Map<string, ShiftType>();

    if (matchedEmployee && Array.isArray(matchedEmployee.schedule)) {
      matchedEmployee.schedule.forEach((item) => {
        if (
          item.available === true &&
          item.fullDate &&
          item.fullDate >= weekStartDate &&
          item.fullDate <= weekEndDate
        ) {
          selectedAvailableMap.set(item.fullDate, getEmployeeScheduleItemShift(matchedEmployee, item));
        }
      });
    }

    const defaultShift = selectedEmployee
      ? getDefaultShiftByEmployeeGroup(selectedEmployee)
      : "day";

    const newSchedule = days.map((day) => {
      const shift = selectedAvailableMap.get(day.value) || defaultShift;

      return {
        day: day.day,
        label: day.label,
        fullDate: day.value,
        available: selectedAvailableMap.has(day.value),
        shift,
        shiftType: shift,
        shiftLabel: getShiftLabel(shift),
      };
    });

    setEditSchedule(newSchedule);
  }, [weekMode, data, selectedEmployee, days, weekStartDate, weekEndDate, allEmployees]);

  const renderEmployeeChip = (
    emp: EmployeeItem,
    index: number,
    bgColor: string,
    textColor: string,
    dateForShift = selectedDate,
    showShift = true
  ) => {
    const shift = getEmployeeShiftForDate(emp, dateForShift);
    const isCheckedIn = isEmployeeCheckedInOnDate(emp, dateForShift);

    return (
      <button
        key={`${emp.id ?? emp.name}-${index}-${dateForShift}`}
        type="button"
        onClick={() => openEditModal(emp)}
        style={{
          padding: "7px 10px",
          borderRadius: "999px",
          background: bgColor,
          fontSize: "13px",
          color: textColor,
          fontWeight: 800,
          border: "none",
          cursor: "pointer",
          whiteSpace: "nowrap",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {isCheckedIn && (
          <span
            aria-label="출근 완료"
            title="출근 완료"
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "999px",
              background: "#22c55e",
              display: "inline-block",
              flexShrink: 0,
            }}
          />
        )}
        <span>{emp.name}</span>
        {showShift && (
          <span
            style={{
              marginLeft: "6px",
              fontSize: "11px",
              fontWeight: 900,
              opacity: 0.8,
            }}
          >
            {getShiftLabel(shift)}
          </span>
        )}
      </button>
    );
  };

  const renderRoleWeekTable = () => {
    const activeRoleGroups =
      selectedWorkplace === "헤모즈" ? HEMOZ_ROLE_GROUPS : ROLE_GROUPS;

    return (
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "18px",
          background: "#ffffff",
          overflow: "hidden",
          boxShadow: "0 10px 28px rgba(15, 23, 42, 0.06)",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            padding: "16px 18px",
            borderBottom: "1px solid #eef2f7",
            background: "linear-gradient(135deg, #ffffff, #f8fafc)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "18px",
                fontWeight: 900,
                color: "#111827",
              }}
            >
              {selectedWorkplace === "헤모즈" ? "헤모즈 주간 스케줄" : "역할별 주간 스케줄"}
            </div>
            <div
              style={{
                marginTop: "5px",
                fontSize: "13px",
                color: "#6b7280",
                fontWeight: 700,
              }}
            >
              {selectedWorkplace === "헤모즈"
                ? "행은 오픈 / 주간 / 당근 / 출근안함 / 미제출, 열은 요일입니다. 이름을 누르면 해당 직원 스케줄을 수정할 수 있습니다."
                : "행은 역할그룹 / 당근, 열은 요일입니다. 이름을 누르면 해당 직원 스케줄을 수정할 수 있습니다."}
            </div>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              padding: "8px 12px",
              borderRadius: "999px",
              background: "#f0fdf4",
              color: "#15803d",
              fontSize: "12px",
              fontWeight: 900,
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "999px",
                background: "#22c55e",
                display: "inline-block",
              }}
            />
            출근 완료
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: "1120px",
              borderCollapse: "separate",
              borderSpacing: 0,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    width: "210px",
                    textAlign: "left",
                    padding: "14px 16px",
                    background: "#f8fafc",
                    borderBottom: "1px solid #e5e7eb",
                    color: "#475569",
                    fontSize: "13px",
                    fontWeight: 900,
                  }}
                >
                  {selectedWorkplace === "헤모즈" ? "구분" : "역할그룹"}
                </th>
                {days.map((day) => {
                  return (
                    <th
                      key={day.value}
                      style={{
                        textAlign: "left",
                        padding: "14px 12px",
                        background: "#f8fafc",
                        borderBottom: "1px solid #e5e7eb",
                        borderLeft: "1px solid #eef2f7",
                        color: "#475569",
                        fontSize: "13px",
                        fontWeight: 900,
                        cursor: "default",
                        minWidth: "150px",
                      }}
                    >
                      <div>{day.day}요일</div>
                      <div
                        style={{
                          marginTop: "4px",
                          fontSize: "12px",
                          opacity: 0.8,
                        }}
                      >
                        {day.value}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {activeRoleGroups.map((group) => (
                <tr key={group.key}>
                  <td
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid #eef2f7",
                      background: group.bg,
                      verticalAlign: "top",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "9px",
                        color: group.accent,
                        fontWeight: 900,
                        fontSize: "15px",
                      }}
                    >
                      <span
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "999px",
                          background: group.accent,
                          display: "inline-block",
                        }}
                      />
                      {group.title}
                    </div>
                    <div
                      style={{
                        marginTop: "6px",
                        color: "#64748b",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      {group.subtitle}
                    </div>
                  </td>

                  {days.map((day) => {
                    const employees =
                      selectedWorkplace === "헤모즈"
                        ? getEmployeesForHemozGroupAndDate({
                            employees: allEmployees,
                            group,
                            date: day.value,
                            selectedDate,
                          })
                        : group.key === "night"
                          ? allEmployees
                              .filter(
                                (employee) =>
                                  isEmployeeAvailableOnDate(
                                    employee,
                                    day.value,
                                    selectedDate
                                  ) &&
                                  getEmployeeShiftForDate(employee, day.value) ===
                                    "night"
                              )
                              .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                          : getEmployeesForRoleAndDate({
                              employees: allEmployees,
                              group,
                              date: day.value,
                              selectedDate,
                            });
                    return (
                      <td
                        key={`${group.key}-${day.value}`}
                        style={{
                          padding: "12px",
                          borderBottom: "1px solid #eef2f7",
                          borderLeft: "1px solid #f1f5f9",
                          verticalAlign: "top",
                          background: "#ffffff",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "8px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "12px",
                              color: employees.length > 0 ? group.accent : "#9ca3af",
                              fontWeight: 900,
                            }}
                          >
                            {employees.length}명
                          </span>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "7px",
                            minHeight: "38px",
                            alignContent: "flex-start",
                          }}
                        >
                          {employees.length === 0 ? (
                            <span
                              style={{
                                color: "#cbd5e1",
                                fontSize: "13px",
                                fontWeight: 800,
                              }}
                            >
                              -
                            </span>
                          ) : (
                            employees.map((employee, index) =>
                              renderEmployeeChip(
                                employee,
                                index,
                                group.chipBg,
                                group.chipColor,
                                day.value,
                                selectedWorkplace !== "헤모즈"
                              )
                            )
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}

              <tr>
                <td
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #eef2f7",
                    background: "#fef2f2",
                    verticalAlign: "top",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "9px",
                      color: "#b91c1c",
                      fontWeight: 900,
                      fontSize: "15px",
                    }}
                  >
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "999px",
                        background: "#ef4444",
                        display: "inline-block",
                      }}
                    />
                    출근 안함
                  </div>
                  <div
                    style={{
                      marginTop: "6px",
                      color: "#64748b",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    날짜별 출근 불가 / 미선택
                  </div>
                </td>

                {days.map((day) => {
                  const employees = getUnavailableEmployeesForDate({
                    employees: allEmployees,
                    notSubmittedEmployees: data?.notSubmitted || [],
                    date: day.value,
                  });
                  return (
                    <td
                      key={`unavailable-${day.value}`}
                      style={{
                        padding: "12px",
                        borderBottom: "1px solid #eef2f7",
                        borderLeft: "1px solid #f1f5f9",
                        verticalAlign: "top",
                        background: "#ffffff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "8px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "12px",
                            color: employees.length > 0 ? "#b91c1c" : "#9ca3af",
                            fontWeight: 900,
                          }}
                        >
                          {employees.length}명
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "7px",
                          minHeight: "38px",
                          alignContent: "flex-start",
                        }}
                      >
                        {employees.length === 0 ? (
                          <span
                            style={{
                              color: "#cbd5e1",
                              fontSize: "13px",
                              fontWeight: 800,
                            }}
                          >
                            -
                          </span>
                        ) : (
                          employees.map((employee, index) =>
                            renderEmployeeChip(
                              employee,
                              index,
                              "#fee2e2",
                              "#991b1b",
                              day.value,
                              false
                            )
                          )
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>

              <tr>
                <td
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #eef2f7",
                    background: "#f3f4f6",
                    verticalAlign: "top",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "9px",
                      color: "#374151",
                      fontWeight: 900,
                      fontSize: "15px",
                    }}
                  >
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "999px",
                        background: "#9ca3af",
                        display: "inline-block",
                      }}
                    />
                    미제출
                  </div>
                  <div
                    style={{
                      marginTop: "6px",
                      color: "#64748b",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    해당 주 스케줄 미제출
                  </div>
                </td>

                {days.map((day) => {
                  const employees = getNotSubmittedEmployeesForDate([...(data?.notSubmitted || [])]);
                  return (
                    <td
                      key={`not-submitted-${day.value}`}
                      style={{
                        padding: "12px",
                        borderBottom: "1px solid #eef2f7",
                        borderLeft: "1px solid #f1f5f9",
                        verticalAlign: "top",
                        background: "#ffffff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "8px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "12px",
                            color: employees.length > 0 ? "#374151" : "#9ca3af",
                            fontWeight: 900,
                          }}
                        >
                          {employees.length}명
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "7px",
                          minHeight: "38px",
                          alignContent: "flex-start",
                        }}
                      >
                        {employees.length === 0 ? (
                          <span
                            style={{
                              color: "#cbd5e1",
                              fontSize: "13px",
                              fontWeight: 800,
                            }}
                          >
                            -
                          </span>
                        ) : (
                          employees.map((employee, index) =>
                            renderEmployeeChip(
                              employee,
                              index,
                              "#e5e7eb",
                              "#374151",
                              day.value,
                              false
                            )
                          )
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginTop: "16px" }}>
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "16px",
          background: "#ffffff",
          overflow: "hidden",
          marginBottom: "18px",
          boxShadow: "0 8px 22px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "14px",
            flexWrap: "wrap",
            padding: "14px 16px",
            borderBottom: "1px solid #eef2f7",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                fontWeight: 900,
                color: "#111827",
              }}
            >
              근무지
            </span>

            <button
              type="button"
              onClick={() => handleChangeWorkplace("장사꾼")}
              style={{
                height: "40px",
                padding: "0 18px",
                borderRadius: "999px",
                border:
                  selectedWorkplace === "장사꾼"
                    ? "1px solid #111827"
                    : "1px solid #d1d5db",
                background:
                  selectedWorkplace === "장사꾼" ? "#111827" : "#ffffff",
                color: selectedWorkplace === "장사꾼" ? "#ffffff" : "#111827",
                fontSize: "14px",
                fontWeight: 900,
                cursor: "pointer",
                boxShadow:
                  selectedWorkplace === "장사꾼"
                    ? "0 8px 18px rgba(17, 24, 39, 0.16)"
                    : "none",
              }}
            >
              장사꾼
            </button>

            <button
              type="button"
              onClick={() => handleChangeWorkplace("헤모즈")}
              style={{
                height: "40px",
                padding: "0 18px",
                borderRadius: "999px",
                border:
                  selectedWorkplace === "헤모즈"
                    ? "1px solid #111827"
                    : "1px solid #d1d5db",
                background:
                  selectedWorkplace === "헤모즈" ? "#111827" : "#ffffff",
                color: selectedWorkplace === "헤모즈" ? "#ffffff" : "#111827",
                fontSize: "14px",
                fontWeight: 900,
                cursor: "pointer",
                boxShadow:
                  selectedWorkplace === "헤모즈"
                    ? "0 8px 18px rgba(17, 24, 39, 0.16)"
                    : "none",
              }}
            >
              헤모즈
            </button>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: "38px",
              padding: "0 14px",
              borderRadius: "999px",
              background: selectedWorkplace === "헤모즈" ? "#fce7f3" : "#e0f2fe",
              color: selectedWorkplace === "헤모즈" ? "#be185d" : "#0369a1",
              fontSize: "13px",
              fontWeight: 900,
              whiteSpace: "nowrap",
            }}
          >
            현재 조회: {selectedWorkplace}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
            padding: "14px 16px",
            borderBottom: "1px solid #eef2f7",
          }}
        >
          <button
            type="button"
            onClick={() => handleChangeWeekMode("current")}
            style={{
              height: "40px",
              padding: "0 18px",
              borderRadius: "999px",
              border: weekMode === "current" ? "1px solid #111827" : "1px solid #d1d5db",
              background: weekMode === "current" ? "#111827" : "#ffffff",
              color: weekMode === "current" ? "#ffffff" : "#111827",
              fontSize: "14px",
              fontWeight: 900,
              cursor: "pointer",
              boxShadow:
                weekMode === "current"
                  ? "0 8px 18px rgba(17, 24, 39, 0.16)"
                  : "none",
            }}
          >
            이번 주
          </button>

          <button
            type="button"
            onClick={() => handleChangeWeekMode("next")}
            style={{
              height: "40px",
              padding: "0 18px",
              borderRadius: "999px",
              border: weekMode === "next" ? "1px solid #111827" : "1px solid #d1d5db",
              background: weekMode === "next" ? "#111827" : "#ffffff",
              color: weekMode === "next" ? "#ffffff" : "#111827",
              fontSize: "14px",
              fontWeight: 900,
              cursor: "pointer",
              boxShadow:
                weekMode === "next"
                  ? "0 8px 18px rgba(17, 24, 39, 0.16)"
                  : "none",
            }}
          >
            다음 주
          </button>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: "40px",
              padding: "0 14px",
              borderRadius: "999px",
              background: "#f3f4f6",
              color: "#374151",
              fontSize: "13px",
              fontWeight: 900,
              whiteSpace: "nowrap",
            }}
          >
            {getWeekTitle(weekMode)} {weekStartDate} ~ {weekEndDate}
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: "40px",
              padding: "0 12px",
              borderRadius: "999px",
              background: "#f9fafb",
              color: "#6b7280",
              fontSize: "13px",
              fontWeight: 700,
              marginLeft: "auto",
            }}
          >
            월요일 00시가 지나면 다음 주가 자동으로 이번 주로 롤링됩니다.
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

      {!loading && data && renderRoleWeekTable()}

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
              maxWidth: "560px",
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
                    display: "flex",
                    gap: "8px",
                    marginTop: "10px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleChangeWeekModeInModal("current")}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "999px",
                      border:
                        weekMode === "current" ? "none" : "1px solid #d1d5db",
                      background:
                        weekMode === "current" ? "#111827" : "#ffffff",
                      color: weekMode === "current" ? "#ffffff" : "#111827",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    이번 주
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChangeWeekModeInModal("next")}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "999px",
                      border:
                        weekMode === "next" ? "none" : "1px solid #d1d5db",
                      background: weekMode === "next" ? "#111827" : "#ffffff",
                      color: weekMode === "next" ? "#ffffff" : "#111827",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    다음 주
                  </button>
                </div>

                <div
                  style={{
                    marginTop: "6px",
                    color: "#6b7280",
                    fontSize: "13px",
                  }}
                >
                  {selectedEmployee.name}
                  {isCarrotEmployee(selectedEmployee)
                    ? " (당근)"
                    : selectedWorkplace === "헤모즈"
                    ? ""
                    : getEmployeeScheduleGroup(selectedEmployee)
                      ? ` (${getEmployeeScheduleGroup(selectedEmployee)})`
                      : " (역할 미지정)"}
                  {" · "}
                  {selectedWorkplace}
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
                {editSchedule.map((item, index) => {
                  const currentShift = getScheduleItemShift(item);

                  return (
                    <div
                      key={item.fullDate}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "70px 1fr 210px",
                        gap: "10px",
                        alignItems: "center",
                        padding: "14px",
                        borderBottom:
                          index === editSchedule.length - 1
                            ? "none"
                            : "1px solid #e5e7eb",
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

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          justifyContent: "flex-end",
                          flexWrap: "wrap",
                          color: item.available ? "#2563eb" : "#6b7280",
                          fontWeight: 800,
                          fontSize: "14px",
                        }}
                      >
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            cursor: "pointer",
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
                        </label>

                        {item.available && (
                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                            }}
                          >
                            {selectedWorkplace === "헤모즈" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => changeEditScheduleShift(item.fullDate, "open")}
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: "999px",
                                    border:
                                      currentShift === "open"
                                        ? "1px solid #7c3aed"
                                        : "1px solid #d1d5db",
                                    background:
                                      currentShift === "open" ? "#ede9fe" : "#ffffff",
                                    color:
                                      currentShift === "open" ? "#5b21b6" : "#374151",
                                    fontWeight: 900,
                                    cursor: "pointer",
                                  }}
                                >
                                  오픈
                                </button>

                                <button
                                  type="button"
                                  onClick={() => changeEditScheduleShift(item.fullDate, "day")}
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: "999px",
                                    border:
                                      currentShift === "day"
                                        ? "1px solid #2563eb"
                                        : "1px solid #d1d5db",
                                    background:
                                      currentShift === "day" ? "#dbeafe" : "#ffffff",
                                    color:
                                      currentShift === "day" ? "#1d4ed8" : "#374151",
                                    fontWeight: 900,
                                    cursor: "pointer",
                                  }}
                                >
                                  주간
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => changeEditScheduleShift(item.fullDate, "day")}
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: "999px",
                                    border:
                                      currentShift === "day"
                                        ? "1px solid #2563eb"
                                        : "1px solid #d1d5db",
                                    background:
                                      currentShift === "day" ? "#dbeafe" : "#ffffff",
                                    color:
                                      currentShift === "day" ? "#1d4ed8" : "#374151",
                                    fontWeight: 900,
                                    cursor: "pointer",
                                  }}
                                >
                                  주간
                                </button>

                                <button
                                  type="button"
                                  onClick={() => changeEditScheduleShift(item.fullDate, "night")}
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: "999px",
                                    border:
                                      currentShift === "night"
                                        ? "1px solid #6366f1"
                                        : "1px solid #d1d5db",
                                    background:
                                      currentShift === "night" ? "#e0e7ff" : "#ffffff",
                                    color:
                                      currentShift === "night" ? "#4338ca" : "#374151",
                                    fontWeight: 900,
                                    cursor: "pointer",
                                  }}
                                >
                                  야간
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                출근으로 체크한 날은 {selectedWorkplace === "헤모즈" ? "오픈/주간" : "주간/야간"}도 함께 선택해주세요.
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