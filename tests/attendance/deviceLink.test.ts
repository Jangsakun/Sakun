import test from "node:test";
import assert from "node:assert/strict";

import { createDeviceLinkToken, readDeviceLinkToken, DEVICE_LINK_TTL_MS } from "../../app/lib/deviceLink";
import { isInAppBrowser } from "../../app/lib/inAppBrowser";

// 비밀값은 호출할 때 읽습니다.
process.env.DEVICE_LINK_SECRET = "test-secret";

test("연결표: 만든 값 그대로 읽힘, 위조·만료는 거부", () => {
  const now = Date.now();
  const token = createDeviceLinkToken(287, "dev-abc", now);

  assert.deepEqual(readDeviceLinkToken(token, now), { e: 287, d: "dev-abc", x: now + DEVICE_LINK_TTL_MS });
  assert.equal(readDeviceLinkToken(token, now + DEVICE_LINK_TTL_MS + 1), null, "10분 지나면 거부");

  const [body, mac] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ e: 1, d: "dev-abc", x: now + DEVICE_LINK_TTL_MS })).toString("base64url");
  assert.equal(readDeviceLinkToken(`${forged}.${mac}`, now), null, "직원 id 바꾸면 거부");
  const tampered = (mac[0] === "A" ? "B" : "A") + mac.slice(1);
  assert.equal(readDeviceLinkToken(`${body}.${tampered}`, now), null, "서명 바꾸면 거부");
  assert.equal(readDeviceLinkToken("", now), null);
});

test("앱 안 브라우저 감지", () => {
  const androidChrome = "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
  const androidWebView = "Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36";
  const kakao = `${androidWebView} KAKAOTALK 10.8.0`;
  const iosSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const iosChrome = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1";
  const iosWebView = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

  assert.equal(isInAppBrowser(androidChrome), false, "안드로이드 크롬");
  assert.equal(isInAppBrowser(iosSafari), false, "아이폰 사파리");
  assert.equal(isInAppBrowser(iosChrome), false, "아이폰 크롬");
  assert.equal(isInAppBrowser(androidWebView), true, "안드로이드 앱 안 브라우저");
  assert.equal(isInAppBrowser(kakao), true, "카카오톡");
  assert.equal(isInAppBrowser(iosWebView), true, "아이폰 앱 안 브라우저");
});
