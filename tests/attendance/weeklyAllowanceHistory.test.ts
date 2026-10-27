// 주휴수당 상태 변경은 바꾼 주부터. 실행: npx tsx --test tests/attendance/weeklyAllowanceHistory.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { allowanceStatusForWeek, mondayOfDateKey } from "../../app/lib/weeklyAllowanceHistory";

test("월요일 계산", () => {
  assert.equal(mondayOfDateKey("2026-10-27"), "2026-10-26");
  assert.equal(mondayOfDateKey("2026-10-25"), "2026-10-19");
  assert.equal(mondayOfDateKey("2026-11-01"), "2026-10-26");
});

test("10/27 비대상→대상: 지난주는 비대상, 이번 주부터 대상", () => {
  const ch = [{ employee_id: 306, old_status: "비대상", new_status: "대상", effective_week_start: "2026-10-26" }];
  assert.equal(allowanceStatusForWeek("대상", ch, "2026-10-19"), "비대상");
  assert.equal(allowanceStatusForWeek("대상", ch, "2026-10-26"), "대상");
  assert.equal(allowanceStatusForWeek("대상", ch, "2026-11-02"), "대상");
  assert.equal(allowanceStatusForWeek("대상", [], "2026-10-19"), "대상");
});

test("여러 번 바꾼 경우 각 주는 그 주 끝 상태", () => {
  const ch = [
    { employee_id: 1, old_status: "비대상", new_status: "대상", effective_week_start: "2026-10-05" },
    { employee_id: 1, old_status: "대상", new_status: "비대상", effective_week_start: "2026-10-19" },
  ];
  assert.equal(allowanceStatusForWeek("비대상", ch, "2026-09-28"), "비대상");
  assert.equal(allowanceStatusForWeek("비대상", ch, "2026-10-12"), "대상");
  assert.equal(allowanceStatusForWeek("비대상", ch, "2026-10-19"), "비대상");
});
