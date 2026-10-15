import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelQueuedSms, enqueueSms, maskMobile, normalizeMobile } from "@/app/lib/sms/outbox";
import { logContractEvent } from "./server";

// 서버 전용. 서명 완료 계약서 → 근로자에게 서명본 다운로드 링크 문자.
//
//   링크: https://sakun.kr/d/<토큰 22자>
//   DB 에는 토큰의 SHA-256 만 저장합니다(DB 가 새도 링크를 만들 수 없음).
//   30일 유효, 생년월일 6자리 5회 틀리면 잠김, 재발송하면 이전 링크는 막힘.
//   문자에는 이름·생년월일 등 개인정보를 넣지 않습니다.

export const CONTRACT_LINK_PURPOSE = "contract_signed_link";
export const CONTRACT_LINK_DAYS = 30;
export const CONTRACT_LINK_MAX_FAILURES = 5;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function appPublicUrl() {
  return (process.env.APP_PUBLIC_URL || "https://sakun.kr").replace(/\/+$/, "");
}

export function isValidLinkToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

export function hashLinkToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** 계약 명의 짧은 이름. short_name 이 없으면 상호에서 (주)·주식회사를 뺀 이름 */
export function entityShortName(entity: { short_name?: string | null; business_name?: string | null } | null) {
  if (entity?.short_name?.trim()) return entity.short_name.trim();

  const name = String(entity?.business_name ?? "")
    .replace(/\(주\)|㈜|주식회사/g, "")
    .trim();

  return name || "장사꾼";
}

export function buildContractLinkMessage(shortName: string, url: string) {
  return [
    `[${shortName}] 근로계약서 서명이 완료되었습니다.`,
    "아래 링크에서 서명본(PDF)을 받으실 수 있습니다.",
    "- 생년월일 6자리 확인 후 열림",
    `- ${CONTRACT_LINK_DAYS}일간 유효`,
    url,
  ].join("\n");
}

type ContractForLink = {
  id: number;
  employee_id: number;
  status: string;
  signed_pdf_path: string | null;
  input_snapshot: { phone?: string } | null;
  entity: { short_name: string | null; business_name: string | null } | null;
};

async function loadContract(supabase: SupabaseClient, contractId: number) {
  const { data } = await supabase
    .from("employment_contracts")
    .select("id, employee_id, status, signed_pdf_path, input_snapshot, entity:contract_entities(short_name, business_name)")
    .eq("id", contractId)
    .maybeSingle();

  return (data as unknown as ContractForLink | null) ?? null;
}

/** 받는 번호: 직원 정보 번호 우선, 없으면 서명 때 적은 번호 */
async function resolvePhone(supabase: SupabaseClient, contract: ContractForLink) {
  const { data: employee } = await supabase.from("employees").select("phone").eq("id", contract.employee_id).maybeSingle();

  return normalizeMobile(employee?.phone) ?? normalizeMobile(contract.input_snapshot?.phone);
}

export type LinkSmsResult =
  | { ok: true; outboxId: number; phoneMasked: string }
  | { ok: false; message: string };

/** 관리자 재발송 확인창에 보여줄 가린 번호 */
export async function previewContractLinkTarget(supabase: SupabaseClient, contractId: number) {
  const contract = await loadContract(supabase, contractId);

  if (!contract) return { ok: false as const, message: "계약서를 찾을 수 없습니다." };

  const phone = await resolvePhone(supabase, contract);

  return phone ? { ok: true as const, phoneMasked: maskMobile(phone) } : { ok: false as const, message: "직원 정보와 서명본 모두에 휴대폰 번호가 없습니다." };
}

