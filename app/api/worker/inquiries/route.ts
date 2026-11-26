import { NextResponse } from "next/server";
import { serviceClient } from "@/app/lib/contracts/server";

/**
 * 근로자 문의사항(본인 것만).
 *   action "list"   — 내 문의 목록 + 새 답변 수
 *   action "summary" — 새 답변 수만(출퇴근 화면 표시용)
 *   action "create" — 문의 남기기 { message }
 *   action "read"   — 답변 확인 처리(목록을 연 뒤 호출)
 *
 * 근로자 확인은 이 휴대폰에 연결된 기기 ID 로 합니다(이름·생년월일만으로 남의 문의를 볼 수 없게).
 */

const MAX_MESSAGE = 1000;
const MAX_OPEN_PER_DAY = 10;

function notReady(message: string) {
  return /worker_inquiries/.test(message) && /(does not exist|schema cache|Could not find)/i.test(message);
}

export async function POST(request: Request) {
  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const deviceId = String(body.deviceId ?? "").trim();
    const action = String(body.action ?? "list");

    if (!deviceId) {
      return NextResponse.json({ success: false, message: "기기 정보가 없습니다. 출퇴근 화면에서 다시 열어주세요." }, { status: 400 });
    }

    const supabase = serviceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, message: "환경변수 없음" }, { status: 500 });
    }

    const { data: devices } = await supabase
      .from("employee_devices")
      .select("employee_id, employees(id, name, workplace_name, is_active)")
      .eq("device_id", deviceId)
      .limit(2);

    if (!devices || devices.length !== 1) {
      return NextResponse.json({ success: false, message: "연결된 근로자를 찾을 수 없습니다. 출퇴근 화면에서 다시 열어주세요." }, { status: 404 });
    }

    const raw = devices[0].employees as unknown;
    const employee = (Array.isArray(raw) ? raw[0] : raw) as { id: number; name: string; workplace_name: string | null; is_active: boolean | null } | null;

    if (!employee) {
      return NextResponse.json({ success: false, message: "연결된 근로자를 찾을 수 없습니다." }, { status: 404 });
    }

    if (employee.is_active === false) {
      return NextResponse.json({ success: false, message: "비활성 근로자입니다. 관리자에게 직접 문의해주세요." }, { status: 403 });
    }

    if (action === "create") {
      const message = String(body.message ?? "").trim();

      if (!message) {
        return NextResponse.json({ success: false, message: "문의 내용을 입력해주세요." }, { status: 400 });
      }

      if (message.length > MAX_MESSAGE) {
        return NextResponse.json({ success: false, message: `문의는 ${MAX_MESSAGE}자까지 쓸 수 있습니다.` }, { status: 400 });
      }

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await supabase
        .from("worker_inquiries")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", employee.id)
        .gte("created_at", since);

      if (countError) {
        return NextResponse.json(
          { success: false, message: notReady(countError.message) ? "문의사항 기능을 준비 중입니다." : "문의를 저장하지 못했습니다." },
          { status: 500 }
        );
      }

      if ((count ?? 0) >= MAX_OPEN_PER_DAY) {
        return NextResponse.json({ success: false, message: "하루에 남길 수 있는 문의 수를 넘었습니다. 내일 다시 남기거나 관리자에게 직접 문의해주세요." }, { status: 429 });
      }

      const { error } = await supabase.from("worker_inquiries").insert({
        employee_id: employee.id,
        employee_name: employee.name,
        workplace_name: employee.workplace_name,
        message,
      });

      if (error) {
        return NextResponse.json(
          { success: false, message: notReady(error.message) ? "문의사항 기능을 준비 중입니다." : "문의를 저장하지 못했습니다." },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, message: "문의가 접수되었습니다. 관리자가 확인 후 답변드립니다." });
    }

    if (action === "read") {
      await supabase
        .from("worker_inquiries")
        .update({ answer_read_at: new Date().toISOString() })
        .eq("employee_id", employee.id)
        .not("answer", "is", null)
        .is("answer_read_at", null);

      return NextResponse.json({ success: true });
    }

    if (action === "summary") {
      const { count, error } = await supabase
        .from("worker_inquiries")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", employee.id)
        .not("answer", "is", null)
        .is("answer_read_at", null);

      return NextResponse.json({ success: !error, unreadAnswers: count ?? 0 });
    }

    const { data, error } = await supabase
      .from("worker_inquiries")
      .select("id, message, answer, answered_at, answer_read_at, created_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json(
        { success: false, message: notReady(error.message) ? "문의사항 기능을 준비 중입니다." : "문의 목록을 불러오지 못했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      inquiries: (data ?? []).map((row) => ({
        id: row.id,
        message: row.message,
        answer: row.answer,
        answeredAt: row.answered_at,
        isNewAnswer: !!row.answer && !row.answer_read_at,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error("[inquiries]", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ success: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
