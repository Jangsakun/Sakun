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
