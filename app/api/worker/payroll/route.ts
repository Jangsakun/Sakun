import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey);
}

function calcNetPay(gross: number) {
  return Math.floor(gross * 0.967);
}

function formatDateKeyKst(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getKstHourMinute(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  const timeText = date.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const [hourText, minuteText] = timeText.split(":");

  return {
    hour: Number(hourText),
    minute: Number(minuteText),
    totalMinutes: Number(hourText) * 60 + Number(minuteText),
  };
}

function createKstDateTime(dateKey: string, hour: number, minute: number) {
  return new Date(
    `${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0"
    )}:00+09:00`
  );
}

function formatTimeKst(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  return date.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatMinutesToText(totalMinutes: number) {
  if (totalMinutes <= 0) return "0분";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours}시간 ${minutes}분`;
  if (hours > 0) return `${hours}시간`;
  return `${minutes}분`;
}

function normalizeCheckIn(value: string) {
  const source = new Date(value);
  const dateKey = formatDateKeyKst(source);
  const { totalMinutes } = getKstHourMinute(source);

  const start0900 = 8 * 60 + 45;
  const end0910 = 9 * 60 + 10;
  const start0930 = 9 * 60 + 11;
  const end0930 = 9 * 60 + 30;

  if (totalMinutes >= start0900 && totalMinutes <= end0910) {
    return createKstDateTime(dateKey, 9, 0);
  }

  if (totalMinutes >= start0930 && totalMinutes <= end0930) {
    return createKstDateTime(dateKey, 9, 30);
  }

  return source;
}

function normalizeCheckOut(value: string) {
  const source = new Date(value);
  const dateKey = formatDateKeyKst(source);
  const { hour, minute } = getKstHourMinute(source);

  if (hour >= 18) {
    if (minute <= 10) {
      return createKstDateTime(dateKey, hour, 0);
    }

    if (minute <= 40) {
      return createKstDateTime(dateKey, hour, 30);
    }

    return createKstDateTime(dateKey, hour + 1, 0);
  }

  return source;
}

function isCheckInType(value: string) {
  const normalized = String(value || "").toLowerCase().trim();

  return (
    normalized === "check-in" ||
    normalized === "check_in" ||
    normalized === "checkin" ||
    normalized === "in" ||
    normalized === "출근"
  );
}

function isCheckOutType(value: string) {
  const normalized = String(value || "").toLowerCase().trim();

  return (
    normalized === "check-out" ||
    normalized === "check_out" ||
    normalized === "checkout" ||
    normalized === "out" ||
    normalized === "퇴근"
  );
}

function getCurrentWeekRangeKst() {
  const now = new Date();
  const seoulNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );

  const day = seoulNow.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  const monday = new Date(seoulNow);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(seoulNow.getDate() + diff);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    startDate: formatDateKeyKst(monday),
    endDate: formatDateKeyKst(sunday),
  };
}

function addDaysToDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);
  return formatDateKeyKst(date);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const name = String(body.name || "").trim();
    const residentNumber = String(body.residentNumber || "").trim();
    const action = String(body.action || "currentWeek").trim();

    if (!name || !residentNumber) {
      return NextResponse.json(
        { success: false, message: "이름/주민번호 필요" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();

    if (!supabase) {
      return NextResponse.json(
        { success: false, message: "환경변수 없음" },
        { status: 500 }
      );
    }

    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("*")
      .eq("name", name)
      .eq("resident_number", residentNumber)
      .maybeSingle();

    if (employeeError) {
      return NextResponse.json(
        {
          success: false,
          message: "직원 조회 실패",
          debug: employeeError.message,
        },
        { status: 500 }
      );
    }

    if (!employee) {
      return NextResponse.json(
        { success: false, message: "직원 없음" },
        { status: 404 }
      );
    }

    let startDate = "";
    let endDate = "";

    if (action === "currentWeek") {
      const range = getCurrentWeekRangeKst();
      startDate = range.startDate;
      endDate = range.endDate;
    }

    if (action === "byDate") {
      if (body.date) {
        startDate = String(body.date);
        endDate = String(body.date);
      } else {
        startDate = String(body.startDate || "");
        endDate = String(body.endDate || "");
      }
    }

    if (action === "weeklyStatement") {
      startDate = String(body.weekStartDate || "");
      endDate = startDate ? addDaysToDateKey(startDate, 6) : "";
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, message: "조회 날짜가 필요합니다." },
        { status: 400 }
      );
    }

    const startDateTime = `${startDate}T00:00:00+09:00`;
    const endDateTime = `${endDate}T23:59:59+09:00`;

    const { data: records, error: recordError } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("employee_id", employee.id)
      .gte("checked_at", startDateTime)
      .lte("checked_at", endDateTime)
      .order("checked_at", { ascending: true });

    if (recordError) {
      return NextResponse.json(
        {
          success: false,
          message: "출퇴근 기록 조회 실패",
          debug: recordError.message,
        },
        { status: 500 }
      );
    }

    const hourlyWage = Number(employee.hourly_wage || 10320);
    const grouped: Record<string, any[]> = {};

    (records || []).forEach((record) => {
      const dateKey = formatDateKeyKst(record.checked_at);

      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(record);
    });

    let totalMinutes = 0;
    let totalGrossPay = 0;

    const dailyRows = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => {
        const sortedItems = [...items].sort(
          (a, b) =>
            new Date(a.checked_at).getTime() -
            new Date(b.checked_at).getTime()
        );

        const checkIn = sortedItems.find((item) =>
          isCheckInType(item.record_type)
        );

        const checkOut = [...sortedItems]
          .reverse()
          .find((item) => isCheckOutType(item.record_type));

        if (!checkIn) {
          return {
            date,
            checkIn: null,
            checkOut: null,
            paidMinutes: 0,
            grossPay: 0,
            netPay: 0,
            isWorking: false,
            lunchDeducted: false,
            checkInRecordId: null,
            checkOutRecordId: null,
            checkInText: "-",
            checkOutText: "-",
            workText: "0분",
            lunchText: "-",
          };
        }

        const rawCheckInDate = new Date(checkIn.checked_at);
        const normalizedCheckInDate = normalizeCheckIn(checkIn.checked_at);

        const finalCheckOut = checkOut || null;
        const rawCheckOutDate = finalCheckOut
          ? new Date(finalCheckOut.checked_at)
          : new Date();

        const normalizedCheckOutDate = finalCheckOut
          ? normalizeCheckOut(finalCheckOut.checked_at)
          : new Date();

        const checkInMinutes = getKstHourMinute(normalizedCheckInDate);
        const checkOutMinutes = getKstHourMinute(normalizedCheckOutDate);

        let paidMinutes = Math.max(
          0,
          Math.floor(
            (normalizedCheckOutDate.getTime() -
              normalizedCheckInDate.getTime()) /
              (1000 * 60)
          )
        );

        const lunchDeducted =
          checkInMinutes.totalMinutes < 12 * 60 + 30 &&
          checkOutMinutes.totalMinutes > 13 * 60 + 30;

        if (lunchDeducted) {
          paidMinutes = Math.max(0, paidMinutes - 60);
        }

        const grossPay = Math.floor((paidMinutes / 60) * hourlyWage);
        const netPay = calcNetPay(grossPay);

        totalMinutes += paidMinutes;
        totalGrossPay += grossPay;

        return {
          date,
          checkIn: checkIn.checked_at,
          checkOut: finalCheckOut?.checked_at || null,
          paidMinutes,
          grossPay,
          netPay,
          isWorking: Boolean(checkIn && !finalCheckOut),
          lunchDeducted,
          checkInRecordId: checkIn.id ? String(checkIn.id) : null,
          checkOutRecordId: finalCheckOut?.id ? String(finalCheckOut.id) : null,
          checkInText: `${formatTimeKst(rawCheckInDate)} → ${formatTimeKst(
            normalizedCheckInDate
          )}`,
          checkOutText: finalCheckOut
            ? `${formatTimeKst(rawCheckOutDate)} → ${formatTimeKst(
                normalizedCheckOutDate
              )}`
            : "퇴근 전",
          workText: formatMinutesToText(paidMinutes),
          lunchText: lunchDeducted ? "점심 1시간 제외" : "-",
        };
      });

    const totalNetPay = calcNetPay(totalGrossPay);

    const weeklyAllowanceStatus =
      employee.weekly_allowance_status || "검토필요";

    const weeklyAllowanceAmount =
      weeklyAllowanceStatus === "대상"
        ? Math.floor((totalMinutes / 60 / 5) * hourlyWage)
        : 0;

    return NextResponse.json({
      success: true,
      employee: {
        id: String(employee.id),
        name: employee.name,
        residentNumber: employee.resident_number,
        hourlyWage,
      },
      range: {
        startDate,
        endDate,
      },
      summary: {
        totalMinutes,
        totalWorkText: formatMinutesToText(totalMinutes),
        totalGrossPay,
        totalNetPay,
      },
      weeklyAllowance: {
        status: weeklyAllowanceStatus,
        amount: weeklyAllowanceAmount,
        displayText:
          weeklyAllowanceAmount > 0
            ? `${weeklyAllowanceAmount.toLocaleString("ko-KR")}원`
            : "해당 없음",
      },
      dailyRows,
    });
  } catch (error) {
    console.error("worker payroll POST error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "서버 오류",
        debug: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}