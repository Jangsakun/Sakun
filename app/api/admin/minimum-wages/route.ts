import { NextResponse } from "next/server";
import { isAdminRequest, serviceClient } from "@/app/lib/contracts/server";

/**
 * 연도별 최저시급.
 * 근로계약서 작성 때 "계약 시작일이 속한 연도"의 값과 비교합니다. 값이 없는 해는 작성이 막힙니다.
 * 이미 서명된 계약서는 서명 시점 값으로 남으므로 여기서 바꿔도 영향이 없습니다.
 */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ success: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const supabase = serviceClient();

  if (!supabase) {
    return NextResponse.json({ success: false, message: "환경변수 없음" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("minimum_wages")
    .select("year, hourly_wage, note, updated_at")
    .order("year", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, minimumWages: data ?? [] });
}

export async function PUT(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ success: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const year = Number(body?.year);
  const hourlyWage = Number(String(body?.hourlyWage ?? "").replace(/[,\s원]/g, ""));
  const note = String(body?.note ?? "").trim() || null;

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ success: false, message: "연도는 2020~2100 사이 숫자여야 합니다." }, { status: 400 });
  }

  if (!Number.isInteger(hourlyWage) || hourlyWage <= 0) {
    return NextResponse.json({ success: false, message: "최저시급은 원 단위 숫자로 입력해주세요." }, { status: 400 });
  }

  // 자릿수 오타 방지(예: 103200)
  if (hourlyWage < 5000 || hourlyWage > 50000) {
    return NextResponse.json(
      { success: false, message: `${hourlyWage.toLocaleString()}원은 최저시급으로 보기 어렵습니다. 자릿수를 확인해주세요.` },
      { status: 400 }
    );
  }

  const supabase = serviceClient();

  if (!supabase) {
    return NextResponse.json({ success: false, message: "환경변수 없음" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("minimum_wages")
    .upsert({ year, hourly_wage: hourlyWage, note, updated_at: new Date().toISOString() }, { onConflict: "year" })
    .select("year, hourly_wage");

  if (error) {
    return NextResponse.json({ success: false, message: `저장 실패: ${error.message}` }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ success: false, message: "저장된 행이 없습니다. 권한 설정을 확인해주세요." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: `${year}년 최저시급을 ${hourlyWage.toLocaleString()}원으로 저장했습니다.`,
  });
}
