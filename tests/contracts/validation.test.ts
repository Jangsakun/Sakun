// 근로계약서 검증 모듈 단위 테스트.
// 실행: npx tsx --test tests/contracts/validation.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcElevenMonthContractEnd,
  calcWeekContractEnd,
  contractKindForEmploymentType, allowedWeekContractDays } from "../../app/lib/contracts/period";
import {
  ageOn,
  checkResidentNumber,
  maskResidentNumber,
} from "../../app/lib/contracts/residentNumber";
import {
  validateContractInput,
  type ContractInput,
  type ValidationContext,
} from "../../app/lib/contracts/validation";

const TODAY = "2026-10-14"; // 수요일

// 검증번호가 맞는 주민번호를 만듭니다(앞 12자리 + 계산한 마지막 자리).
function withChecksum(first12: string) {
  const w = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  const sum = w.reduce((acc, v, i) => acc + v * Number(first12[i]), 0);
  let check = (11 - (sum % 11)) % 10;
  if (Number(first12[6]) >= 5) check = (check + 2) % 10;
  return first12 + check;
}
const wrongChecksum = (rrn: string) => rrn.slice(0, 12) + ((Number(rrn[12]) + 1) % 10);

const ADULT = withChecksum("900101123456"); // 1990-01-01 남

const ctx = (over: Partial<ValidationContext> = {}): ValidationContext => ({
  kind: "week",
  today: TODAY,
  minimumWageForYear: (y) => (y === 2026 ? 10320 : y === 2027 ? 10320 : null),
  printedHourlyWage: 10320,
  employeeHourlyWage: 10320,
  ...over,
});

const week = (over: Partial<ContractInput> = {}): ContractInput => ({
  name: "홍길동",
  residentNumber: ADULT,
  phone: "010-1234-5678",
  address: "전북특별자치도 전주시 덕진구 테스트로 1",
  startDate: TODAY,
  // TODAY 가 수요일이라 계약 기간 안의 요일은 수~금(2026-10-30 근무 요일 제한)
  workDays: ["wed", "thu", "fri"],
  workStart: "09:00",
  workEnd: "18:00",
  breakStart: "12:00",
  breakEnd: "13:00",
  ...over,
});

const codes = (r: ReturnType<typeof validateContractInput>) => r.errors.map((e) => e.code);

// ── 계약 종류 · 기간 (검증 시나리오 5) ─────────────────────────────
test("고용구분 → 계약 종류: 당근=1주, 고정=11개월", () => {
  assert.equal(contractKindForEmploymentType("carrot"), "week");
  assert.equal(contractKindForEmploymentType("fixed"), "month11");
});

test("1주 종료일: 월~금 시작은 그 주 금요일, 토·일 시작은 다음 주 금요일", () => {
  const cases: [string, string, string][] = [
    ["2026-10-12", "2026-10-16", "월 → 그 주 금"],
    ["2026-10-13", "2026-10-16", "화 → 그 주 금"],
    ["2026-10-16", "2026-10-16", "금 → 당일"],
    ["2026-10-17", "2026-10-23", "토 → 다음 주 금"],
    ["2026-10-18", "2026-10-23", "일 → 다음 주 금"],
    ["2026-10-29", "2026-10-30", "월말 목 → 금"],
    ["2026-10-31", "2026-11-06", "월말 토 → 다음 달 금"],
    ["2026-12-28", "2027-01-01", "연말 월 → 다음 해 금"],
    ["2026-12-31", "2027-01-01", "연말 목 → 다음 해 금"],
    ["2027-01-02", "2027-01-08", "연초 토 → 다음 주 금"],
    ["2028-02-28", "2028-03-03", "윤년 2/28(월) → 3/3(금)"],
  ];
  for (const [start, end, note] of cases) assert.equal(calcWeekContractEnd(start), end, note);
});

