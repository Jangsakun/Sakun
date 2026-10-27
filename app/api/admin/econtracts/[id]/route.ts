import { NextResponse } from "next/server";
import { CONTRACT_BUCKET, isAdminRequest, serviceClient } from "@/app/lib/contracts/server";

/**
 * 계약서 삭제.
 *   서명대기(2026-10-15): 테스트로 생긴 서명대기 정리용. DB 함수 delete_pending_contract.
 *   무효(2026-10-27 사용자 결정): DB 함수 delete_void_contract — 계약서·서명 증거 기록·다운로드 링크·문자 기록을
 *     한 번에 지우고, 저장소의 서명본 PDF·서명 이미지는 여기서 지웁니다. 되돌릴 수 없습니다.
 *   서명 완료·종료 계약서는 DB 함수와 보호 트리거가 모두 거부합니다(지금처럼 무효 처리만 가능).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { data: contract } = await supabase.from("employment_contracts").select("id, status").eq("id", contractId).maybeSingle();

  if (!contract) {
    return NextResponse.json({ success: false, message: "이미 삭제됐거나 없는 계약서입니다. 새로고침해주세요." }, { status: 404 });
  }

  const isVoid = contract.status === "void";
  const fn = isVoid ? "delete_void_contract" : "delete_pending_contract";
  const { data, error } = await supabase.rpc(fn, { p_contract_id: contractId });

  if (error) {
    // 함수가 아직 없으면(마이그레이션 미실행) PostgREST 가 PGRST202 를 돌려줍니다.
    if (error.code === "PGRST202") {
      return NextResponse.json(
        {
          success: false,
          message: `삭제 기능 DB 설정이 아직 안 됐습니다. ${isVoid ? "20261027100000" : "20261015100000"} SQL 을 먼저 실행해주세요.`,
        },
        { status: 503 }
      );
    }

    if (error.code === "P0002") {
      return NextResponse.json({ success: false, message: "이미 삭제됐거나 없는 계약서입니다. 새로고침해주세요." }, { status: 404 });
    }

    if (error.code === "42501") {
      return NextResponse.json(
        { success: false, message: "서명대기·무효 계약서만 삭제할 수 있습니다. 서명된 계약서는 먼저 무효 처리하세요." },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: false, message: `삭제 실패: ${error.message}` }, { status: 500 });
  }

  if (!isVoid) {
    return NextResponse.json({ success: true, message: "서명대기 계약서를 삭제했습니다.", deleted: data });
  }

  // 무효 계약서의 서명본 PDF·서명 이미지 지우기. 실패해도 계약서는 이미 지워졌으므로 안내만 합니다.
  const files = ((data as { files?: (string | null)[] } | null)?.files ?? []).filter((f): f is string => Boolean(f));
  let filesRemoved = true;

  if (files.length > 0) {
    const { error: storageError } = await supabase.storage.from(CONTRACT_BUCKET).remove(files);

    if (storageError) {
      filesRemoved = false;
      console.error(`[econtract] 무효 계약서 ${contractId} 파일 삭제 실패:`, storageError.message);
    }
  }

  return NextResponse.json({
    success: true,
    message: filesRemoved
      ? "무효 계약서를 삭제했습니다."
      : "무효 계약서를 삭제했습니다. (저장된 PDF 파일 정리는 실패했습니다 — 관리자에게 알려주세요)",
    deleted: data,
  });
}
