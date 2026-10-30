import test from "node:test";
import assert from "node:assert/strict";
import { contractGateFor } from "../../app/lib/contracts/attendanceGate";

const week = (start: string, end: string, status = "signed") => ({ status, start_date: start, end_date: end });

test("계약 기간 검사", () => {
  assert.equal(contractGateFor([], "2026-10-30"), "no_history", "계약서 없음 → 기존처럼 허용");
  assert.equal(contractGateFor([{ status: "pending", start_date: null, end_date: null }], "2026-10-30"), "no_history", "서명 전 → 허용");
  assert.equal(contractGateFor([week("2026-10-27", "2026-10-31")], "2026-10-31"), "valid", "마지막 날 포함");
  assert.equal(contractGateFor([week("2026-10-27", "2026-10-31")], "2026-11-01"), "expired", "다음 날 막힘");
  assert.equal(contractGateFor([week("2026-10-20", "2026-10-24", "ended"), week("2026-10-27", "2026-10-31")], "2026-10-28"), "valid");
  assert.equal(contractGateFor([week("2026-10-20", "2026-10-24", "void")], "2026-10-28"), "no_history", "무효 계약은 기간으로 안 봄");
  assert.equal(contractGateFor([week("2026-11-02", "2026-11-06")], "2026-10-30"), "expired", "시작 전 날짜도 막힘");

  const w = (start: string, end: string) => ({ kind: "week", status: "signed", start_date: start, end_date: end });
  const m = (start: string, end: string) => ({ kind: "month11", status: "signed", start_date: start, end_date: end });
  assert.equal(contractGateFor([w("2026-10-17", "2026-10-23")], "2026-10-30", "month11"), "no_history", "1주만 있다가 고정이 된 직원은 막지 않음");
  assert.equal(contractGateFor([w("2026-10-17", "2026-10-23")], "2026-10-30", "week"), "expired", "당근 1주 끝남 → 막힘");
  assert.equal(contractGateFor([m("2025-11-01", "2026-09-30")], "2026-10-30", "month11"), "expired", "고정 11개월 끝남 → 막힘");
  assert.equal(contractGateFor([w("2026-10-27", "2026-10-31"), m("2026-11-02", "2027-10-01")], "2026-10-30", "month11"), "valid", "전환 직후 1주 기간");
});