test("장사꾼 1주 계약: 토요일 시작이면 토요일 하루 (2026-10-16)", () => {
  assert.equal(calcWeekContractEnd("2026-10-17", "장사꾼"), "2026-10-17", "토 시작 → 당일");
  assert.equal(calcWeekContractEnd("2026-10-18", "장사꾼"), "2026-10-23", "일 시작 → 다음 주 금(그대로)");
  assert.equal(calcWeekContractEnd("2026-10-14", "장사꾼"), "2026-10-16", "수 시작 → 그 주 금(그대로)");
  assert.equal(calcWeekContractEnd("2026-10-17", "헤모즈"), "2026-10-23", "헤모즈 토 시작 → 다음 주 금(그대로)");
  assert.equal(calcWeekContractEnd("2026-10-17"), "2026-10-23", "사업장 없으면 기존 규칙");

  const sat = { ...week(), startDate: "2026-10-17" };
  const jang = { ...ctx(), workplace: "장사꾼" };
  const okSat = validateContractInput({ ...sat, workDays: ["sat"] }, jang);
  assert.equal(okSat.derived.endDate, "2026-10-17");
  assert.ok(!okSat.errors.some((e) => e.code === "saturday_only"));
  assert.ok(validateContractInput({ ...sat, workDays: ["mon", "sat"] }, jang).errors.some((e) => e.code === "saturday_only"));
  assert.ok(!validateContractInput({ ...sat, workDays: ["mon", "sat"] }, { ...ctx(), workplace: "헤모즈" }).errors.some((e) => e.code === "saturday_only"));
});

test("1주 계약 근무 요일: 계약 기간 안의 월~금만", () => {
  const codesOf = (startDate: string, workDays: string[], workplace = "장사꾼") =>
    validateContractInput({ ...week(), startDate, workDays: workDays as ContractInput["workDays"] }, { ...ctx(), workplace }).errors.map((e) => e.code);
  assert.ok(codesOf("2026-10-14", ["mon", "tue", "wed", "thu", "fri"]).includes("day_outside_period"), "수 시작인데 월·화 선택 → 막힘");
  assert.ok(!codesOf("2026-10-14", ["wed", "thu", "fri"]).includes("day_outside_period"), "수 시작 수~금 → 통과");
  assert.ok(codesOf("2026-10-12", ["mon", "sat"]).includes("day_outside_period"), "월 시작인데 토 선택 → 막힘");
  assert.ok(!codesOf("2026-10-12", ["mon", "tue", "wed", "thu", "fri"]).includes("day_outside_period"), "월 시작 월~금 → 통과");
  assert.ok(codesOf("2026-10-17", ["mon", "sat"], "헤모즈").includes("day_outside_period"), "헤모즈 토 시작(다음 주 월~금 계약) 토 선택 → 막힘");
  assert.deepEqual(allowedWeekContractDays("2026-10-17", "장사꾼"), ["sat"]);
  assert.deepEqual(allowedWeekContractDays("2026-10-15", "헤모즈"), ["thu", "fri"]);
  assert.deepEqual(allowedWeekContractDays("2026-10-18", "장사꾼"), ["mon", "tue", "wed", "thu", "fri"]);
});

test("11개월 종료일은 기존 갱신 버튼과 같은 계산", () => {
  assert.equal(calcElevenMonthContractEnd("2026-10-01"), "2027-08-31");
  assert.equal(calcElevenMonthContractEnd("2026-03-31"), "2027-02-28");
  assert.equal(calcElevenMonthContractEnd("2027-03-31"), "2028-02-29");
  assert.equal(calcElevenMonthContractEnd("2026-10-14"), "2027-09-13");
});

// ── 작성 차단 검사 (검증 시나리오 7) ──────────────────────────────
test("정상 입력은 통과", () => {
  const r = validateContractInput(week(), ctx());
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.equal(r.derived.endDate, "2026-10-16");
  assert.equal(r.derived.dailyNetMinutes, 8 * 60);
  assert.equal(r.derived.weeklyNetMinutes, 24 * 60); // 수~금 3일 × 8시간
});

test("빈칸: 필수 칸이 비면 칸마다 차단", () => {
  for (const field of ["name", "residentNumber", "phone", "address", "startDate", "workStart", "workEnd"] as const) {
    const r = validateContractInput(week({ [field]: "" }), ctx());
    assert.ok(r.errors.some((e) => e.field === field && e.code === "blank"), `${field} 빈칸`);
  }
});

