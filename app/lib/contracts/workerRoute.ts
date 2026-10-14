import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "./server";
import { findWorker, readIdentity, type WorkerEmployee } from "./worker";
import { maskResidentNumber, normalizeResidentNumber } from "./residentNumber";

// 서버 전용. 근로자 계약서 API 의 공통 앞부분(본문 읽기 → 근로자 확인).

export type WorkerContext = {
  supabase: SupabaseClient;
  employee: WorkerEmployee;
  body: Record<string, unknown>;
};

export async function withWorker(
  request: Request,
  handler: (ctx: WorkerContext) => Promise<Response>
): Promise<Response> {
  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const identity = readIdentity(body);

    if (!identity) {
      return NextResponse.json({ success: false, message: "근로자 정보가 없습니다. 앱을 다시 열어주세요." }, { status: 400 });
    }

    const supabase = serviceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, message: "환경변수 없음" }, { status: 500 });
    }

    const employee = await findWorker(supabase, identity);

    if (!employee) {
      return NextResponse.json({ success: false, message: "근로자를 확인할 수 없습니다." }, { status: 404 });
    }

    if (employee.is_active === false) {
      return NextResponse.json({ success: false, message: "비활성 근로자입니다. 관리자에게 문의하세요." }, { status: 403 });
    }

    return await handler({ supabase, employee, body });
  } catch (error) {
    console.error("[econtract]", error instanceof Error ? error.message : String(error));

    return NextResponse.json({ success: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/**
 * 주민번호 칸.
 * 앱에는 가린 값(900101-1******)으로 미리 채워 보냅니다. 근로자가 그대로 두면
 * DB 에 있는 번호를 씁니다. 이름·생년월일·뒤 4자리만 알면 남의 번호 전체를
 * API 로 받아 갈 수 있는 구멍을 막기 위한 것입니다.
 */
export function resolveResidentNumber(
  input: string,
  employee: WorkerEmployee,
  prefillResidentNumber?: unknown
): string {
  const typed = String(input || "").trim();

  // 미리 채운 값의 출처: 직전 계약서 입력값이 있으면 그것, 없으면 직원 정보
  const candidates = [String(prefillResidentNumber ?? ""), employee.resident_number || ""]
    .map(normalizeResidentNumber)
    .filter(Boolean);

  for (const stored of candidates) {
    if (typed && typed === maskResidentNumber(stored)) return stored;
  }

  return typed;
}
