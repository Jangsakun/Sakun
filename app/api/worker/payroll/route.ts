import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey);
}

function calcNetPay(gross: number) {
  return Math.floor(gross * 0.967); // 3.3% 공제
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { name, residentNumber, action } = body;

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

    // 직원 찾기
    const { data: employee } = await supabase
      .from("employees")
      .select("*")
      .eq("name", name)
      .eq("resident_number", residentNumber)
      .maybeSingle();

    if (!employee) {
      return NextResponse.json(
        { success: false, message: "직원 없음" },
        { status: 404 }
      );
    }

    // 날짜 범위 계산
    let startDate = "";
    let endDate = "";

    if (action === "currentWeek") {
      const now = new Date();
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;

      const monday = new Date(now);
      monday.setDate(now.getDate() + diff);

      startDate = monday.toISOString().slice(0, 10);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      endDate = sunday.toISOString().slice(0, 10);
    }

    if (action === "byDate") {
      if (body.date) {
        startDate = body.date;
        endDate = body.date;
      } else {
        startDate = body.startDate;
        endDate = body.endDate;
      }
    }

    if (action === "weeklyStatement") {
      startDate = body.weekStartDate;
      const end = new Date(startDate);
      end.setDate(end.getDate() + 6);
      endDate = end.toISOString().slice(0, 10);
    }

    // 출퇴근 데이터 조회
    const { data: records } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("employee_id", employee.id)
      .gte("checked_at", startDate)
      .lte("checked_at", endDate);

    let totalMinutes = 0;
    let totalGross = 0;

    const dailyRows: any[] = [];

    // 간단 계산 (기본 버전)
    const grouped: Record<string, any[]> = {};

    (records || []).forEach((r) => {
      const date = r.checked_at.slice(0, 10);
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(r);
    });

    Object.entries(grouped).forEach(([date, items]) => {
      const checkIn = items.find((i) => i.record_type === "check-in");
      const checkOut = items.find((i) => i.record_type === "check-out");

      if (!checkIn || !checkOut) return;

      const start = new Date(checkIn.checked_at).getTime();
      const end = new Date(checkOut.checked_at).getTime();

      const minutes = Math.floor((end - start) / 60000);

      const gross = Math.floor((minutes / 60) * (employee.hourly_wage || 10320));
      const net = calcNetPay(gross);

      totalMinutes += minutes;
      totalGross += gross;

      dailyRows.push({
        date,
        checkInText: checkIn.checked_at.slice(11, 16),
        checkOutText: checkOut.checked_at.slice(11, 16),
        workText: `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`,
        paidMinutes: minutes,
        grossPay: gross,
        netPay: net,
        isWorking: false,
      });
    });

    const totalNet = calcNetPay(totalGross);

    return NextResponse.json({
      success: true,
      employee: {
        id: employee.id,
        name: employee.name,
        residentNumber: employee.resident_number,
        hourlyWage: employee.hourly_wage || 10320,
      },
      range: {
        startDate,
        endDate,
      },
      summary: {
        totalMinutes,
        totalWorkText: `${Math.floor(totalMinutes / 60)}시간 ${
          totalMinutes % 60
        }분`,
        totalGrossPay: totalGross,
        totalNetPay: totalNet,
      },
      dailyRows,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}