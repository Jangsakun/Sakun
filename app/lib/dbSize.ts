// Supabase DB 용량 모니터링 계산 로직.
// 전부 결정적인 수식이며 추정/판단이 들어가지 않습니다.

export const BYTES_PER_MB = 1024 * 1024;

/** 무료 플랜 한도 500MB. 플랜을 올렸으면 SUPABASE_DB_LIMIT_MB 로 덮어씁니다. */
export const DEFAULT_LIMIT_MB = 500;

/** 평균 일일 증가량을 볼 기본 창(일). */
export const DEFAULT_WINDOW_DAYS = 30;

/** 선형 추정을 시작하기 위해 필요한 최소 스냅샷 일수. */
export const MIN_SNAPSHOTS_FOR_PROJECTION = 7;

/** 화면에 넘길 이력 최대 일수 (응답 크기 제한). */
export const MAX_HISTORY_DAYS = 60;

/** 월 환산에 쓰는 평균 일수 (365.25 / 12). */
const DAYS_PER_MONTH = 30.4375;

export type DbSizeSnapshot = {
  date: string;
  bytes: number;
};

export type ProjectionStatus =
  | "ok"
  | "insufficient"
  | "no-growth"
  | "exceeded";

export type DbSizeGrowth = {
  windowDays: number;
  usedSnapshotCount: number;
  firstDate: string | null;
  lastDate: string | null;
  spanDays: number;
  avgDailyBytes: number;
};

export type DbSizeProjection = {
  status: ProjectionStatus;
  daysLeft: number | null;
  monthsLeft: number | null;
  reachDate: string | null;
  message: string;
};

export function formatBytes(bytes: number) {
  const value = Number(bytes) || 0;

  if (Math.abs(value) >= 1024 * BYTES_PER_MB) {
    return `${(value / (1024 * BYTES_PER_MB)).toFixed(2)}GB`;
  }

  if (Math.abs(value) >= BYTES_PER_MB) {
    return `${(value / BYTES_PER_MB).toFixed(1)}MB`;
  }

  if (Math.abs(value) >= 1024) {
    return `${(value / 1024).toFixed(1)}KB`;
  }

  return `${Math.round(value)}B`;
}

export function todayKstDateKey(now: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const base = new Date(`${dateKey}T00:00:00+09:00`);
  base.setUTCDate(base.getUTCDate() + days);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

export function diffDaysBetweenDateKeys(fromDateKey: string, toDateKey: string) {
  const from = new Date(`${fromDateKey}T00:00:00+09:00`).getTime();
  const to = new Date(`${toDateKey}T00:00:00+09:00`).getTime();

  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

/**
 * 최근 windowDays 일 안의 스냅샷만 보고 평균 일일 증가량을 냅니다.
 * 수식: (마지막 스냅샷 용량 - 첫 스냅샷 용량) / (두 날짜 간격 일수)
 */
export function calcGrowth(
  snapshots: DbSizeSnapshot[],
  windowDays: number = DEFAULT_WINDOW_DAYS,
  todayKey: string = todayKstDateKey()
): DbSizeGrowth {
  const cutoffKey = addDaysToDateKey(todayKey, -(windowDays - 1));

  const windowed = snapshots
    .filter((item) => item.date >= cutoffKey)
    .sort((a, b) => a.date.localeCompare(b.date));

  const first = windowed[0] || null;
  const last = windowed[windowed.length - 1] || null;

  const spanDays =
    first && last ? diffDaysBetweenDateKeys(first.date, last.date) : 0;

  const avgDailyBytes =
    first && last && spanDays > 0
      ? (last.bytes - first.bytes) / spanDays
      : 0;

  return {
    windowDays,
    usedSnapshotCount: windowed.length,
    firstDate: first?.date || null,
    lastDate: last?.date || null,
    spanDays,
    avgDailyBytes,
  };
}

/**
 * 선형 추정으로 한도 도달까지 남은 일수를 계산합니다.
 * 수식: (한도 - 현재 용량) / 평균 일일 증가량
 */
export function calcProjection({
  currentBytes,
  limitBytes,
  growth,
  todayKey = todayKstDateKey(),
  minSnapshots = MIN_SNAPSHOTS_FOR_PROJECTION,
}: {
  currentBytes: number;
  limitBytes: number;
  growth: DbSizeGrowth;
  todayKey?: string;
  minSnapshots?: number;
}): DbSizeProjection {
  if (currentBytes >= limitBytes) {
    return {
      status: "exceeded",
      daysLeft: 0,
      monthsLeft: 0,
      reachDate: todayKey,
      message: "이미 한도를 넘었습니다. 플랜 업그레이드 또는 데이터 정리가 필요합니다.",
    };
  }

  if (growth.usedSnapshotCount < minSnapshots || growth.spanDays < 1) {
    const remainingDays = Math.max(1, minSnapshots - growth.usedSnapshotCount);

    return {
      status: "insufficient",
      daysLeft: null,
      monthsLeft: null,
      reachDate: null,
      message: `스냅샷 ${growth.usedSnapshotCount}일치 수집됨 (최소 ${minSnapshots}일 필요). ${remainingDays}일 후 계산 가능합니다.`,
    };
  }

  if (growth.avgDailyBytes <= 0) {
    return {
      status: "no-growth",
      daysLeft: null,
      monthsLeft: null,
      reachDate: null,
      message: `최근 ${growth.spanDays}일간 용량이 늘지 않았습니다. 증가 추세가 생기면 예상 시점이 표시됩니다.`,
    };
  }

  const daysLeft = Math.floor(
    (limitBytes - currentBytes) / growth.avgDailyBytes
  );
  const monthsLeft = Math.round((daysLeft / DAYS_PER_MONTH) * 10) / 10;

  return {
    status: "ok",
    daysLeft,
    monthsLeft,
    reachDate: addDaysToDateKey(todayKey, daysLeft),
    message: `현재 증가 속도(${formatBytes(
      growth.avgDailyBytes
    )}/일)가 유지되면 약 ${daysLeft.toLocaleString(
      "ko-KR"
    )}일(${monthsLeft}개월) 뒤 한도에 도달합니다.`,
  };
}
