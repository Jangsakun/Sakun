"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Employee = {
  id?: string;
  name: string;
  birthDate: string;
  phoneLast4: string;
};

type AttendanceResponse = {
  success: boolean;
  message: string;
  received?: {
    lat: number;
    lng: number;
    checkedAt: string;
    accuracy?: number;
  };
  distance?: number;
  accuracy?: number | null;
  normalizedCheckedAt?: string;
};

type TodayAttendanceResponse = {
  success: boolean;
  today?: {
    checkIn: string | null;
    checkOut: string | null;
    records: {
      id: number;
      record_type: string;
      checked_at: string;
      lat: number;
      lng: number;
    }[];
  };
  message?: string;
};

type ValidateEmployeeResponse = {
  success: boolean;
  exists: boolean;
  message?: string;
  employee?: {
    id?: string;
    name?: string;
  };
};

type DeviceStatusResponse = {
  success: boolean;
  exists: boolean;
  message?: string;
  employee?: {
    id?: string;
    name?: string;
    birthDate?: string;
    phoneLast4?: string;
  };
};

type CheckoutAvailability = {
  enabled: boolean;
  notice: string;
  nextAvailableLabel: string;
};

type TodayRecord = {
  id: number;
  record_type: string;
  checked_at: string;
  lat: number;
  lng: number;
};

type ScheduleStatus = "pending" | "submitted";

type HolidayItem = {
  date: string;
  localName?: string;
  name?: string;
};

type ShiftType = "day" | "night";

type WeeklyScheduleInput = {
  key: string;
  dayLabel: string;
  dateLabel: string;
  fullDate: string;
  isHoliday: boolean;
  holidayName: string;
  available: boolean;
  shift: ShiftType | null;
};

type SubmittedScheduleDay = {
  dayLabel?: string;
  dateLabel?: string;
  fullDate?: string;
  available?: boolean;
  shift?: ShiftType | null;
  shiftType?: ShiftType | null;
  shiftLabel?: string;
};

type WeeklyScheduleStatusResponse = {
  success: boolean;
  submitted: boolean;
  message?: string;
  schedule?: {
    id?: string;
    employee_id?: string | null;
    name?: string;
    birth_date?: string;
    phone_last4?: string;
    week_start_date?: string;
    week_end_date?: string;
    schedule?: SubmittedScheduleDay[];
  } | null;
};

type WorkerContract = {
  id: number | string;
  employee_id?: number | string | null;
  contract_type?: string | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  content_html: string;
  signature_employee?: string | null;
  signed_at_employee?: string | null;
  status: "draft" | "pending" | "signed" | string;
};

type WorkerContractResponse = {
  success: boolean;
  message?: string;
  contract?: WorkerContract | null;
};

type SignContractResponse = {
  success: boolean;
  message?: string;
  contract?: WorkerContract | null;
};

function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem("device_id");

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("device_id", deviceId);
  }

  return deviceId;
}

function getKstParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = formatter.formatToParts(date);

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value || "00";

  return {
    year: Number(getPart("year")),
    month: Number(getPart("month")),
    day: Number(getPart("day")),
    hour: Number(getPart("hour")),
    minute: Number(getPart("minute")),
  };
}

function formatTimeLabel(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getCheckoutAvailability(date = new Date()): CheckoutAvailability {
  const { hour, minute } = getKstParts(date);

  if (hour < 18) {
    return {
      enabled: true,
      notice: "18시 이후 퇴근은 30분 단위로 10분 동안만 가능합니다.",
      nextAvailableLabel: "",
    };
  }

  const isOpenWindow =
    (minute >= 0 && minute <= 10) || (minute >= 30 && minute <= 40);

  if (isOpenWindow) {
    return {
      enabled: true,
      notice: "지금은 퇴근 가능한 시간입니다.",
      nextAvailableLabel: "",
    };
  }

  let nextHour = hour;
  let nextMinute = 0;

  if (minute >= 11 && minute <= 29) {
    nextMinute = 30;
  } else if (minute >= 41) {
    nextHour = hour + 1;
    nextMinute = 0;
  }

  return {
    enabled: false,
    notice: "18시 이후 퇴근은 30분 단위로 10분 동안만 가능합니다.",
    nextAvailableLabel: formatTimeLabel(nextHour, nextMinute),
  };
}

function getSeoulDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getSeoulHourMinute(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  const hhmm = date.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const [hourText, minuteText] = hhmm.split(":");

  return {
    hour: Number(hourText),
    minute: Number(minuteText),
    totalMinutes: Number(hourText) * 60 + Number(minuteText),
  };
}

function createSeoulDateTime(dateKey: string, hour: number, minute: number) {
  return new Date(
    `${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0"
    )}:00+09:00`
  );
}

function isCheckInType(value: string) {
  const normalized = String(value || "").toLowerCase().trim();
  return (
    normalized === "check_in" ||
    normalized === "checkin" ||
    normalized === "in" ||
    normalized === "출근"
  );
}

function isCheckOutType(value: string) {
  const normalized = String(value || "").toLowerCase().trim();
  return (
    normalized === "check_out" ||
    normalized === "checkout" ||
    normalized === "out" ||
    normalized === "퇴근"
  );
}

function normalizeDisplayCheckIn(value: string) {
  const source = new Date(value);
  const dateKey = getSeoulDateKey(source);
  const { totalMinutes } = getSeoulHourMinute(source);

  const start0900Window = 8 * 60 + 45;
  const end0910Window = 9 * 60 + 10;
  const start0930Window = 9 * 60 + 11;
  const end0930Window = 9 * 60 + 30;

  if (totalMinutes >= start0900Window && totalMinutes <= end0910Window) {
    return createSeoulDateTime(dateKey, 9, 0);
  }

  if (totalMinutes >= start0930Window && totalMinutes <= end0930Window) {
    return createSeoulDateTime(dateKey, 9, 30);
  }

  return source;
}

function normalizeDisplayCheckOut(value: string) {
  const source = new Date(value);
  const dateKey = getSeoulDateKey(source);
  const { hour, minute } = getSeoulHourMinute(source);

  if (hour >= 18) {
    if (minute <= 10) {
      return createSeoulDateTime(dateKey, hour, 0);
    }

    if (minute <= 40) {
      return createSeoulDateTime(dateKey, hour, 30);
    }

    return createSeoulDateTime(dateKey, hour + 1, 0);
  }

  return source;
}

function formatDisplayAttendanceTime(
  value: string,
  recordType: string,
  shouldNormalize = true
) {
  const normalizedDate = shouldNormalize
    ? isCheckInType(recordType)
      ? normalizeDisplayCheckIn(value)
      : isCheckOutType(recordType)
      ? normalizeDisplayCheckOut(value)
      : new Date(value)
    : new Date(value);

  return normalizedDate.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });
}

