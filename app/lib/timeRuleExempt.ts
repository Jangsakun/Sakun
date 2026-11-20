// 출퇴근 시각 보정 제외 직원(2026-11-19 사용자 요청).
//
// 이 직원들은 시급 구간 출퇴근을 "찍은 시각 그대로" 저장합니다.
//   - 출근 시각 보정 없음, 퇴근 30분 단위 맞춤 없음
//   - 퇴근 가능 시간 제한(12:30 이후·정각/30분부터 10분) 없음
// 하루 흐름 규칙(출근 전 퇴근 불가, 하루 1회 등)과 위치 확인은 그대로입니다.
// 화면(app/page.tsx)과 서버(app/lib/attendanceServer.ts)가 같이 씁니다. 서버 전용 의존성 금지.
//
//   69 = 장사꾼 이종원 (월급제 전환, 시급 0원)

export const TIME_RULE_EXEMPT_EMPLOYEE_IDS: readonly number[] = [69];

export function isTimeRuleExempt(employeeId: unknown) {
  const id = Number(employeeId);

  return Number.isFinite(id) && TIME_RULE_EXEMPT_EMPLOYEE_IDS.includes(id);
}
