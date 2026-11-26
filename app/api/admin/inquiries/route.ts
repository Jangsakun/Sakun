import { NextResponse } from "next/server";
import { isAdminRequest, serviceClient } from "@/app/lib/contracts/server";
import { photoPathsOf, signInquiryPhotos } from "@/app/lib/inquiryPhotos";

/**
 * 관리자 "문의사항" 탭.
 *   GET  — 문의 목록(최근 300건) + 답변 대기 수
 *   POST — 답변 저장/수정 { id, answer }. 답변을 바꾸면 근로자에게 다시 "새 답변"으로 보입니다.
 */

const MAX_ANSWER = 2000;

function notReady(message: string) {
  return /worker_inquiries/.test(message) && /(does not exist|schema cache|Could not find)/i.test(message);
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ success: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const supabase = serviceClient();

  if (!supabase) {
    return NextResponse.json({ success: false, message: "환경변수 없음" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("worker_inquiries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    return NextResponse.json(
      {
        success: false,
        notReady: notReady(error.message),
        message: notReady(error.message)
          ? "문의사항 테이블이 아직 없습니다. Supabase SQL Editor 에서 20261126100000_worker_inquiries.sql 을 실행해주세요."
          : "문의 목록을 불러오지 못했습니다.",
      },
      { status: 500 }
    );
  }

  const rows = data ?? [];
  const urls = await signInquiryPhotos(supabase, rows.flatMap(photoPathsOf));

  return NextResponse.json({
    success: true,
    pendingCount: rows.filter((r) => !r.answer).length,
    inquiries: rows.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      employeeName: r.employee_name,
      workplaceName: r.workplace_name,
      message: r.message,
      photos: photoPathsOf(r).map((p) => urls.get(p)).filter(Boolean),
      answer: r.answer,
      answeredAt: r.answered_at,
      answerReadAt: r.answer_read_at,
      createdAt: r.created_at,
    })),
  });
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ success: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const supabase = serviceClient();

  if (!supabase) {
    return NextResponse.json({ success: false, message: "환경변수 없음" }, { status: 500 });
  }

  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const id = Number(body.id);
  const answer = String(body.answer ?? "").trim();

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ success: false, message: "문의 번호가 올바르지 않습니다." }, { status: 400 });
  }

  if (!answer) {
    return NextResponse.json({ success: false, message: "답변 내용을 입력해주세요." }, { status: 400 });
  }

  if (answer.length > MAX_ANSWER) {
    return NextResponse.json({ success: false, message: `답변은 ${MAX_ANSWER}자까지 쓸 수 있습니다.` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("worker_inquiries")
    .update({ answer, answered_at: new Date().toISOString(), answer_read_at: null })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ success: false, message: "답변을 저장하지 못했습니다." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ success: false, message: "문의를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
