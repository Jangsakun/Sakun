// 1주 계약 연속 4회 이상 목록. 실행: npx tsx --test tests/contracts/weekStreaks.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { findWeekStreaks } from "../../app/lib/contracts/server";

const week = (start: string, end: string, status = "signed") => ({ employee_id: 293, employee_name: "이서정", kind: "week", status, start_date: start, end_date: end });
const weeks = [
  week("2026-10-24", "2026-10-24"),
  week("2026-10-27", "2026-10-30"),
  week("2026-11-02", "2026-11-06"),
  week("2026-11-07", "2026-11-07"),
  week("2026-11-09", "2026-11-13"),
];

test("1주 계약 5회 연속이면 목록에 나옴", () => {
  assert.equal(findWeekStreaks(weeks).length, 1);
  assert.equal(findWeekStreaks(weeks)[0].count, 5);
});

test("그 뒤 11개월 계약으로 전환했으면 목록에서 빠짐(이서정, 2026-11-23)", () => {
  const rows = [...weeks, { ...week("2026-11-16", "2027-10-15"), kind: "month11" }, week("2026-11-16", "2026-11-20", "void")];
  assert.equal(findWeekStreaks(rows).length, 0);
});

test("11개월 계약 뒤에 다시 1주 연속이 생기면 다시 나옴", () => {
  const later = [
    week("2027-11-01", "2027-11-05"),
    week("2027-11-08", "2027-11-12"),
    week("2027-11-15", "2027-11-19"),
    week("2027-11-22", "2027-11-26"),
  ];
  const rows = [...weeks, { ...week("2026-11-16", "2027-10-15"), kind: "month11" }, ...later];
  const streaks = findWeekStreaks(rows);
  assert.equal(streaks.length, 1);
  assert.equal(streaks[0].from, "2027-11-01");
});
