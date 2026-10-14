import { NextResponse } from "next/server";
import { withWorker } from "@/app/lib/contracts/workerRoute";
import { issuesForClient, prepareContract } from "@/app/lib/contracts/prepare";
import { renderContractPdf, sha256Hex } from "@/app/lib/contracts/renderPdf";
import { CONTRACT_FONT_PATH, readAsset } from "@/app/lib/contracts/assets";

/**
 * 계약서 미리보기(서명 전).
 * 서버가 다시 검사하고, 차단 항목이 하나라도 있으면 PDF 를 만들지 않습니다.
 * 직인은 서명 확정 때만 찍습니다(미리보기 PDF 가 서명본처럼 쓰이지 않도록).
 */
export async function POST(request: Request) {
  return withWorker(request, async ({ supabase, employee, body }) => {
    const contractId = Number(body.contractId);

    if (!Number.isInteger(contractId) || contractId <= 0) {
      return NextResponse.json({ success: false, message: "계약서를 찾을 수 없습니다." }, { status: 400 });
    }

    const result = await prepareContract(supabase, employee, contractId, body.input);

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status });
    }

    const { prepared } = result;

    if (!prepared.validation.ok || !prepared.renderValues) {
      return NextResponse.json(
        { success: false, message: "고쳐야 할 칸이 있습니다.", ...issuesForClient(prepared.validation) },
        { status: 400 }
      );
    }

    const pdf = await renderContractPdf({
      template: prepared.template,
      templateBytes: readAsset(prepared.templateRow.file_path),
      fontBytes: readAsset(CONTRACT_FONT_PATH),
      values: prepared.renderValues,
    });

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
        "X-Document-Sha256": sha256Hex(pdf),
        "X-Contract-End-Date": prepared.validation.derived.endDate ?? "",
        "X-Warning-Codes": prepared.validation.warnings.map((w) => w.code).join(","),
      },
    });
  });
}