test("11개월은 근무시간 칸이 없으므로 근무시간 검사를 하지 않음", () => {
  const r = validateContractInput(
    { name: "홍길동", residentNumber: ADULT, phone: "01012345678", address: "전주시", startDate: TODAY },
    ctx({ kind: "month11" })
  );
  assert.deepEqual(r.errors, []);
  assert.equal(r.derived.endDate, "2027-09-13");
});

test("최저시급: 10,319원 차단 / 10,320원 통과", () => {
  let r = validateContractInput(week(), ctx({ printedHourlyWage: 10319, employeeHourlyWage: 10319 }));
  assert.ok(codes(r).includes("below_min_wage"));
  r = validateContractInput(week(), ctx({ printedHourlyWage: 10320, employeeHourlyWage: 10320 }));
  assert.ok(!codes(r).includes("below_min_wage"));
});

test("최저시급: 시작 연도 기준 — 그 해 설정이 없으면 차단", () => {
  const r = validateContractInput(week({ startDate: "2026-12-02" }), ctx({ minimumWageForYear: () => null }));
  assert.ok(codes(r).includes("min_wage_missing"));
});

test("등록 시급이 양식 인쇄 시급과 다르면 차단(관리자 문의)", () => {
  const r = validateContractInput(week(), ctx({ employeeHourlyWage: 11000 }));
  assert.ok(codes(r).includes("wage_mismatch"));
});

test("주민번호 형식 오류는 차단", () => {
  const bad: [string, string][] = [
    ["90010112345", "12자리"],
    ["991332-1234567", "없는 날짜"],
    ["900101-9234567", "7번째 자리 9"],
    [withChecksum("300101312345"), "미래 생년월일(2030년)"],
  ];
  for (const [rrn, note] of bad) {
    const r = validateContractInput(week({ residentNumber: rrn }), ctx());
    assert.ok(codes(r).includes("rrn_invalid"), note);
  }
});

test("외국인등록번호(7번째 자리 5~8)는 통과", () => {
  for (const seventh of ["5", "6", "7", "8"]) {
    const prefix = seventh === "7" || seventh === "8" ? "050101" : "850101";
    const r = validateContractInput(week({ residentNumber: withChecksum(`${prefix}${seventh}12345`) }), ctx());
    assert.deepEqual(r.errors, [], `7번째 자리 ${seventh}`);
    assert.deepEqual(r.warnings, []);
  }
});

test("검증번호만 틀리면 경고만(진행 가능)", () => {
  const r = validateContractInput(week({ residentNumber: wrongChecksum(ADULT) }), ctx());
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.code === "rrn_checksum"));
});

test("만 17세 차단 / 만 18세 생일 당일 통과", () => {
  // 시작일 2026-10-14 기준
  const turns18Today = withChecksum("081014312345"); // 2008-10-14
  const turns18Tomorrow = withChecksum("081015312345"); // 2008-10-15
  assert.equal(ageOn("2008-10-14", TODAY), 18);
  assert.equal(ageOn("2008-10-15", TODAY), 17);
  assert.ok(!codes(validateContractInput(week({ residentNumber: turns18Today }), ctx())).includes("under_18"));
  assert.ok(codes(validateContractInput(week({ residentNumber: turns18Tomorrow }), ctx())).includes("under_18"));
});

test("근무시간: 종료 ≤ 시작, 근무요일 0개 차단", () => {
  assert.ok(codes(validateContractInput(week({ workStart: "18:00", workEnd: "09:00" }), ctx())).includes("end_before_start"));
  assert.ok(codes(validateContractInput(week({ workStart: "09:00", workEnd: "09:00" }), ctx())).includes("end_before_start"));
  assert.ok(codes(validateContractInput(week({ workDays: [] }), ctx())).includes("no_work_days"));
});

