import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// 서버 전용. 현장 직원 PIN (2026-10-27).
//   관리자가 관리자 화면에서 설정하고, 근로자 계약서 화면에서 현장 직원이 입력해 당근 → 고정 전환에 씁니다.
//   DB(app_secrets)에는 scrypt 해시만 저장합니다. 원래 PIN 은 어디에도 남기지 않습니다(로그 포함).

export const FIELD_PIN_KEY = "field_staff_pin";
export const FIELD_PIN_PATTERN = /^\d{4,8}$/;

/** 직원별 15분에 5번, 전체 15분에 20번 틀리면 막습니다. */
const WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_EMPLOYEE = 5;
const MAX_FAILURES_TOTAL = 20;

export function hashFieldPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");

  return `scrypt$${salt}$${hash}`;
}

export function verifyFieldPin(pin: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");

  if (scheme !== "scrypt" || !salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(pin, salt, expected.length);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function loadFieldPinHash(supabase: SupabaseClient) {
  const { data } = await supabase.from("app_secrets").select("value_hash, updated_at").eq("key", FIELD_PIN_KEY).maybeSingle();

  return data as { value_hash: string; updated_at: string } | null;
}

/** 지금 막혀 있으면 안내 문구, 아니면 null */
export async function fieldPinLockReason(supabase: SupabaseClient, employeeId: number) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60000).toISOString();

  const [mine, total] = await Promise.all([
    supabase
      .from("field_pin_attempts")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId)
      .eq("success", false)
      .gte("created_at", since),
    supabase.from("field_pin_attempts").select("id", { count: "exact", head: true }).eq("success", false).gte("created_at", since),
  ]);

  if ((mine.count ?? 0) >= MAX_FAILURES_PER_EMPLOYEE || (total.count ?? 0) >= MAX_FAILURES_TOTAL) {
    return `PIN 을 여러 번 잘못 입력해 ${WINDOW_MINUTES}분 동안 전환할 수 없습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.`;
  }

  return null;
}

export async function recordFieldPinAttempt(
  supabase: SupabaseClient,
  employeeId: number,
  success: boolean,
  requestIp: string | null
) {
  await supabase.from("field_pin_attempts").insert({ employee_id: employeeId, success, request_ip: requestIp });
}

/** 남은 시도 횟수(직원 기준) */
export async function remainingFieldPinTries(supabase: SupabaseClient, employeeId: number) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60000).toISOString();
  const { count } = await supabase
    .from("field_pin_attempts")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .eq("success", false)
    .gte("created_at", since);

  return Math.max(MAX_FAILURES_PER_EMPLOYEE - (count ?? 0), 0);
}
