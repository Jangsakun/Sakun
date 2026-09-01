import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 매일 1회 DB 용량 스냅샷을 남기는 엔드포인트.
//
// pg_cron(supabase/migrations 의 SQL)을 쓰면 이 라우트는 필요 없습니다.
// pg_cron 을 못 쓰는 경우에만 외부 스케줄러(Vercel Cron / cron-job.org 등)로
// 매일 KST 10:00(= UTC 01:00)에 호출하세요.
//
// 인증: Authorization: Bearer <CRON_SECRET>  또는  ?key=<CRON_SECRET>
// CRON_SECRET 이 설정돼 있지 않으면 호출을 거부합니다.

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest, cronSecret: string) {
  const bearer = request.headers.get("authorization");

  if (bearer === `Bearer ${cronSecret}`) return true;

  return new URL(request.url).searchParams.get("key") === cronSecret;
}

async function recordSnapshot(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      {
        success: false,
        message:
          "CRON_SECRET 환경변수가 없습니다. 설정 후 다시 호출하세요. (pg_cron 을 쓰는 경우 이 라우트는 필요 없습니다.)",
      },
      { status: 500 }
    );
  }

  if (!isAuthorized(request, cronSecret)) {
    return NextResponse.json(
      { success: false, message: "인증 실패" },
      { status: 401 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { success: false, message: "Supabase 환경변수 없음" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("record_db_size_snapshot");

  if (error) {
    console.error("db-size snapshot cron error:", error.message);

    return NextResponse.json(
      {
        success: false,
        message:
          "스냅샷 기록 실패 (record_db_size_snapshot RPC 없음일 수 있습니다. supabase/migrations 의 SQL을 먼저 실행하세요.)",
        debug: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, snapshot: data });
}

export async function GET(request: NextRequest) {
  try {
    return await recordSnapshot(request);
  } catch (error) {
    console.error("db-size snapshot cron GET error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "서버 오류",
        debug: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
