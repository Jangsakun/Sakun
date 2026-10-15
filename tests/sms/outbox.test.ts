// 문자 대기열·서명본 링크 순수 함수 단위 테스트.
// 실행: npx tsx --test tests/sms/outbox.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseMessageType, LMS_MAX_BYTES, maskMobile, normalizeMobile, smsByteLength } from "../../app/lib/sms/outbox";
import {
  buildContractLinkMessage,
  entityShortName,
  hashLinkToken,
  isValidLinkToken,
} from "../../app/lib/contracts/downloadLink";

test("휴대폰 번호 정규화·가리기", () => {
  assert.equal(normalizeMobile("010-1234-5678"), "01012345678");
  assert.equal(normalizeMobile(" 011 123 4567 "), "0111234567");
  assert.equal(normalizeMobile("02-123-4567"), null);
  assert.equal(normalizeMobile(""), null);
  assert.equal(normalizeMobile(null), null);
  assert.equal(maskMobile("01012345678"), "010-****-5678");
});

test("바이트 계산과 SMS/LMS 선택", () => {
  assert.equal(smsByteLength("abc"), 3);
  assert.equal(smsByteLength("가나"), 4);
  assert.equal(chooseMessageType("가".repeat(45)), "SMS");
  assert.equal(chooseMessageType("가".repeat(46)), "LMS");
});

test("계약 명의 짧은 이름", () => {
  assert.equal(entityShortName({ short_name: "헤모즈", business_name: "주식회사 헤모즈" }), "헤모즈");
  assert.equal(entityShortName({ short_name: null, business_name: "주식회사 헤모즈" }), "헤모즈");
  assert.equal(entityShortName({ short_name: "", business_name: "(주)장사꾼을위한장사꾼" }), "장사꾼을위한장사꾼");
  assert.equal(entityShortName(null), "장사꾼");
});

test("서명본 안내 문자: LMS, 길이 한도 안, 개인정보 없음", () => {
  const url = "https://sakun.kr/d/AbCdEfGhIjKlMnOpQrStUv";
  const text = buildContractLinkMessage("헤모즈", url);

  assert.ok(text.startsWith("[헤모즈] "));
  assert.ok(text.includes(url));
  assert.equal(chooseMessageType(text), "LMS");
  assert.ok(smsByteLength(text) < LMS_MAX_BYTES);
  assert.ok(!/\d{6}/.test(text.replace(url, "")), "생년월일·번호 같은 숫자가 없어야 함");
});

test("링크 토큰 형식·해시", () => {
  assert.ok(isValidLinkToken("AbCdEfGhIjKlMnOpQrSt_-"));
  assert.ok(!isValidLinkToken("short"));
  assert.ok(!isValidLinkToken("AbCdEfGhIjKlMnOpQrSt_-/"));
  assert.ok(!isValidLinkToken(undefined));
  assert.match(hashLinkToken("x"), /^[0-9a-f]{64}$/);
  assert.notEqual(hashLinkToken("a"), hashLinkToken("b"));
});
