import { NextResponse } from "next/server";
import { computeWeeklyPayroll } from "@/app/lib/payrollCompute";

// 관리자 화면 급여 조회. 계산은 app/lib/payrollCompute.ts 한 곳에 있고,
// 이 라우트는 시급 스냅샷 고정(쓰기)을 켠 일반 모드로 부릅니다.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { startDate, endDate, name } = body;

    const result = await computeWeeklyPayroll({
      startDate,
      endDate,
      name,
      writeMissingSnapshots: true,
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: result.status }
      );
    }

    return NextResponse.json({ success: true, payrolls: result.payrolls });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}
