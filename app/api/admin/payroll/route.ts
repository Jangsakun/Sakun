import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { startDate, endDate, name } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, message: "환경변수 없음" },
        { status: 500 }
      );
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, message: "날짜 필요" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ✅ KST 날짜 포맷 함수
    const formatKST = (date: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
      }).format(date);

    // 1. 출퇴근 기록 가져오기
    const { data: records, error } = await supabase
      .from("attendance_records")
      .select(`
        id,
        record_type,
        checked_at,
        employee_id,
        employees (
          id,
          name,
          hourly_wage
        )
      `)
      .gte("checked_at", `${startDate}T00:00:00+09:00`)
      .lte("checked_at", `${endDate}T23:59:59.999+09:00`);

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    // 2. 이름 필터
    let filtered = records || [];

    if (name) {
      filtered = filtered.filter((r: any) =>
        r.employees?.name?.includes(name)
      );
    }

    // 3. 날짜별 묶기
    const grouped: any = {};

    for (const r of filtered) {
      const kstDate = formatKST(new Date(r.checked_at));
      const key = `${r.employee_id}_${kstDate}`;

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    }

    // 4. 하루 근무시간 계산
    const dailyWorks: any[] = [];

    for (const key in grouped) {
      const items = grouped[key].sort(
        (a: any, b: any) =>
          new Date(a.checked_at).getTime() -
          new Date(b.checked_at).getTime()
      );

      const employee = items[0].employees;
      const employeeId = items[0].employee_id;
      const employeeName = employee?.name || "이름없음";

      // ✅ 기본 시급 10320
      const wage = employee?.hourly_wage ?? 10320;

      const date = formatKST(new Date(items[0].checked_at));

      const checkIn = items.find((i: any) => i.record_type === "check_in");
      const checkOuts = items.filter((i: any) => i.record_type === "check_out");

      const checkOut =
        checkOuts.length > 0
          ? checkOuts[checkOuts.length - 1]
          : null;

      let hours = 0;

      if (checkIn && checkOut) {
        const inTime = new Date(checkIn.checked_at);
        const outTime = new Date(checkOut.checked_at);

        // 9:30 보정
        const standard = new Date(`${date}T09:30:00+09:00`);
        const start = inTime > standard ? inTime : standard;

        const diff = outTime.getTime() - start.getTime();

        if (diff > 0) {
          hours = diff / 1000 / 60 / 60;
        }
      }

      dailyWorks.push({
        employeeId,
        employeeName,
        date,
        hours,
        wage,
      });
    }

    // 5. 주차별 묶기 (KST 기준)
    const weekly: any = {};

    for (const row of dailyWorks) {
      const d = new Date(row.date);

      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((day + 6) % 7));

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const weekStart = formatKST(monday);
      const weekEnd = formatKST(sunday);

      const key = `${row.employeeId}_${weekStart}`;

      if (!weekly[key]) {
        weekly[key] = {
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          weekStart,
          weekEnd,
          totalHours: 0,
          hourlyWage: row.wage,
        };
      }

      weekly[key].totalHours += row.hours;
    }

    // 6. 급여 계산 (반올림 적용)
    const result = Object.values(weekly).map((w: any) => {
      const basePay = Math.round(w.totalHours * w.hourlyWage);

      const weeklyAllowance = Math.round(
        (w.totalHours / 5) * w.hourlyWage
      );

      const grossPay = basePay + weeklyAllowance;

      const netPay = Math.round(grossPay * 0.967);

      return {
        employeeId: String(w.employeeId),
        employeeName: w.employeeName,
        weekStart: w.weekStart,
        weekEnd: w.weekEnd,
        totalHours: Number(w.totalHours.toFixed(2)),
        hourlyWage: w.hourlyWage,
        basePay,
        weeklyAllowance,
        grossPay,
        netPay,
      };
    });

    return NextResponse.json({
      success: true,
      payrolls: result,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}