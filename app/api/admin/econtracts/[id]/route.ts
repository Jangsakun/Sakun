import { NextResponse } from "next/server";
import { isAdminRequest, serviceClient } from "@/app/lib/contracts/server";

/**
 * 서명대기 계약서 삭제(테스트로 생긴 서명대기 정리용, 2026-10-15).
 *
 * 서명대기만 지웁니다. 서명 완료·종료·무효 계약서는 DB 함수와 보호 트리거가 모두 거부합니다
 * (서명본은 지우지 않고 "무효"로 처리하는 것이 원칙).
 * 실제 지우기는 DB 함수 delete_pending_contract 가 계약서와 그 기록을 한 번에 처리합니다.
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

  const { data, error } = await supabase.rpc("delete_pending_contract", { p_contract_id: contractId });

  if (error) {
    // 함수가 아직 없으면(마이그레이션 미실행) PostgREST 가 PGRST202 를 돌려줍니다.
    if (error.code === "PGRST202") {
      return NextResponse.json(
        { success: false, message: "삭제 기능 DB 설정이 아직 안 됐습니다. 20261015100000 SQL 을 먼저 실행해주세요." },
        { status: 503 }
      );
    }

    if (error.code === "P0002") {
      return NextResponse.json({ success: false, message: "이미 삭제됐거나 없는 계약서입니다. 새로고침해주세요." }, { status: 404 });
    }

    if (error.code === "42501") {
      return NextResponse.json(
        { success: false, message: "서명대기 계약서만 삭제할 수 있습니다. 서명된 계약서는 무효 처리하세요." },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: false, message: `삭제 실패: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "서명대기 계약서를 삭제했습니다.", deleted: data });
}
