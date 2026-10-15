import type { SupabaseClient } from "@supabase/supabase-js";

// 서버 전용. 문자 발송 대기열(sms_outbox)에 적기.
//
// 근태 앱은 문자를 직접 보내지 않습니다. 대기열에 적어 두면 사무실 PC 워커(sms-worker/)가
// 가져가 뿌리오로 보냅니다(뿌리오는 등록된 IP 에서만 발송을 받음).
// 새 용도(만료 안내, 급여명세서 등)는 purpose 값만 새로 정해서 enqueueSms 를 부르면 됩니다.

/** 뿌리오 한도: SMS 90바이트, LMS 2000바이트, 제목 30자 (2026-10-15 뿌리오 문서) */
export const SMS_MAX_BYTES = 90;
export const LMS_MAX_BYTES = 2000;
export const LMS_SUBJECT_MAX_CHARS = 30;

/** 휴대폰 번호 → 숫자만(01012345678). 휴대폰 번호가 아니면 null */
export function normalizeMobile(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");

  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null;
}

/** 010-****-1234 */
export function maskMobile(digits: string): string {
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

/** 문자 바이트 수(통신사 기준: 한글 등 2바이트, 영문·숫자 1바이트) */
export function smsByteLength(text: string): number {
  let bytes = 0;

  for (const ch of text) bytes += ch.charCodeAt(0) > 0x7f ? 2 : 1;

  return bytes;
}

export function chooseMessageType(content: string): "SMS" | "LMS" {
  return smsByteLength(content) <= SMS_MAX_BYTES ? "SMS" : "LMS";
}

export type EnqueueInput = {
  purpose: string;
  dedupeKey: string;
  to: string;
  content: string;
  subject?: string;
  refTable?: string;
  refId?: number;
  employeeId?: number;
  createdBy: "system" | "admin-ui";
};

export type EnqueueResult =
  | { ok: true; id: number; phoneMasked: string; messageType: "SMS" | "LMS" }
  | { ok: false; reason: "no_phone" | "too_long" | "duplicate" | "db_error"; message: string };

export async function enqueueSms(supabase: SupabaseClient, input: EnqueueInput): Promise<EnqueueResult> {
  const to = normalizeMobile(input.to);

  if (!to) return { ok: false, reason: "no_phone", message: "휴대폰 번호가 없거나 올바르지 않습니다." };

  if (smsByteLength(input.content) > LMS_MAX_BYTES) {
    return { ok: false, reason: "too_long", message: "문자 내용이 너무 깁니다." };
  }

  const messageType = chooseMessageType(input.content);
  const phoneMasked = maskMobile(to);

  const { data, error } = await supabase
    .from("sms_outbox")
    .insert({
      purpose: input.purpose,
      dedupe_key: input.dedupeKey,
      ref_table: input.refTable ?? null,
      ref_id: input.refId ?? null,
      employee_id: input.employeeId ?? null,
      message_type: messageType,
      subject: messageType === "LMS" && input.subject ? [...input.subject].slice(0, LMS_SUBJECT_MAX_CHARS).join("") : null,
      content: input.content,
      to_phone: to,
      to_phone_masked: phoneMasked,
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, reason: "duplicate", message: "이미 발송 요청된 문자입니다." };

    // 번호·본문이 들어갈 수 있으므로 DB 오류 원문은 남기지 않고 코드만 남깁니다.
    console.error(`[sms] 대기열 저장 실패 purpose=${input.purpose} code=${error.code}`);

    return { ok: false, reason: "db_error", message: "문자 대기열 저장에 실패했습니다." };
  }

  return { ok: true, id: data.id as number, phoneMasked, messageType };
}

/** 같은 대상(purpose + ref_id)으로 아직 안 나간 문자를 취소합니다(재발송 시 이전 문자 정리). */
export async function cancelQueuedSms(supabase: SupabaseClient, purpose: string, refId: number, exceptId: number) {
  await supabase
    .from("sms_outbox")
    .update({
      status: "cancelled",
      to_phone: null,
      content: null,
      finished_at: new Date().toISOString(),
      result_message: "재발송으로 취소",
    })
    .eq("purpose", purpose)
    .eq("ref_id", refId)
    .eq("status", "queued")
    .neq("id", exceptId);
}
