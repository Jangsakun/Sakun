import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  BYTES_PER_MB,
  DEFAULT_LIMIT_MB,
  DEFAULT_WINDOW_DAYS,
  MAX_HISTORY_DAYS,
  MIN_SNAPSHOTS_FOR_PROJECTION,
  addDaysToDateKey,
  calcGrowth,
  calcProjection,
  formatBytes,
  todayKstDateKey,
  type DbSizeSnapshot,
} from "@/app/lib/dbSize";

export const dynamic = "force-dynamic";

function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey);
}

function getLimitBytes() {
  const raw = Number(process.env.SUPABASE_DB_LIMIT_MB);
  const limitMb = raw > 0 ? raw : DEFAULT_LIMIT_MB;

  return {
    limitMb,
    limitBytes: Math.round(limitMb * BYTES_PER_MB),
  };
}

function isAdminRequest(request: NextRequest) {
  return request.cookies.get("admin_auth")?.value === "ok";
}

type SupabaseAdminClient = NonNullable<ReturnType<typeof createSupabaseAdmin>>;

type SnapshotRow = {
  snapshot_date: string;
  size_bytes: number | string;
};

async function buildPayload(
  supabase: SupabaseAdminClient,
  windowDays: number
) {
  const { data: sizeData, error: sizeError } = await supabase.rpc(
    "get_db_size_bytes"
  );

  if (sizeError) {
    return {
      error:
        "현재 용량 조회 실패 (get_db_size_bytes RPC 없음일 수 있습니다. supabase/migrations 의 SQL을 먼저 실행하세요.)",
      debug: sizeError.message,
    };
  }

  const todayKey = todayKstDateKey();
  const historyFromKey = addDaysToDateKey(todayKey, -(MAX_HISTORY_DAYS - 1));

  const { data: rows, error: snapshotError } = await supabase
    .from("db_size_snapshots")
    .select("snapshot_date, size_bytes")
    .gte("snapshot_date", historyFromKey)
    .order("snapshot_date", { ascending: true });

  if (snapshotError) {
    return {
      error:
        "스냅샷 조회 실패 (db_size_snapshots 테이블 없음일 수 있습니다. supabase/migrations 의 SQL을 먼저 실행하세요.)",
      debug: snapshotError.message,
    };
  }

  const snapshots: DbSizeSnapshot[] = ((rows || []) as SnapshotRow[]).map(
    (row) => ({
      date: String(row.snapshot_date).slice(0, 10),
      bytes: Number(row.size_bytes) || 0,
    })
  );

  const currentBytes = Number(sizeData) || 0;
  const { limitMb, limitBytes } = getLimitBytes();

  const growth = calcGrowth(snapshots, windowDays, todayKey);
  const projection = calcProjection({
    currentBytes,
    limitBytes,
    growth,
    todayKey,
  });

  const usedPercent =
    limitBytes > 0
      ? Math.round((currentBytes / limitBytes) * 1000) / 10
      : 0;

  const latest = snapshots[snapshots.length - 1] || null;
  const previous = snapshots[snapshots.length - 2] || null;

  return {
    payload: {
      today: todayKey,
      limitMb,
      limitBytes,
      limitText: formatBytes(limitBytes),
      currentBytes,
      currentText: formatBytes(currentBytes),
      usedPercent,
      remainingBytes: Math.max(0, limitBytes - currentBytes),
      remainingText: formatBytes(Math.max(0, limitBytes - currentBytes)),
      minSnapshotsForProjection: MIN_SNAPSHOTS_FOR_PROJECTION,
      snapshotCount: snapshots.length,
      hasTodaySnapshot: latest?.date === todayKey,
      lastSnapshotDate: latest?.date || null,
      lastDayDeltaBytes:
        latest && previous ? latest.bytes - previous.bytes : null,
      growth: {
        ...growth,
        avgDailyText: formatBytes(growth.avgDailyBytes),
        avgMonthlyBytes: growth.avgDailyBytes * 30,
        avgMonthlyText: formatBytes(growth.avgDailyBytes * 30),
      },
      projection,
      history: snapshots,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json(
        { success: false, message: "관리자 로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const supabase = createSupabaseAdmin();

    if (!supabase) {
      return NextResponse.json(
        { success: false, message: "Supabase 환경변수 없음" },
        { status: 500 }
      );
    }

    const rawWindow = Number(
      new URL(request.url).searchParams.get("windowDays")
    );
    const windowDays =
      rawWindow >= 2 && rawWindow <= MAX_HISTORY_DAYS
        ? Math.floor(rawWindow)
        : DEFAULT_WINDOW_DAYS;

    const result = await buildPayload(supabase, windowDays);

    if (result.error) {
      return NextResponse.json(
        { success: false, message: result.error, debug: result.debug },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, ...result.payload });
  } catch (error) {
    console.error("admin db-size GET error:", error);

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

// 관리자 화면의 "지금 기록" 버튼 — 스케줄을 기다리지 않고 오늘 스냅샷을 남깁니다.
// 같은 날짜는 upsert 되므로 여러 번 눌러도 행이 늘지 않습니다.
export async function POST(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json(
        { success: false, message: "관리자 로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const supabase = createSupabaseAdmin();

    if (!supabase) {
      return NextResponse.json(
        { success: false, message: "Supabase 환경변수 없음" },
        { status: 500 }
      );
    }

    const { data, error } = await supabase.rpc("record_db_size_snapshot");

    if (error) {
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

    return NextResponse.json({
      success: true,
      message: "오늘 스냅샷을 기록했습니다.",
      snapshot: data,
    });
  } catch (error) {
    console.error("admin db-size POST error:", error);

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