/**
 * 링크를 새로 만들고 문자를 대기열에 넣습니다.
 *   mode "auto"   : 서명 직후 1회(같은 계약서로 두 번 들어오면 DB 가 거부)
 *   mode "resend" : 관리자 재발송. 이전 링크는 막고, 아직 안 나간 이전 문자는 취소합니다.
 *
 * 순서: 새 링크 저장 → 문자 대기열 → (성공 시) 이전 링크·문자 정리.
 * 문자 대기열이 실패하면 새 링크를 바로 막아 "보내지 않은 유효 링크"가 남지 않게 합니다.
 */
export async function queueContractLinkSms(
  supabase: SupabaseClient,
  request: Request | null,
  contractId: number,
  mode: "auto" | "resend"
): Promise<LinkSmsResult> {
  const actor = mode === "auto" ? "system" : "admin-ui";
  const contract = await loadContract(supabase, contractId);

  if (!contract || !contract.signed_pdf_path || !["signed", "ended"].includes(contract.status)) {
    return { ok: false, message: "서명본이 있는 계약서가 아닙니다." };
  }

  const fail = async (message: string, reason: string) => {
    await logContractEvent(supabase, request, {
      contractId,
      employeeId: contract.employee_id,
      eventType: "sms_queue_failed",
      actor,
      detail: { reason, mode },
    });

    return { ok: false as const, message };
  };

  const phone = await resolvePhone(supabase, contract);

  if (!phone) return fail("직원 정보와 서명본 모두에 휴대폰 번호가 없습니다.", "no_phone");

  const token = randomBytes(16).toString("base64url");
  const expiresAt = new Date(Date.now() + CONTRACT_LINK_DAYS * 86400000);

  const { data: link, error: linkError } = await supabase
    .from("contract_download_links")
    .insert({
      contract_id: contractId,
      employee_id: contract.employee_id,
      token_hash: hashLinkToken(token),
      expires_at: expiresAt.toISOString(),
      created_by: actor,
    })
    .select("id")
    .single();

  if (linkError || !link) return fail("다운로드 링크를 만들지 못했습니다.", "link_insert");

  let dedupeKey = `${CONTRACT_LINK_PURPOSE}:${contractId}:auto`;

  if (mode === "resend") {
    // 동시에 두 번 눌러도 같은 회차 번호가 나와 DB 가 하나를 거부합니다.
    const { count } = await supabase
      .from("sms_outbox")
      .select("id", { count: "exact", head: true })
      .eq("purpose", CONTRACT_LINK_PURPOSE)
      .eq("ref_id", contractId);

    dedupeKey = `${CONTRACT_LINK_PURPOSE}:${contractId}:resend:${count ?? 0}`;
  }

  const queued = await enqueueSms(supabase, {
    purpose: CONTRACT_LINK_PURPOSE,
    dedupeKey,
    to: phone,
    subject: "근로계약서 서명본 안내",
    content: buildContractLinkMessage(entityShortName(contract.entity), `${appPublicUrl()}/d/${token}`),
    refTable: "employment_contracts",
    refId: contractId,
    employeeId: contract.employee_id,
    createdBy: actor,
  });

  if (!queued.ok) {
    await supabase.from("contract_download_links").update({ revoked_at: new Date().toISOString() }).eq("id", link.id);

    return fail(queued.reason === "duplicate" ? "이미 발송 요청이 들어가 있습니다. 잠시 후 새로고침해 주세요." : queued.message, queued.reason);
  }

  // 이전 링크 막기 + 아직 안 나간 이전 문자 취소
  await supabase
    .from("contract_download_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("contract_id", contractId)
    .is("revoked_at", null)
    .neq("id", link.id);

  if (mode === "resend") await cancelQueuedSms(supabase, CONTRACT_LINK_PURPOSE, contractId, queued.id);

  await logContractEvent(supabase, request, {
    contractId,
    employeeId: contract.employee_id,
    eventType: "sms_queued",
    actor,
    detail: { outboxId: queued.id, linkId: link.id, mode, messageType: queued.messageType },
  });

  return { ok: true, outboxId: queued.id, phoneMasked: queued.phoneMasked };
}