function formatOnlyTime(value: string, recordType: string) {
  const normalizedDate = isCheckInType(recordType)
    ? normalizeDisplayCheckIn(value)
    : isCheckOutType(recordType)
    ? normalizeDisplayCheckOut(value)
    : new Date(value);

  return normalizedDate.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatMinutesToKorean(totalMinutes: number) {
  if (totalMinutes <= 0) return "0분";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}시간 ${minutes}분`;
  }

  if (hours > 0) {
    return `${hours}시간`;
  }

  return `${minutes}분`;
}

function getScheduleTargetMondayInKst() {
  const now = new Date();
  const seoulNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );

  const day = seoulNow.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const shouldUseNextWeek = day === 0 || day >= 4;
  const addWeekDays = shouldUseNextWeek ? 7 : 0;

  seoulNow.setHours(0, 0, 0, 0);
  seoulNow.setDate(seoulNow.getDate() + diffToMonday + addWeekDays);

  return seoulNow;
}

function getScheduleWeekTitleInKst() {
  const now = new Date();
  const seoulNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );

  const day = seoulNow.getDay();
  const shouldUseNextWeek = day === 0 || day >= 4;

  return shouldUseNextWeek ? "다음 주" : "이번 주";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatShortDate(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}.${d}`;
}

function getKoreanDayLabel(date: Date) {
  const labels = ["일", "월", "화", "수", "목", "금", "토"];
  return labels[date.getDay()];
}

function formatWeekRangeLabel(startDate: Date, endDate: Date) {
  const startYear = startDate.getFullYear();
  const startMonth = String(startDate.getMonth() + 1).padStart(2, "0");
  const startDay = String(startDate.getDate()).padStart(2, "0");
  const endMonth = String(endDate.getMonth() + 1).padStart(2, "0");
  const endDay = String(endDate.getDate()).padStart(2, "0");

  return `${startYear}.${startMonth}.${startDay} (${getKoreanDayLabel(
    startDate
  )}) ~ ${endMonth}.${endDay} (${getKoreanDayLabel(endDate)})`;
}

function createWeekdaysWithHolidayInfo(holidays: HolidayItem[]) {
  const monday = getScheduleTargetMondayInKst();
  const weekdays = [0, 1, 2, 3, 4].map((offset) => addDays(monday, offset));

  return weekdays.map((date, index) => {
    const fullDate = formatDateKey(date);
    const matchedHoliday = holidays.find((holiday) => holiday.date === fullDate);

    return {
      key: `weekday-${index}`,
      dayLabel: getKoreanDayLabel(date),
      dateLabel: formatShortDate(date),
      fullDate,
      isHoliday: Boolean(matchedHoliday),
      holidayName: matchedHoliday?.localName || matchedHoliday?.name || "",
      available: false,
      shift: null,
    };
  });
}

function applySubmittedScheduleToWeek(
  baseWeek: WeeklyScheduleInput[],
  submittedDays?: SubmittedScheduleDay[]
) {
  if (!Array.isArray(submittedDays) || submittedDays.length === 0) {
    return baseWeek;
  }

  return baseWeek.map((day) => {
    if (day.isHoliday) {
      return day;
    }

    const matched = submittedDays.find(
      (item) => item.fullDate === day.fullDate && item.available
    );

    const submittedShift =
      matched?.shift === "night" || matched?.shiftType === "night"
        ? "night"
        : matched?.shift === "day" || matched?.shiftType === "day"
        ? "day"
        : null;

    return {
      ...day,
      available: Boolean(matched),
      shift: matched ? submittedShift || "day" : null,
    };
  });
}

