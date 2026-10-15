import { NextResponse } from "next/server";
import { CONTRACT_BUCKET, SIGNED_URL_SECONDS, logContractEvent, serviceClient } from "@/app/lib/contracts/server";
import { CONTRACT_LINK_MAX_FAILURES, hashLinkToken, isValidLinkToken } from "@/app/lib/contracts/downloadLink";

/**
 * 문자 링크(/d/<토큰>)로 서명본 내려받기.
 *   생년월일 6자리가 맞으면 60초짜리 내려받기 주소를 돌려줍니다.
 *   틀린 횟수는 DB 함수(contract_link_verify)가 한 번에 세고, 5번이면 잠급니다.
 *   없는 링크·만료·재발송으로 막힌 링크는 모두 같은 안내를 보여줍니다.
 *   입력한 생년월일은 어디에도 기록하지 않습니다.
 */

const EXPIRED_MESSAGE = "링크가 만료되었거나 더 이상 사용할 수 없습니다. 회사에 문자 재발송을 요청해 주세요.";
const LOCKED_MESSAGE = "생년월일을 5번 잘못 입력해 링크가 잠겼습니다. 회사에 문자 재발송을 요청해 주세요.";

type VerifyRow = { result: "ok" | "wrong" | "locked" | "invalid"; contract_id: number | null; employee_id: number | null; remaining: number };

export async function POST(request: Request) {
  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const token = body.token;
    const birth6 = String(body.birth6 ?? "").trim();

    if (!isValidLinkToken(token)) {
      return NextResponse.json({ success: false, message: EXPIRED_MESSAGE }, { status: 404 });
    }

    // 형식이 틀린 입력은 실패 횟수에 넣지 않습니다.
    if (!/^\d{6}$/.test(birth6)) {
      return NextResponse.json({ success: false, message: "생년월일 6자리를 숫자로 입력해 주세요. (예: 900115)" }, { status: 400 });
    }

    const supabase = serviceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, message: "잠시 후 다시 시도해 주세요." }, { status: 500 });
    }

    const { data, error } = await supabase.rpc("contract_link_verify", {
      p_token_hash: hashLinkToken(token),
      p_birth6: birth6,
      p_max_failures: CONTRACT_LINK_MAX_FAILURES,
    });

    if (error) {
      console.error("[contract-link] 확인 실패:", error.code);
      return NextResponse.json({ success: false, message: "잠시 후 다시 시도해 주세요." }, { status: 500 });
    }

    const row = (Array.isArray(data) ? data[0] : data) as VerifyRow | undefined;

    if (!row || row.result === "invalid") {
      return NextResponse.json({ success: false, message: EXPIRED_MESSAGE }, { status: 404 });
    }

    if (row.result === "locked") {
      if (row.contract_id && row.employee_id) {
        await logContractEvent(supabase, request, {
          contractId: row.contract_id,
          employeeId: row.employee_id,
          eventType: "link_locked",
          actor: "worker",
        });
      }

      return NextResponse.json({ success: false, locked: true, message: LOCKED_MESSAGE }, { status: 423 });
    }

    if (row.result === "wrong") {
      await logContractEvent(supabase, request, {
        contractId: row.contract_id!,
        employeeId: row.employee_id!,
        eventType: "link_verify_failed",
        actor: "worker",
        detail: { remaining: row.remaining },
      });

      return NextResponse.json(
        { success: false, remaining: row.remaining, message: `생년월일이 맞지 않습니다. (${row.remaining}번 남음)` },
        { status: 400 }
      );
    }

    const { data: contract } = await supabase
      .from("employment_contracts")
      .select("id, employee_name, kind, start_date, signed_pdf_path, signed_pdf_sha256")
      .eq("id", row.contract_id!)
      .maybeSingle();

    if (!contract?.signed_pdf_path) {
      return NextResponse.json({ success: false, message: EXPIRED_MESSAGE }, { status: 404 });
    }

    const fileName = `근로계약서_${contract.employee_name}_${contract.start_date}_${contract.kind === "week" ? "1주" : "11개월"}.pdf`;
    const { data: signed, error: urlError } = await supabase.storage
      .from(CONTRACT_BUCKET)
      .createSignedUrl(contract.signed_pdf_path, SIGNED_URL_SECONDS, { download: fileName });

    if (urlError || !signed?.signedUrl) {
      return NextResponse.json({ success: false, message: "내려받기 링크를 만들지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
    }

    await logContractEvent(supabase, request, {
      contractId: contract.id,
      employeeId: row.employee_id!,
      eventType: "link_downloaded",
      actor: "worker",
      documentSha256: contract.signed_pdf_sha256,
    });

    return NextResponse.json({ success: true, url: signed.signedUrl, expiresIn: SIGNED_URL_SECONDS });
  } catch (error) {
    console.error("[contract-link]", error instanceof Error ? error.name : "unknown");

    return NextResponse.json({ success: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