test("휴게: 길이와 상관없이 막지 않음", () => {
  let r = validateContractInput(week({ workStart: "09:00", workEnd: "14:00", breakStart: "12:00", breakEnd: "12:20" }), ctx());
  assert.deepEqual(r.errors, [], "5시간 + 20분");
  r = validateContractInput(week({ workStart: "09:30", workEnd: "18:00", breakStart: "12:00", breakEnd: "12:30" }), ctx());
  assert.deepEqual(r.errors, [], "8.5시간 + 30분");
  assert.equal(r.derived.dailyNetMinutes, 480, "9:30~18:00 휴게 30분 = 8시간");
  r = validateContractInput(week({ workStart: "09:00", workEnd: "12:30", breakStart: "", breakEnd: "" }), ctx());
  assert.deepEqual(r.errors, [], "4시간 미만은 휴게 없어도 통과");
  r = validateContractInput(week({ workStart: "13:30", workEnd: "20:00", breakStart: "", breakEnd: "" }), ctx());
  assert.deepEqual(r.errors, [], "휴게 빈칸이면 통과");
  assert.equal(r.derived.dailyNetMinutes, 390, "휴게 빈칸 13:30~20:00 = 6.5시간");
});

test("주 52시간: 53시간 차단 / 52시간 통과", () => {
  const six = ["mon", "tue", "wed", "thu", "fri", "sat"] as ContractInput["workDays"];
  let r = validateContractInput(week({ workDays: six, workStart: "09:00", workEnd: "18:50" }), ctx()); // 8h50 × 6 = 53h
  assert.ok(codes(r).includes("over_52h"));
  r = validateContractInput(week({ workDays: six, workStart: "09:00", workEnd: "18:40" }), ctx()); // 8h40 × 6 = 52h
  assert.ok(!codes(r).includes("over_52h"));
});

test("시작일: 31일 전·61일 후 차단, 경계값 확인", () => {
  const at = (offset: number) => {
    const d = new Date(Date.UTC(2026, 9, 14 + offset));
    return d.toISOString().slice(0, 10);
  };
  assert.ok(codes(validateContractInput(week({ startDate: at(-31) }), ctx())).includes("start_too_old"));
  assert.ok(codes(validateContractInput(week({ startDate: at(-30) }), ctx())).includes("start_too_old"));
  assert.ok(!codes(validateContractInput(week({ startDate: at(-29) }), ctx())).includes("start_too_old"));
  assert.ok(codes(validateContractInput(week({ startDate: at(61) }), ctx())).includes("start_too_far"));
  assert.ok(codes(validateContractInput(week({ startDate: at(60) }), ctx())).includes("start_too_far"));
  assert.ok(!codes(validateContractInput(week({ startDate: at(59) }), ctx())).includes("start_too_far"));
});

test("11개월 갱신처럼 시작일을 시스템이 정했으면 시작일 범위 검사를 하지 않음", () => {
  const far = { name: "홍길동", residentNumber: ADULT, phone: "01012345678", address: "전주시", startDate: "2027-09-14" };
  assert.ok(codes(validateContractInput(far, ctx({ kind: "month11" }))).includes("start_too_far"), "직접 입력이면 차단");
  assert.ok(!codes(validateContractInput(far, ctx({ kind: "month11", startDateFixed: true }))).includes("start_too_far"), "갱신 고정이면 통과");
});

test("휴대폰: 010 으로 시작하는 11자리가 아니면 차단", () => {
  for (const phone of ["011-1234-5678", "010-123-4567", "02-1234-5678"]) {
    assert.ok(codes(validateContractInput(week({ phone }), ctx())).includes("phone_invalid"), phone);
  }
  assert.ok(!codes(validateContractInput(week({ phone: "01012345678" }), ctx())).includes("phone_invalid"));
});

test("오류 메시지에 주민번호 원본이 들어가지 않음", () => {
  const all = [ADULT, "991332-1234567", wrongChecksum(ADULT), withChecksum("081015312345")];
  for (const rrn of all) {
    const r = validateContractInput(week({ residentNumber: rrn }), ctx());
    const text = JSON.stringify([...r.errors, ...r.warnings]);
    assert.ok(!text.includes(rrn.replace(/-/g, "")) && !text.includes(rrn), "메시지에 번호 없음");
  }
});

// ── 주민번호 표시 (검증 시나리오 14) ─────────────────────────────
test("화면 표시는 뒷자리를 가림", () => {
  assert.equal(maskResidentNumber("900101-1234567"), "900101-1******");
  assert.equal(checkResidentNumber("900101-1234567", TODAY).digits, "9001011234567");
});
