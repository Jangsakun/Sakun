// 근무지 뱃지 색상 — 단일 기준.
//
// 이전에는 `workplaceName === "헤모즈" ? 분홍 : 파랑` 형태의 인라인 삼항연산자가
// 6곳(admin/page.tsx 5곳 + ScheduleTab.tsx 1곳)에 흩어져 있었습니다.
// 그래서 로엔티크·깨소금이 장사꾼과 같은 파랑으로 나왔습니다.
// 근무지를 추가할 때는 이 파일의 표만 고치면 모든 화면에 반영됩니다.

export type WorkplaceBadgeColor = {
  backgroundColor: string;
  color: string;
};

/**
 * 연한 배경 + 진한 글자. 기존 장사꾼(하늘)·헤모즈(분홍) 톤에 맞춘 파스텔입니다.
 *
 * 깨소금을 청록으로 잡은 이유: 출퇴근 기록 표에서 근무지 뱃지 바로 옆에
 * 상태 뱃지가 붙는데, 상태의 "완료"가 초록(#dcfce7/#166534)이라
 * 같은 초록을 쓰면 한 줄에 초록이 두 개 겹쳐 구분이 어려워집니다.
 */
export const WORKPLACE_BADGE_COLORS: Record<string, WorkplaceBadgeColor> = {
  장사꾼: { backgroundColor: "#e0f2fe", color: "#0369a1" }, // 하늘
  헤모즈: { backgroundColor: "#fce7f3", color: "#be185d" }, // 분홍
  로엔티크: { backgroundColor: "#ede9fe", color: "#6d28d9" }, // 보라
  깨소금: { backgroundColor: "#ccfbf1", color: "#0f766e" }, // 청록
};

/** 표에 없는 근무지는 회색. 새 근무지가 생겨도 장사꾼 색으로 잘못 보이지 않게 합니다. */
export const UNKNOWN_WORKPLACE_BADGE_COLOR: WorkplaceBadgeColor = {
  backgroundColor: "#f1f5f9",
  color: "#475569",
};

export function getWorkplaceBadgeColor(
  workplaceName: unknown
): WorkplaceBadgeColor {
  const name = String(workplaceName ?? "").trim();

  return WORKPLACE_BADGE_COLORS[name] ?? UNKNOWN_WORKPLACE_BADGE_COLOR;
}
