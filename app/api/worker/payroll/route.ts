import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadPayOverrides, payOverrideKey } from "@/app/lib/payOverride";
import { getDailyWage, isPieceContract } from "@/app/lib/contractType";
import { calcDayPay } from "@/app/lib/dayPay";

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

    // 관리자가 직접 지정한 하루치 세전급여.
    // 관리자 화면과 본인 화면 금액이 다르면 바로 항의가 들어오므로
    // 같은 값을 같은 규칙으로 읽습니다.
    const loadedOverrides = await loadPayOverrides(
      supabase,
      startDate,
      endDate
    );

    if (loadedOverrides.error) {
      return NextResponse.json(
        {
          success: false,
          message: "급여 조회 실패",
          debug: loadedOverrides.error,
        },
        { status: 500 }
      );
    }

    const payOverrides = loadedOverrides.overrides;

    const hourlyWage = Number(employee.hourly_wage || 10320);

    // 도급 전용 계약은 주휴수당 없음. 시급+도급은 시급분만 주휴수당 대상.
    const isPiece = isPieceContract(employee);
    const dailyWage = getDailyWage(employee);

    const actualWorkplace = String(
      employee.workplace_name ||
        employee.workplace ||
        employee.workplace_label ||
        "장사꾼"
    ).trim();

    // 깨소금 직원의 주급명세서는 장사꾼 기준으로 표시합니다.
    const payrollWorkplace =
      actualWorkplace === "깨소금" ? "장사꾼" : actualWorkplace;

    const companyName =
      payrollWorkplace === "헤모즈" ? "헤모즈" : "장사꾼";

    const payslipTitle =
      payrollWorkplace === "헤모즈"
        ? "헤모즈 급여명세서"
        : "장사꾼 급여명세서";

    const grouped: Record<string, any[]> = {};

    (records || []).forEach((record) => {
      const dateKey = formatDateKeyKst(record.checked_at);

      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(record);
    });

    let totalMinutes = 0;
    let totalGrossPay = 0;
    // 주휴수당은 시급분 기준(도급 일급이 섞이면 평균시급이 부풀려짐)
    let totalHourlyPortion = 0;
    let totalAllowanceMinutes = 0;

    const dailyRows = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => {
        const sortedItems = [...items].sort(
          (a, b) =>
            new Date(a.checked_at).getTime() -
            new Date(b.checked_at).getTime()
        );

        const override = payOverrides.get(payOverrideKey(employee.id, date));

        // 시급분 + 도급분 계산은 app/lib/dayPay.ts 한 곳에서 합니다(관리자 급여와 같은 규칙).
        // 시급: 오늘 퇴근 전이면 현재 시각까지 추정, 퇴근이 누락된 지난 날은 0원(누락 표시).
        // 도급: 도급 출근+퇴근이 모두 있으면 일급 전액, 퇴근 누락이면 0원.
        const dayPay = calcDayPay(date, sortedItems, {
          fallbackHourlyWage: hourlyWage,
          fallbackDailyWage: dailyWage,
          override: override !== undefined ? override.grossPay : null,
          now: new Date(),
        });

        const workTime = dayPay.hourly;
        const piece = dayPay.piece;
        const dayWage = workTime.wage;
        const checkIn = workTime.checkIn;
        const checkOut = workTime.checkOut;

        const pieceFields = {
          piecePay: dayPay.piecePortion,
          pieceCheckInText: piece.checkIn
            ? formatTimeKst(new Date(piece.checkIn.checked_at))
            : null,
          pieceCheckOutText: piece.checkOut
            ? formatTimeKst(new Date(piece.checkOut.checked_at))
            : piece.missingCheckOut
            ? "도급 퇴근 누락"
            : piece.inProgress
            ? "도급 퇴근 전"
            : null,
          pieceMissingCheckOut: piece.missingCheckOut,
        };

        if (!checkIn && !piece.hasPiece) {
          return {
            date,
            checkIn: null,
            checkOut: null,
            paidMinutes: 0,
            hourlyWage: dayWage,
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
            hourlyPay: 0,
            ...pieceFields,
          };
        }

        // 관리자 페이지에서 수동 수정한 시간이 최종 확정값입니다.
        // DB 에 저장된 checked_at 값을 다시 보정하지 않고 그대로 사용합니다.
        const finalCheckOut = checkOut || null;
        const normalizedCheckOutDate = finalCheckOut
          ? new Date(finalCheckOut.checked_at)
          : null;

        const paidMinutes = workTime.workedMinutes;
        const lunchDeducted = workTime.lunchDeducted;

        const grossPay = dayPay.basePay;
        const netPay = calcNetPay(grossPay);

        totalMinutes += paidMinutes;
        totalAllowanceMinutes += dayPay.allowanceMinutes;
        totalGrossPay += grossPay;
        totalHourlyPortion += dayPay.hourlyPortion;

        return {
          date,
          checkIn: checkIn?.checked_at || null,
          checkOut: finalCheckOut?.checked_at || null,
          paidMinutes,
          hourlyWage: dayWage,
          grossPay,
          netPay,
          isWorking: workTime.estimated || piece.inProgress,
          missingCheckOut: workTime.missingCheckOut,
          lunchDeducted,
          checkInRecordId: checkIn?.id ? String(checkIn.id) : null,
          checkOutRecordId: finalCheckOut?.id ? String(finalCheckOut.id) : null,
          checkInText: checkIn ? formatTimeKst(new Date(checkIn.checked_at)) : "-",
          checkOutText: normalizedCheckOutDate
            ? formatTimeKst(normalizedCheckOutDate)
            : !checkIn
            ? "-"
            : workTime.missingCheckOut
            ? "퇴근 누락"
            : "퇴근 전",
          workText: formatMinutesToText(paidMinutes),
          lunchText: lunchDeducted ? "점심 1시간 제외" : "-",
          hourlyPay: dayPay.override !== null ? dayPay.override : workTime.pay,
          ...pieceFields,
        };
      });

    const weeklyAllowanceStatus =
      employee.weekly_allowance_status || "검토필요";

    const totalHours = totalMinutes / 60;
    const averageHourlyWage =
      totalHours > 0 ? totalHourlyPortion / totalHours : hourlyWage;

    const weeklyAllowanceAmount =
      !isPiece &&
      weeklyAllowanceStatus === "대상" &&
      totalAllowanceMinutes >= 15 * 60
        ? Math.floor((totalHours / 5) * averageHourlyWage)
        : 0;

    // 관리자 급여관리 화면과 동일하게
    // 총 지급 급여와 세후 급여는 기본급 + 주휴수당 기준으로 계산합니다.
    const totalGrossPayWithAllowance = totalGrossPay + weeklyAllowanceAmount;
    const totalNetPay = calcNetPay(totalGrossPayWithAllowance);

    return NextResponse.json({
      success: true,
      employee: {
        id: String(employee.id),
        name: employee.name,
        residentNumber: employee.resident_number,
        hourlyWage,
        contractType: isPiece ? "piece" : "hourly",
        dailyWage,
        averageHourlyWage: Math.round(averageHourlyWage),
        workplace: payrollWorkplace,
        actualWorkplace,
        companyName,
        payslipTitle,
      },
      range: {
        startDate,
        endDate,
      },
      summary: {
        totalMinutes,
        totalWorkText: formatMinutesToText(totalMinutes),
        totalGrossPay: totalGrossPayWithAllowance,
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