import { NextResponse } from "next/server";
import {
  CONTRACT_BUCKET,
  SIGNED_URL_SECONDS,
  isAdminRequest,
  logContractEvent,
  serviceClient,
} from "@/app/lib/contracts/server";

/**
 * 서명본 PDF 열람 링크. 비공개 저장소의 파일을 60초짜리 서명 URL 로만 엽니다.
 * ?download=1 이면 내려받기 링크를 줍니다.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ success: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const contractId = Number(id);

  if (!Number.isInteger(contractId) || contractId <= 0) {
    return NextResponse.json({ success: false, message: "계약서를 찾을 수 없습니다." }, { status: 400 });
  }

  const supabase = serviceClient();

  if (!supabase) {
    return NextResponse.json({ success: false, message: "환경변수 없음" }, { status: 500 });
  }

  const { data: contract } = await supabase
    .from("employment_contracts")
    .select("id, employee_id, employee_name, kind, start_date, signed_pdf_path, signed_pdf_sha256")
    .eq("id", contractId)
    .maybeSingle();

  if (!contract) {
    return NextResponse.json({ success: false, message: "계약서를 찾을 수 없습니다." }, { status: 404 });
  }

  if (!contract.signed_pdf_path) {
    return NextResponse.json({ success: false, message: "아직 서명되지 않은 계약서입니다." }, { status: 409 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const fileName = `근로계약서_${contract.employee_name}_${contract.start_date}_${contract.kind === "week" ? "1주" : "11개월"}.pdf`;

  const { data, error } = await supabase.storage
    .from(CONTRACT_BUCKET)
    .createSignedUrl(contract.signed_pdf_path, SIGNED_URL_SECONDS, download ? { download: fileName } : undefined);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ success: false, message: `링크 생성 실패: ${error?.message ?? ""}` }, { status: 500 });
  }

  await logContractEvent(supabase, request, {
    contractId,
    employeeId: contract.employee_id,
    eventType: "pdf_downloaded",
    actor: "admin-ui",
    detail: { download },
    documentSha256: contract.signed_pdf_sha256,
  });

  return NextResponse.json({ success: true, url: data.signedUrl, expiresIn: SIGNED_URL_SECONDS });
}
