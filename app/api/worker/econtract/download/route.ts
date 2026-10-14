import { NextResponse } from "next/server";
import { withWorker } from "@/app/lib/contracts/workerRoute";
import { CONTRACT_BUCKET, SIGNED_URL_SECONDS, logContractEvent } from "@/app/lib/contracts/server";

/**
 * 내 계약서 PDF 내려받기. 본인 계약서가 아니면 "없음"으로 답합니다.
 * 비공개 저장소의 60초짜리 서명 URL 만 돌려줍니다.
 */
export async function POST(request: Request) {
  return withWorker(request, async ({ supabase, employee, body }) => {
    const contractId = Number(body.contractId);

    if (!Number.isInteger(contractId) || contractId <= 0) {
      return NextResponse.json({ success: false, message: "계약서를 찾을 수 없습니다." }, { status: 400 });
    }

    const { data: contract } = await supabase
      .from("employment_contracts")
      .select("id, employee_id, kind, start_date, signed_pdf_path, signed_pdf_sha256")
      .eq("id", contractId)
      .maybeSingle();

    if (!contract || contract.employee_id !== employee.id || !contract.signed_pdf_path) {
      return NextResponse.json({ success: false, message: "계약서를 찾을 수 없습니다." }, { status: 404 });
    }

    const fileName = `근로계약서_${employee.name}_${contract.start_date}_${contract.kind === "week" ? "1주" : "11개월"}.pdf`;
    const { data, error } = await supabase.storage
      .from(CONTRACT_BUCKET)
      .createSignedUrl(contract.signed_pdf_path, SIGNED_URL_SECONDS, { download: fileName });

    if (error || !data?.signedUrl) {
      return NextResponse.json({ success: false, message: "내려받기 링크를 만들지 못했습니다." }, { status: 500 });
    }

    await logContractEvent(supabase, request, {
      contractId,
      employeeId: employee.id,
      eventType: "pdf_downloaded",
      actor: "worker",
      documentSha256: contract.signed_pdf_sha256,
    });

    return NextResponse.json({ success: true, url: data.signedUrl, expiresIn: SIGNED_URL_SECONDS });
  });
}
