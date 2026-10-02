import { NextResponse } from "next/server";
import { computeWeeklyPayroll } from "@/app/lib/payrollCompute";

// BISEO 전용 급여 합산 API — "읽기 전용 모드" 하나만 있습니다.
//
// 왜 관리자 API 를 직접 부르지 않나
//   나중에 /api/admin/* 에 인증을 걸어도 BISEO 가 영향받지 않게 하기 위해 주소를 분리했습니다.
//
// 읽기 전용
//   관리자 급여 API 와 같은 계산 함수(computeWeeklyPayroll)를 쓰되, 시급 스냅샷을 DB 에 채워 넣는
//   쓰기(writeMissingSnapshots)를 끕니다. 계산 결과는 일반 모드와 같습니다(검증: _verify 비교).
//   이 주소로는 아무 것도 저장·수정·삭제할 수 없습니다.
//
// ⚠️ 인증키는 아직 적용하지 않았습니다(2026-10-02 결정). 관리자 API 와 같은 수준으로 열려 있습니다.
//    docs/SECURITY_TODO.md §5 ② 에 설계(BISEO_INTERNAL_API_KEY)가 있습니다.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { startDate, endDate, name } = body;

    const result = await computeWeeklyPayroll({
      startDate,
      endDate,
      name,
      writeMissingSnapshots: false,
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
