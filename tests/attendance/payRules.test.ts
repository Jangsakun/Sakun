import test from "node:test";
import assert from "node:assert/strict";
import { getHourlyWageForDay } from "../../app/lib/dayPay";

const rec = (hourly_wage_snapshot: number | null) => ({ record_type: "check_in", checked_at: "2026-11-10T00:00:00Z", hourly_wage_snapshot });

test("시급 스냅샷 0은 0원으로 계산", () => {
  assert.equal(getHourlyWageForDay([rec(0)], 0), 0, "시급 0원 지정");
  assert.equal(getHourlyWageForDay([rec(0)], 10320), 0, "직원 시급이 있어도 기록이 0이면 0");
  assert.equal(getHourlyWageForDay([rec(12000)], 0), 12000);
  assert.equal(getHourlyWageForDay([rec(null)], 11000), 11000, "비어 있으면 직원 시급");
  assert.equal(getHourlyWageForDay([rec(null)], null), 10320, "둘 다 없으면 기본값");
});

import { calcDayPay } from "../../app/lib/dayPay";

const shift = (date: string, inHm: string, outHm: string) => [
  { record_type: "check_in", checked_at: new Date(`${date}T${inHm}:00+09:00`).toISOString(), hourly_wage_snapshot: 12000, segment_type: "hourly" },
  { record_type: "check_out", checked_at: new Date(`${date}T${outHm}:00+09:00`).toISOString(), hourly_wage_snapshot: 12000, segment_type: "hourly" },
];

test("김난희(60): 6시간 이상 근무한 날 1시간 추가(2026-11-09부터)", () => {
  const now = new Date("2026-11-20T00:00:00+09:00");
  const d8 = calcDayPay("2026-11-10", shift("2026-11-10", "14:00", "22:00"), { employeeId: 60, now, estimate: false });
  assert.equal(d8.hourly.workedMinutes, 9 * 60, "8시간 → 9시간");
  assert.equal(d8.hourly.pay, 9 * 12000);
  const d5 = calcDayPay("2026-11-10", shift("2026-11-10", "14:00", "19:00"), { employeeId: 60, now, estimate: false });
  assert.equal(d5.hourly.workedMinutes, 5 * 60, "6시간 미만은 그대로");
  const d6 = calcDayPay("2026-11-10", shift("2026-11-10", "14:00", "20:00"), { employeeId: 60, now, estimate: false });
  assert.equal(d6.hourly.workedMinutes, 7 * 60, "딱 6시간도 추가");
  const before = calcDayPay("2026-11-06", shift("2026-11-06", "14:00", "22:00"), { employeeId: 60, now, estimate: false });
  assert.equal(before.hourly.workedMinutes, 8 * 60, "11/9 이전은 그대로");
  const other = calcDayPay("2026-11-10", shift("2026-11-10", "14:00", "22:00"), { employeeId: 61, now, estimate: false });
  assert.equal(other.hourly.workedMinutes, 8 * 60, "다른 직원은 그대로");
});
