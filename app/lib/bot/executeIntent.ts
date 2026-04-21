import { BotIntent } from "./detectIntent";
import { getAdminSummary } from "../services/dashboard";

export async function executeIntent(intent: BotIntent) {
  switch (intent) {
    case "PING":
      return "정상 연결됨";

    case "GET_ADMIN_SUMMARY": {
      const summary = await getAdminSummary();

      return [
        "오늘 관리자 요약입니다.",
        `- 출근 인원: ${summary.checkedInCount}명`,
        `- 퇴근 미기록: ${summary.notCheckedOutCount}명`,
        `- 오늘 계약 작성: ${summary.contractCreatedTodayCount}명`,
      ].join("\n");
    }

    case "UNKNOWN":
    default:
      return "아직 지원하지 않는 질문입니다. 예: 테스트, 오늘 관리자 요약";
  }
}