// 야간 근무(자정 넘김) 근무일 규칙 검사. 실행: npx tsx --test tests/attendance/overnight.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attendanceWorkDateKey,
  calcDayWork,
  isOpenWorkDate,
  overnightRangeEnd,
} from "../../app/lib/workTime";
import { calcDayPay } from "../../app/lib/dayPay";

const at = (s: string) => new Date(`${s}+09:00`).toISOString();

test("새벽 06:00 전 퇴근만 전날 근무일", () => {
  assert.equal(attendanceWorkDateKey({ record_type: "check_out", checked_at: at("2026-10-20T02:00:00") }), "2026-10-19");
  assert.equal(attendanceWorkDateKey({ record_type: "check_out", checked_at: at("2026-10-20T05:59:00") }), "2026-10-19");
  assert.equal(attendanceWorkDateKey({ record_type: "check_out", checked_at: at("2026-10-20T06:00:00") }), "2026-10-20");
  assert.equal(attendanceWorkDateKey({ record_type: "check_in", checked_at: at("2026-10-20T02:00:00") }), "2026-10-20");
  assert.equal(attendanceWorkDateKey({ record_type: "check_out", checked_at: at("2026-11-01T01:00:00") }), "2026-10-31");
});

test("19일 21:00 ~ 20일 02:00 = 5시간, 점심 차감 없음", () => {
  const records = [
    { record_type: "check_in", segment_type: "hourly", checked_at: at("2026-10-19T21:00:00"), hourly_wage_snapshot: 10320 },
    { record_type: "check_out", segment_type: "hourly", checked_at: at("2026-10-20T02:00:00"), hourly_wage_snapshot: 10320 },
  ];
  const work = calcDayWork("2026-10-19", records);
  assert.equal(work.workedMinutes, 300);
  assert.equal(work.lunchDeducted, false);
  const pay = calcDayPay("2026-10-19", records, {});
  assert.equal(pay.basePay, 51600);
});

test("근무 중 판정: 새벽 06:00 전에는 어제도 진행 중", () => {
  assert.equal(isOpenWorkDate("2026-10-19", new Date(at("2026-10-20T01:30:00"))), true);
  assert.equal(isOpenWorkDate("2026-10-19", new Date(at("2026-10-20T06:30:00"))), false);
  assert.equal(isOpenWorkDate("2026-10-20", new Date(at("2026-10-20T06:30:00"))), true);
  const open = [{ record_type: "check_in", checked_at: at("2026-10-19T21:00:00") }];
  const r = calcDayWork("2026-10-19", open, { now: new Date(at("2026-10-20T01:00:00")), estimate: false });
  assert.equal(r.inProgress, true);
  assert.equal(r.missingCheckOut, false);
});

test("조회 끝 시각은 다음날 05:59:59", () => {
  assert.equal(overnightRangeEnd("2026-10-31"), "2026-11-01T05:59:59.999+09:00");
});
