import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { toContractType } from "@/app/lib/contractType";
import {
  addDaysToDateKey,
  attendanceWorkDateKey,
  isOpenWorkDate,
  toKstDateKey,
} from "@/app/lib/workTime";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, birthDate, phoneLast4 } = body;

    if (!name || !birthDate || !phoneLast4) {
      return NextResponse.json(
        { success: false, message: "필수값 누락" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { success: false, message: "환경변수 없음" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("*")
      .eq("name", name)
      .eq("birth_date", birthDate)
      .eq("phone_last4", phoneLast4)
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (employeeError || !employee) {
      return NextResponse.json(
        { success: false, message: "직원 정보를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const now = new Date();
    const dateOnly = toKstDateKey(now);
    const yesterday = addDaysToDateKey(dateOnly, -1);

    // 야간 근무(2026-10-27): 새벽 06:00 전 퇴근은 전날 근무입니다.
    // 어제 00:00 부터 받아 근무일로 나눈 뒤, 새벽에 오늘 근무일 기록이 아직 없으면 어제 근무(야간)를 보여줍니다.
    // → 19일 21:00 출근한 사람이 20일 01:50 에 앱을 열면 [퇴근] 버튼이 나옵니다.
    const startUtc = new Date(`${yesterday}T00:00:00+09:00`).toISOString();
    const endUtc = new Date(`${dateOnly}T23:59:59.999+09:00`).toISOString();

    const { data: fetchedRecords, error: recordsError } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("employee_id", employee.id)
      .gte("checked_at", startUtc)
      .lte("checked_at", endUtc)
      .order("checked_at", { ascending: true });

    if (recordsError) {
      return NextResponse.json(
        { success: false, message: "오늘 기록 조회 실패" },
        { status: 500 }
      );
    }

    const todayRecords = (fetchedRecords || []).filter(
      (r) => attendanceWorkDateKey(r) === dateOnly
    );
    const yesterdayRecords = (fetchedRecords || []).filter(
      (r) => attendanceWorkDateKey(r) === yesterday
    );
    // 어제 근무가 아직 열려 있거나(출근만 있음) 방금 새벽에 퇴근한 경우만 어제 근무를 보여줍니다.
    const yesterdayIsNightShift =
      ["hourly", "piece"].some((segment) => {
        const ofSegment = yesterdayRecords.filter(
          (r) => (r.segment_type || "hourly") === segment
        );
        return (
          ofSegment.some((r) => r.record_type === "check_in") &&
          !ofSegment.some((r) => r.record_type === "check_out")
        );
      }) ||
      yesterdayRecords.some(
        (r) => r.record_type === "check_out" && toKstDateKey(r.checked_at) === dateOnly
      );
    const showYesterday =
      todayRecords.length === 0 &&
      yesterdayIsNightShift &&
      isOpenWorkDate(yesterday, now);
    const records = showYesterday ? yesterdayRecords : todayRecords;

    // checkIn / checkOut 은 시급 구간 기준(기존 응답 형식 유지).
    // 도급 구간은 records 의 segment_type 으로 화면에서 구분합니다.
    const hourlyRecords = records.filter(
      (r) => (r.segment_type || "hourly") === "hourly"
    );
    const checkIn = hourlyRecords.find((r) => r.record_type === "check_in");
    const checkOut = hourlyRecords.find((r) => r.record_type === "check_out");

    return NextResponse.json({
      success: true,
      // 근로자 화면이 도급 버튼을 보여줄지 정하는 값입니다(시급+도급만 표시).
      contractType: toContractType(employee.contract_type),
      today: {
        checkIn: checkIn ? checkIn.checked_at : null,
        checkOut: checkOut ? checkOut.checked_at : null,
        records,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "오늘 기록 API 에러",
      },
      { status: 500 }
    );
  }
}