export default function Home() {
  const router = useRouter();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [todayRecords, setTodayRecords] = useState<TodayRecord[]>([]);
  const [now, setNow] = useState(new Date());

  const [scheduleStatus, setScheduleStatus] =
    useState<ScheduleStatus>("pending");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [isScheduleSaving, setIsScheduleSaving] = useState(false);
  const [isScheduleChecking, setIsScheduleChecking] = useState(false);
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklyScheduleInput[]>([]);
  const [weekRangeLabel, setWeekRangeLabel] = useState("");
  const [weekStartDate, setWeekStartDate] = useState("");
  const [weekEndDate, setWeekEndDate] = useState("");
  const [isHolidayLoading, setIsHolidayLoading] = useState(true);

  const [workerContract, setWorkerContract] = useState<WorkerContract | null>(
    null
  );
  const [isContractLoading, setIsContractLoading] = useState(false);
  const [isContractOpen, setIsContractOpen] = useState(false);
  const [contractAgree, setContractAgree] = useState(false);
  const [isSigningContract, setIsSigningContract] = useState(false);
  const [signatureTouched, setSignatureTouched] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingSignatureRef = useRef(false);

  const scheduleWeekTitle = useMemo(() => getScheduleWeekTitleInKst(), []);

  const clearEmployeeStorage = () => {
    localStorage.removeItem("employee");
  };

  const getCanvasPosition = (event: React.MouseEvent | React.TouchEvent) => {
    const canvas = signatureCanvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const clientX =
      "touches" in event
        ? event.touches[0]?.clientX ?? event.changedTouches[0]?.clientX
        : event.clientX;
    const clientY =
      "touches" in event
        ? event.touches[0]?.clientY ?? event.changedTouches[0]?.clientY
        : event.clientY;

    if (typeof clientX !== "number" || typeof clientY !== "number") {
      return null;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startSignatureDrawing = (event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();

    const canvas = signatureCanvasRef.current;
    const position = getCanvasPosition(event);

    if (!canvas || !position) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    isDrawingSignatureRef.current = true;
    setSignatureTouched(true);

    context.beginPath();
    context.moveTo(position.x, position.y);
  };

  const drawSignature = (event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();

    if (!isDrawingSignatureRef.current) {
      return;
    }

    const canvas = signatureCanvasRef.current;
    const position = getCanvasPosition(event);

    if (!canvas || !position) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111827";
    context.lineTo(position.x, position.y);
    context.stroke();
  };

  const stopSignatureDrawing = () => {
    isDrawingSignatureRef.current = false;

    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");

    if (context) {
      context.beginPath();
    }
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureTouched(false);
  };

  const fetchWorkerContract = async (currentEmployee: Employee) => {
    if (!currentEmployee?.id) {
      console.warn("근로계약서 조회 실패: employee.id가 없습니다.", currentEmployee);
      setWorkerContract(null);
      setIsContractOpen(false);
      return;
    }

    try {
      setIsContractLoading(true);

      console.log("근로계약서 조회 employeeId:", currentEmployee.id);

      const response = await fetch(
        `/api/worker/contracts?employeeId=${currentEmployee.id}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data: WorkerContractResponse = await response.json();

      console.log("근로계약서 조회 응답:", data);

      if (data.success && data.contract) {
        setWorkerContract(data.contract);
        setIsContractOpen(data.contract.status === "pending");
      } else {
        setWorkerContract(null);
        setIsContractOpen(false);
      }
    } catch (error) {
      console.error("근로계약서 조회 실패:", error);
      setWorkerContract(null);
      setIsContractOpen(false);
    } finally {
      setIsContractLoading(false);
    }
  };

  const handleSignContract = async () => {
    if (!employee || !workerContract) {
      alert("서명할 계약서가 없습니다.");
      return;
    }

    if (!contractAgree) {
      alert("계약 내용을 확인하고 동의 체크를 해주세요.");
      return;
    }

    if (!signatureTouched) {
      alert("서명란에 직접 서명해주세요.");
      return;
    }

    const canvas = signatureCanvasRef.current;

    if (!canvas) {
      alert("서명 정보를 찾을 수 없습니다.");
      return;
    }

    try {
      setIsSigningContract(true);

      const signatureImage = canvas.toDataURL("image/png");

      const response = await fetch("/api/worker/contracts/sign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contractId: workerContract.id,
          employeeId: employee.id,
          name: employee.name,
          birthDate: employee.birthDate,
          phoneLast4: employee.phoneLast4,
          signature: signatureImage,
          signatureEmployee: signatureImage,
        }),
      });

      const data: SignContractResponse = await response.json();

      if (!data.success) {
        alert(data.message || "계약서 서명 저장에 실패했습니다.");
        return;
      }

      setMessage("근로계약서 서명이 완료되었습니다.");
      setContractAgree(false);
      clearSignature();
      await fetchWorkerContract(employee);
    } catch (error) {
      console.error("근로계약서 서명 실패:", error);
      alert("계약서 서명 중 오류가 발생했습니다.");
    } finally {
      setIsSigningContract(false);
    }
  };

  const fetchTodayAttendance = async (currentEmployee: Employee) => {
    try {
      const response = await fetch("/api/attendance/today", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: currentEmployee.name,
          birthDate: currentEmployee.birthDate,
          phoneLast4: currentEmployee.phoneLast4,
        }),
      });

      const data: TodayAttendanceResponse = await response.json();

      if (data.success && data.today) {
        setTodayRecords(data.today.records || []);
      }
    } catch (error) {
      console.error("오늘 기록 불러오기 실패:", error);
    }
  };

  const checkScheduleSubmitted = async (
    currentEmployee: Employee,
    currentWeekStartDate: string,
    currentWeekEndDate: string,
    currentWeeklySchedule?: WeeklyScheduleInput[]
  ) => {
    if (
      !currentEmployee.name ||
      !currentEmployee.birthDate ||
      !currentEmployee.phoneLast4 ||
      !currentWeekStartDate ||
      !currentWeekEndDate
    ) {
      return;
    }

    try {
      setIsScheduleChecking(true);

      const params = new URLSearchParams({
        name: String(currentEmployee.name).trim(),
        birthDate: String(currentEmployee.birthDate).trim(),
        phoneLast4: String(currentEmployee.phoneLast4).trim(),
        weekStartDate: String(currentWeekStartDate).trim(),
        weekEndDate: String(currentWeekEndDate).trim(),
      });

      const response = await fetch(
        `/api/worker/schedule/status?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data: WeeklyScheduleStatusResponse = await response.json();

      if (!data.success) {
        setScheduleStatus("pending");
        return;
      }

      if (data.submitted) {
        setScheduleStatus("submitted");
        setScheduleOpen(false);

        if (Array.isArray(currentWeeklySchedule) && currentWeeklySchedule.length) {
          const submittedDays: SubmittedScheduleDay[] = Array.isArray(
            data.schedule?.schedule
          )
            ? data.schedule.schedule
            : [];

          const mergedSchedule: WeeklyScheduleInput[] = currentWeeklySchedule.map(
            (day) => {
              if (day.isHoliday) {
                return day;
              }

              const matched = submittedDays.find(
                (item) => item.fullDate === day.fullDate && item.available
              );

              const submittedShift: ShiftType | null =
                matched?.shift === "night" || matched?.shiftType === "night"
                  ? "night"
                  : matched?.shift === "day" || matched?.shiftType === "day"
                  ? "day"
                  : null;

              return {
                ...day,
                available: Boolean(matched),
                shift: matched ? submittedShift || "day" : null,
              };
            }
          );

          setWeeklySchedule(mergedSchedule);
        }
      } else {
        setScheduleStatus("pending");

        if (Array.isArray(currentWeeklySchedule) && currentWeeklySchedule.length) {
          setWeeklySchedule(currentWeeklySchedule);
        }
      }
    } catch (error) {
      console.error("스케줄 제출 여부 조회 실패:", error);
      setScheduleStatus("pending");
    } finally {
      setIsScheduleChecking(false);
    }
  };

  useEffect(() => {
    const initializeEmployee = async () => {
      const deviceId = getOrCreateDeviceId();

      try {
        const deviceResponse = await fetch("/api/device/status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            deviceId,
          }),
        });

        const deviceData: DeviceStatusResponse = await deviceResponse.json();

        if (
          deviceData.success &&
          deviceData.exists &&
          deviceData.employee?.name &&
          deviceData.employee?.birthDate &&
          deviceData.employee?.phoneLast4
        ) {
          const connectedEmployee: Employee = {
            id: deviceData.employee.id,
            name: deviceData.employee.name,
            birthDate: deviceData.employee.birthDate,
            phoneLast4: deviceData.employee.phoneLast4,
          };

          localStorage.setItem("employee", JSON.stringify(connectedEmployee));
          setEmployee(connectedEmployee);
          fetchTodayAttendance(connectedEmployee);
          fetchWorkerContract(connectedEmployee);
          return;
        }

        clearEmployeeStorage();
        router.push("/register-device");
      } catch (error) {
        console.error("device status 확인 에러:", error);
        clearEmployeeStorage();
        router.push("/register-device");
      }
    };

    initializeEmployee();
  }, [router]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadWeekAndHolidays = async () => {
      try {
        setIsHolidayLoading(true);

        const monday = getScheduleTargetMondayInKst();
        const friday = addDays(monday, 4);
        const years = Array.from(
          new Set([monday.getFullYear(), friday.getFullYear()])
        );

        const holidayResults = await Promise.all(
          years.map(async (year) => {
            const response = await fetch(
              `https://date.nager.at/api/v3/PublicHolidays/${year}/KR`,
              {
                cache: "no-store",
              }
            );

            if (!response.ok) {
              throw new Error("공휴일 데이터를 불러오지 못했습니다.");
            }

            return (await response.json()) as HolidayItem[];
          })
        );

        const holidays = holidayResults.flat();
        const nextWeeklySchedule = createWeekdaysWithHolidayInfo(holidays);
        const nextWeekStartDate = formatDateKey(monday);
        const nextWeekEndDate = formatDateKey(friday);
        const nextWeekRangeLabel = formatWeekRangeLabel(monday, friday);

        setWeeklySchedule(nextWeeklySchedule);
        setWeekStartDate(nextWeekStartDate);
        setWeekEndDate(nextWeekEndDate);
        setWeekRangeLabel(nextWeekRangeLabel);

        if (employee) {
          await checkScheduleSubmitted(
            employee,
            nextWeekStartDate,
            nextWeekEndDate,
            nextWeeklySchedule
          );
        }
      } catch (error) {
        console.error("공휴일/주간 일정 생성 실패:", error);

        const monday = getScheduleTargetMondayInKst();
        const friday = addDays(monday, 4);
        const fallbackWeek = [0, 1, 2, 3, 4].map((offset, index) => {
          const date = addDays(monday, offset);

          return {
            key: `weekday-${index}`,
            dayLabel: getKoreanDayLabel(date),
            dateLabel: formatShortDate(date),
            fullDate: formatDateKey(date),
            isHoliday: false,
            holidayName: "",
            available: false,
            shift: null,
          };
        });

        const nextWeekStartDate = formatDateKey(monday);
        const nextWeekEndDate = formatDateKey(friday);
        const nextWeekRangeLabel = formatWeekRangeLabel(monday, friday);

        setWeeklySchedule(fallbackWeek);
        setWeekStartDate(nextWeekStartDate);
        setWeekEndDate(nextWeekEndDate);
        setWeekRangeLabel(nextWeekRangeLabel);

        if (employee) {
          await checkScheduleSubmitted(
            employee,
            nextWeekStartDate,
            nextWeekEndDate,
            fallbackWeek
          );
        }
      } finally {
        setIsHolidayLoading(false);
      }
    };

    loadWeekAndHolidays();
  }, [employee]);

  const checkoutAvailability = useMemo(() => {
    return getCheckoutAvailability(now);
  }, [now]);

  const todaySummary = useMemo(() => {
    if (todayRecords.length === 0) {
      return {
        checkIn: "",
        checkOut: "",
        totalWorkMinutes: 0,
      };
    }

    const sortedRecords = [...todayRecords].sort(
      (a, b) =>
        new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
    );

    const firstCheckIn = sortedRecords.find((record) =>
      isCheckInType(record.record_type)
    );
    const lastCheckOut = [...sortedRecords]
      .reverse()
      .find((record) => isCheckOutType(record.record_type));

    let totalWorkMinutes = 0;

    if (firstCheckIn && lastCheckOut) {
      const checkInDate = normalizeDisplayCheckIn(firstCheckIn.checked_at);
      const checkOutDate = normalizeDisplayCheckOut(lastCheckOut.checked_at);

      const diff = Math.max(
        0,
        Math.floor(
          (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60)
        )
      );

      totalWorkMinutes = diff;
    }

    return {
      checkIn: firstCheckIn
        ? formatOnlyTime(firstCheckIn.checked_at, firstCheckIn.record_type)
        : "",
      checkOut: lastCheckOut
        ? formatOnlyTime(lastCheckOut.checked_at, lastCheckOut.record_type)
        : "",
      totalWorkMinutes,
    };
  }, [todayRecords]);

  const selectedScheduleCount = useMemo(() => {
    return weeklySchedule.filter((day) => !day.isHoliday && day.available).length;
  }, [weeklySchedule]);

  const selectedNightScheduleCount = useMemo(() => {
    return weeklySchedule.filter(
      (day) => !day.isHoliday && day.available && day.shift === "night"
    ).length;
  }, [weeklySchedule]);

  const sendAttendance = async (type: "check-in" | "check-out") => {
    if (!employee) {
      alert("직원 정보가 없습니다. 다시 등록해주세요.");
      clearEmployeeStorage();
      router.push("/register-device");
      return;
    }

    if (workerContract?.status === "pending") {
      alert("근로계약서 확인 및 서명을 먼저 완료해주세요.");
      setIsContractOpen(true);
      setMessage("근로계약서 서명이 필요합니다.");
      return;
    }

    if (type === "check-out" && !checkoutAvailability.enabled) {
      const blockedMessage = checkoutAvailability.nextAvailableLabel
        ? `지금은 퇴근 가능한 시간이 아닙니다. 다음 퇴근 가능 시간: ${checkoutAvailability.nextAvailableLabel}`
        : "지금은 퇴근 가능한 시간이 아닙니다.";

      alert(blockedMessage);
      setMessage(blockedMessage);
      return;
    }

    if (!navigator.geolocation) {
      alert("GPS를 지원하지 않는 브라우저입니다.");
      return;
    }

    setIsLoading(true);
    setMessage(type === "check-in" ? "출근 처리 중..." : "퇴근 처리 중...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        const checkedAt = new Date().toISOString();

        try {
          const validateResponse = await fetch("/api/auth/validate-employee", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            cache: "no-store",
            body: JSON.stringify({
              name: employee.name,
              birthDate: employee.birthDate,
              phoneLast4: employee.phoneLast4,
            }),
          });

          const validateData: ValidateEmployeeResponse =
            await validateResponse.json();

          if (!validateData.success || !validateData.exists) {
            clearEmployeeStorage();
            alert("등록된 직원 정보가 삭제되어 다시 등록이 필요합니다.");
            setMessage("등록 정보가 없어 다시 등록이 필요합니다.");
            setIsLoading(false);
            router.push("/register-device");
            return;
          }

          const response = await fetch(`/api/attendance/${type}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: employee.name,
              birthDate: employee.birthDate,
              phoneLast4: employee.phoneLast4,
              lat,
              lng,
              accuracy,
              checkedAt,
            }),
          });

          const data: AttendanceResponse = await response.json();

          if (data.success) {
            if (type === "check-in") {
              setMessage(data.message || "출근이 정상 처리되었습니다.");
            } else {
              setMessage(data.message || "퇴근이 정상 처리되었습니다.");
            }

            fetchTodayAttendance(employee);
          } else {
            setMessage(data.message || "기록 전송에 실패했습니다.");
          }
        } catch (error) {
          console.error(error);
          setMessage("서버 요청 중 오류가 발생했습니다.");
        } finally {
          setIsLoading(false);
        }
      },
      (error) => {
        console.error("geolocation error:", error);

        let errorMessage = "위치를 가져오지 못했습니다.";

        if (error.code === error.PERMISSION_DENIED) {
          errorMessage = "위치 권한이 거부되었습니다.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMessage = "현재 위치를 확인할 수 없습니다.";
        } else if (error.code === error.TIMEOUT) {
          errorMessage = "위치 요청 시간이 초과되었습니다.";
        }

        alert(errorMessage);
        setMessage(errorMessage);
        setIsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const handleToggleScheduleAvailable = (key: string) => {
    if (scheduleStatus === "submitted") return;

    setWeeklySchedule((prev) =>
      prev.map((day) => {
        if (day.key !== key || day.isHoliday) return day;

        const nextAvailable = !day.available;

        return {
          ...day,
          available: nextAvailable,
          shift: nextAvailable ? day.shift || "day" : null,
        };
      })
    );
  };

  const handleShiftChange = (key: string, shift: ShiftType) => {
    if (scheduleStatus === "submitted") return;

    setWeeklySchedule((prev) =>
      prev.map((day) => {
        if (day.key !== key || day.isHoliday || !day.available) return day;

        return {
          ...day,
          shift,
        };
      })
    );
  };

  const handleSubmitSchedule = async () => {
    if (!employee) return;

    if (scheduleStatus === "submitted") {
      return;
    }

    const activeDays = weeklySchedule
      .filter((day) => !day.isHoliday && day.available)
      .map((day) => ({
        dayLabel: day.dayLabel,
        dateLabel: day.dateLabel,
        fullDate: day.fullDate,
        available: true,
        shift: day.shift || "day",
        shiftType: day.shift || "day",
        shiftLabel: day.shift === "night" ? "야간" : "주간",
      }));

    if (activeDays.length === 0) {
      alert("최소 1일 이상 출근 가능으로 선택해주세요.");
      return;
    }

    try {
      setIsScheduleSaving(true);

      const response = await fetch("/api/worker/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: employee.name,
          birthDate: employee.birthDate,
          phoneLast4: employee.phoneLast4,
          weekStartDate,
          weekEndDate,
          schedule: activeDays,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.message || "스케줄 제출에 실패했습니다.");
        return;
      }

      setScheduleStatus("submitted");
      setScheduleOpen(false);
      setMessage(`${scheduleWeekTitle} 스케줄 제출이 완료되었습니다.`);

      await checkScheduleSubmitted(
        employee,
        weekStartDate,
        weekEndDate,
        weeklySchedule
      );
    } catch (error) {
      console.error(error);
      alert("스케줄 제출 중 오류가 발생했습니다.");
    } finally {
      setIsScheduleSaving(false);
    }
  };

  if (!employee) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>불러오는 중...</div>
      </main>
    );
  }

  const isSchedulePending = scheduleStatus === "pending";

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <div style={{ marginBottom: "24px" }}>
          <h1 style={titleStyle}>통합 관리 시스템</h1>
          <p style={subtitleStyle}>
            <strong>{employee.name}</strong>님, 오늘도 좋은 하루 되세요.
          </p>
        </div>

        {isContractLoading && (
          <div style={contractLoadingCardStyle}>근로계약서 확인 중...</div>
        )}

        {workerContract && (
          <div
            style={
              workerContract.status === "pending"
                ? contractPendingCardStyle
                : contractSignedCardStyle
            }
          >
            <div style={contractHeaderRowStyle}>
              <div style={contractTitleWrapStyle}>
                <div
                  style={
                    workerContract.status === "pending"
                      ? contractPendingIconStyle
                      : contractSignedIconStyle
                  }
                >
                  ✍️
                </div>
                <div>
                  <div style={contractTitleStyle}>근로계약서</div>
                  <div style={contractSubTitleStyle}>
                    {workerContract.contract_type === "freelance_11"
                      ? "11개월 용역계약서"
                      : "일용직 7일 근로계약서"}
                    {workerContract.contract_start_date &&
                    workerContract.contract_end_date
                      ? ` · ${workerContract.contract_start_date} ~ ${workerContract.contract_end_date}`
                      : ""}
                  </div>
                </div>
              </div>

              <div
                style={
                  workerContract.status === "pending"
                    ? contractPendingBadgeStyle
                    : contractSignedBadgeStyle
                }
              >
                {workerContract.status === "pending" ? "서명 필요" : "서명 완료"}
              </div>
            </div>

            <div style={contractInfoTextStyle}>
              {workerContract.status === "pending"
                ? "근로계약서 내용을 확인하고 서명을 완료해야 출퇴근 기능을 사용할 수 있습니다."
                : "서명이 완료된 계약서입니다."}
            </div>

            <button
              type="button"
              onClick={() => setIsContractOpen((prev) => !prev)}
              style={
                workerContract.status === "pending"
                  ? contractOpenPendingButtonStyle
                  : contractOpenSignedButtonStyle
              }
            >
              {isContractOpen ? "계약서 접기" : "계약서 확인하기"}
            </button>

            {isContractOpen && (
              <div style={contractViewerWrapStyle}>
                <div
                  style={contractHtmlBoxStyle}
                  dangerouslySetInnerHTML={{
                    __html: workerContract.content_html || "",
                  }}
                />

                {workerContract.status === "pending" && (
                  <div style={signatureBoxStyle}>
                    <label style={contractAgreeLabelStyle}>
                      <input
                        type="checkbox"
                        checked={contractAgree}
                        onChange={(event) =>
                          setContractAgree(event.target.checked)
                        }
                      />
                      <span>
                        위 근로계약서 내용을 모두 확인하였고 이에 동의합니다.
                      </span>
                    </label>

                    <div style={signatureGuideStyle}>
                      아래 서명란에 손가락으로 직접 서명해주세요.
                    </div>

                    <canvas
                      ref={signatureCanvasRef}
                      width={900}
                      height={260}
                      style={signatureCanvasStyle}
                      onMouseDown={startSignatureDrawing}
                      onMouseMove={drawSignature}
                      onMouseUp={stopSignatureDrawing}
                      onMouseLeave={stopSignatureDrawing}
                      onTouchStart={startSignatureDrawing}
                      onTouchMove={drawSignature}
                      onTouchEnd={stopSignatureDrawing}
                    />

                    <div style={signatureButtonRowStyle}>
                      <button
                        type="button"
                        onClick={clearSignature}
                        style={signatureClearButtonStyle}
                      >
                        서명 지우기
                      </button>

                      <button
                        type="button"
                        onClick={handleSignContract}
                        disabled={isSigningContract}
                        style={{
                          ...signatureSubmitButtonStyle,
                          opacity: isSigningContract ? 0.7 : 1,
                          cursor: isSigningContract
                            ? "not-allowed"
                            : "pointer",
                        }}
                      >
                        {isSigningContract ? "서명 저장 중..." : "서명 완료"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={buttonRowStyle}>
          <button
            onClick={() => sendAttendance("check-in")}
            disabled={isLoading}
            style={{
              ...primaryButtonStyle,
              opacity: isLoading ? 0.6 : 1,
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            {isLoading ? "처리 중..." : "출근하기"}
          </button>

          <button
            onClick={() => sendAttendance("check-out")}
            disabled={isLoading || !checkoutAvailability.enabled}
            style={{
              ...secondaryButtonStyle,
              opacity: isLoading || !checkoutAvailability.enabled ? 0.6 : 1,
              cursor:
                isLoading || !checkoutAvailability.enabled
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {isLoading ? "처리 중..." : "퇴근하기"}
          </button>
        </div>

        <div style={noticeBoxStyle}>
          <div style={noticeTitleStyle}>퇴근 안내</div>
          <div style={noticeTextStyle}>
            {checkoutAvailability.notice}
            <br />
            18시 이전 퇴근은 관리자에게 문의 바랍니다.
            {!checkoutAvailability.enabled &&
              checkoutAvailability.nextAvailableLabel && (
                <>
                  <br />
                  다음 퇴근 가능 시간:{" "}
                  <strong>{checkoutAvailability.nextAvailableLabel}</strong>
                </>
              )}
          </div>
        </div>

        <Link href="/worker/payroll" style={payrollLinkStyle}>
          <div style={payrollIconStyle}>💰</div>
          <div>
            <div style={payrollTitleStyle}>근로자 급여조회</div>
            <div style={payrollDescStyle}>
              실시간 주단위 급여 / 날짜별 조회 / 주급 명세서 확인
            </div>
          </div>
        </Link>

        <div style={statusBoxStyle}>
          <div style={statusHeaderStyle}>현재 상태</div>
          <p style={statusTextStyle}>{message || "대기 중"}</p>
        </div>

        <div style={todaySummarySectionStyle}>
          <div style={todaySummaryHeaderStyle}>
            <div style={todaySummaryTitleWrapStyle}>
              <div style={todaySummaryIconStyle}>🗓️</div>
              <div style={todaySummaryTitleStyle}>오늘 기록</div>
            </div>
          </div>

          {todayRecords.length === 0 ? (
            <div style={todaySummaryEmptyStyle}>오늘 기록이 없습니다.</div>
          ) : (
            <div style={todaySummaryGridStyle}>
              <div style={todaySummaryItemStyle}>
                <div style={todaySummaryLabelStyle}>출근 시간</div>
                <div style={todaySummaryValueStyle}>
                  {todaySummary.checkIn || "-"}
                </div>
                <div style={todaySummaryPillStyle}>출근 완료</div>
              </div>

              <div style={todaySummaryDividerStyle} />

              <div style={todaySummaryItemStyle}>
                <div style={todaySummaryLabelStyle}>퇴근 시간</div>
                <div style={todaySummaryValueStyle}>
                  {todaySummary.checkOut || "-"}
                </div>
                <div style={todaySummaryPillStyle}>
                  {todaySummary.checkOut ? "퇴근 완료" : "퇴근 전"}
                </div>
              </div>

              <div style={todaySummaryDividerStyle} />

              <div style={todaySummaryItemStyle}>
                <div style={todaySummaryLabelStyle}>총 근무시간</div>
                <div style={todaySummaryValueStyle}>
                  {todaySummary.totalWorkMinutes > 0
                    ? formatMinutesToKorean(todaySummary.totalWorkMinutes)
                    : "-"}
                </div>
              </div>
            </div>
          )}
        </div>
        <div
          style={
            isSchedulePending ? schedulePendingCardStyle : scheduleDoneCardStyle
          }
        >
          <div style={scheduleHeaderRowStyle}>
            <div style={scheduleTitleWrapStyle}>
              <div
                style={
                  isSchedulePending
                    ? schedulePendingIconStyle
                    : scheduleDoneIconStyle
                }
              >
                📅
              </div>
              <div>
                <div style={scheduleTitleStyle}>{scheduleWeekTitle} 스케줄</div>
                <div style={scheduleDateStyle}>
                  {isHolidayLoading ? "주간 일정 불러오는 중..." : weekRangeLabel}
                </div>
              </div>
            </div>

            <div
              style={
                isSchedulePending
                  ? schedulePendingBadgeStyle
                  : scheduleDoneBadgeStyle
              }
            >
              {isScheduleChecking
                ? "확인 중"
                : isSchedulePending
                ? "미제출"
                : "제출 완료"}
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <div style={scheduleMainTextStyle}>
              {isScheduleChecking
                ? "제출 여부를 확인하고 있습니다."
                : isSchedulePending
                ? `${scheduleWeekTitle} 스케줄이 아직 제출되지 않았습니다.`
                : "스케줄 제출이 완료되었습니다."}
            </div>
            <div style={scheduleSubTextStyle}>
              {isScheduleChecking
                ? "잠시만 기다려주세요."
                : isSchedulePending
                ? "아래에서 출근 가능 요일과 주간/야간을 선택 후 제출해주세요."
                : "한 번 제출한 뒤에는 관리자만 수정할 수 있습니다."}
            </div>
          </div>

          <div style={scheduleMiniDayRowStyle}>
            {weeklySchedule.map((day) => (
              <div key={day.key} style={scheduleMiniDayCardStyle}>
                <div style={scheduleMiniDayLabelStyle}>{day.dayLabel}</div>
                <div style={scheduleMiniDayDateStyle}>{day.dateLabel}</div>
                <div
                  style={
                    day.isHoliday
                      ? scheduleHolidayStatusStyle
                      : day.available
                      ? isSchedulePending
                        ? schedulePendingDotStyle
                        : scheduleDoneDotStyle
                      : scheduleMiniEmptyDotStyle
                  }
                >
                  {day.isHoliday
                    ? "공휴일"
                    : day.available
                    ? day.shift === "night"
                      ? "야간"
                      : "주간"
                    : "•"}
                </div>
              </div>
            ))}
          </div>

          {scheduleOpen && isSchedulePending && !isScheduleChecking && (
            <div style={scheduleEditorWrapStyle}>
              {weeklySchedule.map((day) => {
                if (day.isHoliday) {
                  return (
                    <div key={day.key} style={scheduleEditorHolidayRowStyle}>
                      <div style={scheduleEditorLeftStyle}>
                        <div style={scheduleEditorDayStyle}>
                          {day.dayLabel} ({day.dateLabel})
                        </div>
                        <div style={scheduleEditorHolidayTextStyle}>
                          {day.holidayName || "공휴일"} 자동 제외
                        </div>
                      </div>
                      <div style={scheduleEditorDashStyle}>-</div>
                    </div>
                  );
                }

                return (
                  <div key={day.key} style={scheduleEditorRowStyle}>
                    <div style={scheduleEditorLeftStyle}>
                      <div style={scheduleEditorDayStyle}>
                        {day.dayLabel} ({day.dateLabel})
                      </div>

                      <label style={scheduleCheckboxLabelStyle}>
                        <input
                          type="checkbox"
                          checked={day.available}
                          onChange={() => handleToggleScheduleAvailable(day.key)}
                        />
                        <span>출근 가능</span>
                      </label>

                      {day.available && (
                        <div style={scheduleShiftButtonRowStyle}>
                          <button
                            type="button"
                            onClick={() => handleShiftChange(day.key, "day")}
                            style={
                              day.shift === "day"
                                ? scheduleShiftSelectedButtonStyle
                                : scheduleShiftButtonStyle
                            }
                          >
                            주간
                          </button>

                          <button
                            type="button"
                            onClick={() => handleShiftChange(day.key, "night")}
                            style={
                              day.shift === "night"
                                ? scheduleNightSelectedButtonStyle
                                : scheduleShiftButtonStyle
                            }
                          >
                            야간
                          </button>
                        </div>
                      )}
                    </div>

                    <div
                      style={
                        day.available
                          ? scheduleSelectedBadgeStyle
                          : scheduleUnselectedBadgeStyle
                      }
                    >
                      {day.available
                        ? day.shift === "night"
                          ? "야간"
                          : "주간"
                        : "미선택"}
                    </div>
                  </div>
                );
              })}

              <div style={scheduleHelperTextStyle}>
                선택된 출근 가능 요일: <strong>{selectedScheduleCount}일</strong>
                {selectedNightScheduleCount > 0 && (
                  <>
                    {" "}/ 야간: <strong>{selectedNightScheduleCount}일</strong>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={handleSubmitSchedule}
                disabled={isScheduleSaving || isHolidayLoading || isScheduleChecking}
                style={{
                  ...scheduleSubmitButtonStyle,
                  opacity:
                    isScheduleSaving || isHolidayLoading || isScheduleChecking
                      ? 0.7
                      : 1,
                  cursor:
                    isScheduleSaving || isHolidayLoading || isScheduleChecking
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {isScheduleSaving ? "제출 중..." : "스케줄 제출하기"}
              </button>
            </div>
          )}

          {!scheduleOpen && isSchedulePending && !isScheduleChecking && (
            <button
              type="button"
              onClick={() => setScheduleOpen(true)}
              disabled={isHolidayLoading}
              style={{
                ...scheduleOpenButtonStyle,
                opacity: isHolidayLoading ? 0.7 : 1,
                cursor: isHolidayLoading ? "not-allowed" : "pointer",
              }}
            >
              {isHolidayLoading ? "주간 일정 불러오는 중..." : "스케줄 입력 열기"}
            </button>
          )}

          {scheduleOpen && isSchedulePending && !isScheduleChecking && (
            <button
              type="button"
              onClick={() => setScheduleOpen(false)}
              style={scheduleCloseButtonStyle}
            >
              입력 닫기
            </button>
          )}

          {!isSchedulePending && !isScheduleChecking && (
            <div style={scheduleDoneButtonStyle}>제출 완료 (수정 불가)</div>
          )}
        </div>

      </section>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  backgroundColor: "#f5f7fb",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "20px",
  fontFamily: "sans-serif",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "520px",
  backgroundColor: "#ffffff",
  borderRadius: "20px 14px",
  padding: "28px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "28px",
  fontWeight: 700,
  color: "#111827",
};

const subtitleStyle: React.CSSProperties = {
  marginTop: "10px",
  marginBottom: 0,
  fontSize: "16px",
  color: "#4b5563",
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  marginBottom: "12px",
};

const primaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "16px 20px",
  border: "none",
  borderRadius: "14px",
  backgroundColor: "#111827",
  color: "#ffffff",
  fontSize: "17px",
  fontWeight: 700,
};

const secondaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "16px 20px",
  border: "1px solid #d1d5db",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
  color: "#111827",
  fontSize: "17px",
  fontWeight: 700,
};

const noticeBoxStyle: React.CSSProperties = {
  backgroundColor: "#fff7ed",
  border: "1px solid #fed7aa",
  borderRadius: "14px",
  padding: "14px 16px",
  marginBottom: "16px",
};

const noticeTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#9a3412",
  marginBottom: "4px",
};

const noticeTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#7c2d12",
  lineHeight: 1.6,
};

const payrollLinkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
  textDecoration: "none",
  border: "1px solid #dbeafe",
  backgroundColor: "#eff6ff",
  borderRadius: "16px",
  padding: "16px",
  marginBottom: "16px",
};

const payrollIconStyle: React.CSSProperties = {
  width: "52px",
  height: "52px",
  minWidth: "52px",
  borderRadius: "14px",
  backgroundColor: "#dbeafe",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "24px",
};

const payrollTitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#111827",
  marginBottom: "4px",
};

const payrollDescStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#4b5563",
  lineHeight: 1.5,
};

const scheduleBaseCardStyle: React.CSSProperties = {
  borderRadius: "18px",
  padding: "18px 16px",
  marginBottom: "16px",
};

const schedulePendingCardStyle: React.CSSProperties = {
  ...scheduleBaseCardStyle,
  backgroundColor: "#fffafa",
  border: "1px solid #f87171",
};

const scheduleDoneCardStyle: React.CSSProperties = {
  ...scheduleBaseCardStyle,
  backgroundColor: "#f8fbff",
  border: "1px solid #60a5fa",
};

const scheduleHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "16px",
};

const scheduleTitleWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const schedulePendingIconStyle: React.CSSProperties = {
  width: "54px",
  height: "54px",
  minWidth: "54px",
  borderRadius: "14px",
  backgroundColor: "#ef4444",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "26px",
};

const scheduleDoneIconStyle: React.CSSProperties = {
  width: "54px",
  height: "54px",
  minWidth: "54px",
  borderRadius: "14px",
  backgroundColor: "#3b82f6",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "26px",
};

const scheduleTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 800,
  color: "#111827",
  marginBottom: "4px",
};

const scheduleDateStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  fontWeight: 600,
};

const schedulePendingBadgeStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "999px",
  backgroundColor: "#fee2e2",
  color: "#dc2626",
  fontSize: "14px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const scheduleDoneBadgeStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "999px",
  backgroundColor: "#dbeafe",
  color: "#2563eb",
  fontSize: "14px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const scheduleMainTextStyle: React.CSSProperties = {
  fontSize: "17px",
  fontWeight: 800,
  marginBottom: "6px",
  color: "#111827",
};

const scheduleSubTextStyle: React.CSSProperties = {
  fontSize: "15px",
  color: "#374151",
  lineHeight: 1.5,
};

const scheduleMiniDayRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: "6px",
  marginBottom: "16px",
};

const scheduleMiniDayCardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
  padding: "10px 4px",
  textAlign: "center",
};

const scheduleMiniDayLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#374151",
  marginBottom: "6px",
};

const scheduleMiniDayDateStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#111827",
  fontWeight: 600,
  marginBottom: "10px",
};

const scheduleHolidayStatusStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#ef4444",
};

const schedulePendingDotStyle: React.CSSProperties = {
  fontSize: "22px",
  lineHeight: 1,
  color: "#ef4444",
};

const scheduleDoneDotStyle: React.CSSProperties = {
  fontSize: "22px",
  lineHeight: 1,
  color: "#3b82f6",
};

const scheduleMiniEmptyDotStyle: React.CSSProperties = {
  fontSize: "22px",
  lineHeight: 1,
  color: "#9ca3af",
};

const scheduleEditorWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  marginBottom: "14px",
};

const scheduleEditorRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  border: "1px solid #fecaca",
  backgroundColor: "#ffffff",
  borderRadius: "14px",
  padding: "14px 12px",
};

const scheduleEditorHolidayRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  border: "1px solid #e5e7eb",
  backgroundColor: "#fff7f7",
  borderRadius: "14px",
  padding: "14px 12px",
};

const scheduleEditorLeftStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const scheduleEditorDayStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 800,
  color: "#111827",
};

const scheduleEditorHolidayTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#dc2626",
  fontWeight: 700,
};

const scheduleCheckboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "14px",
  color: "#374151",
  fontWeight: 600,
};

const scheduleShiftButtonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const scheduleShiftButtonStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: "999px",
  backgroundColor: "#ffffff",
  color: "#374151",
  padding: "8px 12px",
  fontSize: "13px",
  fontWeight: 800,
  cursor: "pointer",
};

const scheduleShiftSelectedButtonStyle: React.CSSProperties = {
  ...scheduleShiftButtonStyle,
  border: "1px solid #ef4444",
  backgroundColor: "#fee2e2",
  color: "#dc2626",
};

const scheduleNightSelectedButtonStyle: React.CSSProperties = {
  ...scheduleShiftButtonStyle,
  border: "1px solid #6366f1",
  backgroundColor: "#e0e7ff",
  color: "#4338ca",
};

const scheduleEditorDashStyle: React.CSSProperties = {
  fontSize: "18px",
  color: "#9ca3af",
  fontWeight: 700,
};

const scheduleSelectedBadgeStyle: React.CSSProperties = {
  minWidth: "72px",
  textAlign: "center",
  padding: "8px 12px",
  borderRadius: "999px",
  backgroundColor: "#fee2e2",
  color: "#dc2626",
  fontSize: "13px",
  fontWeight: 800,
};

const scheduleUnselectedBadgeStyle: React.CSSProperties = {
  minWidth: "72px",
  textAlign: "center",
  padding: "8px 12px",
  borderRadius: "999px",
  backgroundColor: "#f3f4f6",
  color: "#6b7280",
  fontSize: "13px",
  fontWeight: 800,
};

const scheduleHelperTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#374151",
  marginTop: "2px",
};

const scheduleOpenButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  border: "none",
  textAlign: "center",
  padding: "16px 20px",
  borderRadius: "14px",
  backgroundColor: "#ef4444",
  color: "#ffffff",
  fontSize: "18px",
  fontWeight: 800,
  cursor: "pointer",
};

const scheduleCloseButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  border: "1px solid #fecaca",
  textAlign: "center",
  padding: "14px 20px",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
  color: "#dc2626",
  fontSize: "16px",
  fontWeight: 800,
  cursor: "pointer",
};

const scheduleSubmitButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  border: "none",
  textAlign: "center",
  padding: "16px 20px",
  borderRadius: "14px",
  backgroundColor: "#ef4444",
  color: "#ffffff",
  fontSize: "18px",
  fontWeight: 800,
};

const scheduleDoneButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  padding: "16px 20px",
  borderRadius: "14px",
  backgroundColor: "#dbeafe",
  color: "#2563eb",
  fontSize: "18px",
  fontWeight: 800,
};

const statusBoxStyle: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  padding: "16px",
  marginBottom: "16px",
};

const statusHeaderStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#6b7280",
  marginBottom: "6px",
};

const statusTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "16px",
  color: "#111827",
  fontWeight: 600,
};

const todaySummarySectionStyle: React.CSSProperties = {
  border: "1px solid #bfdbfe",
  backgroundColor: "#f8fbff",
  borderRadius: "16px",
  padding: "14px",
  marginBottom: "16px",
};

const todaySummaryHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "14px",
};

const todaySummaryTitleWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const todaySummaryIconStyle: React.CSSProperties = {
  width: "40px",
  height: "40px",
  minWidth: "40px",
  borderRadius: "12px",
  backgroundColor: "#dbeafe",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "20px",
};

const todaySummaryTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 800,
  color: "#111827",
};

const todaySummaryEmptyStyle: React.CSSProperties = {
  padding: "16px",
  borderRadius: "12px",
  backgroundColor: "#ffffff",
  color: "#6b7280",
  border: "1px dashed #d1d5db",
};

const todaySummaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr auto 1fr",
  alignItems: "stretch",
  gap: "0",
  backgroundColor: "#ffffff",
  borderRadius: "14px",
  border: "1px solid #dbeafe",
  overflow: "hidden",
};

const todaySummaryItemStyle: React.CSSProperties = {
  padding: "20px 14px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
};

const todaySummaryDividerStyle: React.CSSProperties = {
  width: "1px",
  backgroundColor: "#e5e7eb",
};

const todaySummaryLabelStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  fontWeight: 700,
};

const todaySummaryValueStyle: React.CSSProperties = {
  fontSize: "22px",
  color: "#111827",
  fontWeight: 800,
  textAlign: "center",
  lineHeight: 1.2,
};

const todaySummaryPillStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: "999px",
  backgroundColor: "#3b82f6",
  color: "#ffffff",
  fontSize: "13px",
  fontWeight: 700,
};

const contractLoadingCardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  backgroundColor: "#f9fafb",
  borderRadius: "16px",
  padding: "16px",
  marginBottom: "16px",
  color: "#374151",
  fontSize: "15px",
  fontWeight: 700,
};

const contractBaseCardStyle: React.CSSProperties = {
  borderRadius: "18px",
  padding: "18px 16px",
  marginBottom: "16px",
};

const contractPendingCardStyle: React.CSSProperties = {
  ...contractBaseCardStyle,
  backgroundColor: "#fff7ed",
  border: "1px solid #fb923c",
};

const contractSignedCardStyle: React.CSSProperties = {
  ...contractBaseCardStyle,
  backgroundColor: "#f0fdf4",
  border: "1px solid #86efac",
};

const contractHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "12px",
};

const contractTitleWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const contractPendingIconStyle: React.CSSProperties = {
  width: "54px",
  height: "54px",
  minWidth: "54px",
  borderRadius: "14px",
  backgroundColor: "#f97316",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "26px",
};

const contractSignedIconStyle: React.CSSProperties = {
  width: "54px",
  height: "54px",
  minWidth: "54px",
  borderRadius: "14px",
  backgroundColor: "#22c55e",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "26px",
};

const contractTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 800,
  color: "#111827",
  marginBottom: "4px",
};

const contractSubTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#6b7280",
  lineHeight: 1.5,
  fontWeight: 700,
};

const contractPendingBadgeStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "999px",
  backgroundColor: "#ffedd5",
  color: "#c2410c",
  fontSize: "14px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const contractSignedBadgeStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "999px",
  backgroundColor: "#dcfce7",
  color: "#15803d",
  fontSize: "14px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const contractInfoTextStyle: React.CSSProperties = {
  fontSize: "15px",
  color: "#374151",
  lineHeight: 1.6,
  marginBottom: "14px",
  fontWeight: 600,
};

const contractOpenPendingButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  border: "none",
  textAlign: "center",
  padding: "15px 18px",
  borderRadius: "14px",
  backgroundColor: "#f97316",
  color: "#ffffff",
  fontSize: "17px",
  fontWeight: 800,
  cursor: "pointer",
};

const contractOpenSignedButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  border: "none",
  textAlign: "center",
  padding: "15px 18px",
  borderRadius: "14px",
  backgroundColor: "#22c55e",
  color: "#ffffff",
  fontSize: "17px",
  fontWeight: 800,
  cursor: "pointer",
};

const contractViewerWrapStyle: React.CSSProperties = {
  marginTop: "14px",
  display: "flex",
  flexDirection: "column",
  gap: "14px",
};

const contractHtmlBoxStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
  borderRadius: "14px",
  padding: "14px",
  maxHeight: "420px",
  overflow: "auto",
  WebkitOverflowScrolling: "touch",
  fontSize: "13px",
};

const signatureBoxStyle: React.CSSProperties = {
  border: "1px solid #fed7aa",
  backgroundColor: "#ffffff",
  borderRadius: "14px",
  padding: "14px",
};

const contractAgreeLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "10px",
  fontSize: "14px",
  color: "#111827",
  fontWeight: 700,
  lineHeight: 1.5,
  marginBottom: "12px",
};

const signatureGuideStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#6b7280",
  fontWeight: 700,
  marginBottom: "8px",
};

const signatureCanvasStyle: React.CSSProperties = {
  width: "100%",
  height: "160px",
  border: "1px solid #d1d5db",
  borderRadius: "12px",
  backgroundColor: "#ffffff",
  touchAction: "none",
  display: "block",
};

const signatureButtonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  marginTop: "12px",
};

const signatureClearButtonStyle: React.CSSProperties = {
  flex: 1,
  border: "1px solid #d1d5db",
  textAlign: "center",
  padding: "14px 12px",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
  color: "#374151",
  fontSize: "15px",
  fontWeight: 800,
  cursor: "pointer",
};

const signatureSubmitButtonStyle: React.CSSProperties = {
  flex: 1,
  border: "none",
  textAlign: "center",
  padding: "14px 12px",
  borderRadius: "14px",
  backgroundColor: "#111827",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 800,
};