import { NextResponse } from "next/server";
import { isAdminRequest, serviceClient } from "@/app/lib/contracts/server";
import { FIELD_PIN_KEY, FIELD_PIN_PATTERN, hashFieldPin, loadFieldPinHash } from "@/app/lib/fieldPin";

/**
 * 현장 직원 PIN 설정 (관리자 화면 전자계약 탭, 2026-10-27).
 *   GET : 설정 여부·마지막 변경 시각 (PIN 은 내려보내지 않음)
 *   PUT : 새 PIN 저장(숫자 4~8자리). 해시만 저장합니다. 바꾸면 이전 PIN 은 바로 못 씁니다.
 */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ success: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const supabase = serviceClient();

  if (!supabase) {
    return NextResponse.json({ success: false, message: "환경변수 없음" }, { status: 500 });
  }

  const { data, error } = await supabase.from("app_secrets").select("updated_at").eq("key", FIELD_PIN_KEY).maybeSingle();

  // 마이그레이션 전이면 표가 없어서 오류 → 준비 안 됨
  if (error) return NextResponse.json({ success: true, ready: false, configured: false });

  return NextResponse.json({ success: true, ready: true, configured: Boolean(data), updatedAt: data?.updated_at ?? null });
}

export async function PUT(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ success: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const pin = String(body.pin ?? "").trim();

  if (!FIELD_PIN_PATTERN.test(pin)) {
    return NextResponse.json({ success: false, message: "PIN 은 숫자 4~8자리로 입력해 주세요." }, { status: 400 });
  }

  if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) {
    return NextResponse.json({ success: false, message: "같은 숫자 반복이나 연속 숫자(1234 등)는 쓸 수 없습니다." }, { status: 400 });
  }

  const supabase = serviceClient();

  if (!supabase) {
    return NextResponse.json({ success: false, message: "환경변수 없음" }, { status: 500 });
  }

  const { error } = await supabase
    .from("app_secrets")
    .upsert({ key: FIELD_PIN_KEY, value_hash: hashFieldPin(pin), updated_at: new Date().toISOString() });

  if (error) {
    return NextResponse.json(
      { success: false, message: error.code === "42P01" || error.code === "PGRST205" ? "PIN 저장 DB 설정이 아직 안 됐습니다. 20261027300000 SQL 을 먼저 실행해 주세요." : `저장 실패: ${error.message}` },
      { status: 500 }
    );
  }

  const saved = await loadFieldPinHash(supabase);

  return NextResponse.json({ success: true, message: "현장 직원 PIN 을 저장했습니다.", updatedAt: saved?.updated_at ?? null });
}
