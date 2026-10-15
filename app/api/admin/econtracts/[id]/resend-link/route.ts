import { NextResponse } from "next/server";
import { isAdminRequest, serviceClient } from "@/app/lib/contracts/server";
import { previewContractLinkTarget, queueContractLinkSms } from "@/app/lib/contracts/downloadLink";

/**
 * 관리자 "문자 재발송" — 서명본 다운로드 링크를 새로 만들어 문자 대기열에 넣습니다.
 *   GET  : 확인창에 보여줄 받는 번호(가린 값)
 *   POST : 재발송. 이전 링크는 막히고(잠긴 링크도 이걸로 풀림), 아직 안 나간 이전 문자는 취소됩니다.
 * 받는 번호는 직원 정보 번호 우선, 없으면 서명 때 적은 번호.
 */
async function readId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const contractId = Number(id);

  return Number.isInteger(contractId) && contractId > 0 ? contractId : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ success: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const contractId = await readId(params);
  const supabase = serviceClient();

  if (!contractId || !supabase) {
    return NextResponse.json({ success: false, message: "계약서를 찾을 수 없습니다." }, { status: 400 });
  }

  const target = await previewContractLinkTarget(supabase, contractId);

  return NextResponse.json(target.ok ? { success: true, phoneMasked: target.phoneMasked } : { success: false, message: target.message });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ success: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const contractId = await readId(params);
  const supabase = serviceClient();

  if (!contractId || !supabase) {
    return NextResponse.json({ success: false, message: "계약서를 찾을 수 없습니다." }, { status: 400 });
  }

  try {
    const result = await queueContractLinkSms(supabase, request, contractId, "resend");

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      phoneMasked: result.phoneMasked,
      message: `${result.phoneMasked} 로 재발송을 요청했습니다. 사무실 PC 워커가 켜져 있으면 1분 안에 나갑니다.`,
    });
  } catch (error) {
    console.error("[resend-link]", error instanceof Error ? error.name : "unknown");

    return NextResponse.json({ success: false, message: "재발송 요청 중 오류가 발생했습니다." }, { status: 500 });
  }
}
