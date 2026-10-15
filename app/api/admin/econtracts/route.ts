import { NextResponse } from "next/server";
import { findWeekStreaks, isAdminRequest, serviceClient } from "@/app/lib/contracts/server";
import { CONTRACT_LINK_PURPOSE } from "@/app/lib/contracts/downloadLink";

/**
 * 관리자 "전자계약" 화면 데이터.
 *   계약서 목록(과거 포함), 서명 대기, 1주 연속 계약 경고, 연도별 최저시급
 *
 * 주민번호는 가린 값(900101-1******)만 내려보냅니다. 암호문·서명 이미지 경로는 보내지 않습니다.
 */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ success: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const supabase = serviceClient();

  if (!supabase) {
    return NextResponse.json({ success: false, message: "환경변수 없음" }, { status: 500 });
  }

  const [contracts, wages, smsRows, linkRows] = await Promise.all([
    supabase
      .from("employment_contracts")
      .select(
        `id, employee_id, employee_name, workplace_name, kind, status, trigger_reason,
         start_date, end_date, signed_at, signed_pdf_sha256, void_reason, voided_at, ended_at, created_at,
         resident_number_masked:input_snapshot->>residentNumberMasked,
         entity:contract_entities(business_name),
         template:contract_templates(code, title)`
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(0, 4999),
    supabase.from("minimum_wages").select("year, hourly_wage, note, updated_at").order("year", { ascending: false }),
    // 서명본 링크 문자 상태(계약서별 최신 1건). 문자 마이그레이션 전이면 오류 → 빈 값으로 둡니다.
    supabase
      .from("sms_outbox")
      .select("id, ref_id, status, result_code, result_message, to_phone_masked, dry_run, created_at, sent_at")
      .eq("purpose", CONTRACT_LINK_PURPOSE)
      .order("id", { ascending: false })
      .range(0, 9999),
    supabase
      .from("contract_download_links")
      .select("contract_id, expires_at, locked_at, revoked_at, failed_attempts, last_used_at")
      .order("id", { ascending: false })
      .range(0, 9999),
  ]);

  if (contracts.error) {
    return NextResponse.json({ success: false, message: `계약서 조회 실패: ${contracts.error.message}` }, { status: 500 });
  }

  if (wages.error) {
    return NextResponse.json({ success: false, message: `최저시급 조회 실패: ${wages.error.message}` }, { status: 500 });
  }

  const rows = (contracts.data ?? []) as unknown as {
    employee_id: number;
    employee_name: string;
    kind: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
  }[];

  const latestSms = new Map<number, unknown>();
  for (const sms of smsRows.error ? [] : smsRows.data ?? []) {
    if (sms.ref_id != null && !latestSms.has(sms.ref_id)) latestSms.set(sms.ref_id, sms);
  }

  const latestLink = new Map<number, unknown>();
  for (const link of linkRows.error ? [] : linkRows.data ?? []) {
    if (!latestLink.has(link.contract_id)) latestLink.set(link.contract_id, link);
  }

  const withSms = (rows as unknown as { id: number }[]).map((row) => ({
    ...row,
    sms: latestSms.get(row.id) ?? null,
    link: latestLink.get(row.id) ?? null,
  }));

  return NextResponse.json({
    success: true,
    smsReady: !smsRows.error,
    contracts: withSms,
    pending: rows.filter((r) => r.status === "pending"),
    weekStreaks: findWeekStreaks(rows),
    minimumWages: wages.data ?? [],
  });
}
