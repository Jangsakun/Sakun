export type BotIntent = "PING" | "GET_ADMIN_SUMMARY" | "UNKNOWN";

export function detectIntent(text: string): BotIntent {
  const normalized = text.trim().toLowerCase();

  if (
    normalized.includes("테스트") ||
    normalized.includes("ping") ||
    normalized.includes("연결")
  ) {
    return "PING";
  }

  if (
    normalized.includes("요약") ||
    normalized.includes("관리자 요약") ||
    normalized.includes("오늘 현황")
  ) {
    return "GET_ADMIN_SUMMARY";
  }

  return "UNKNOWN";
}