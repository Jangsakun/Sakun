// 문자 워커 테스트 — 가짜 근태 앱 API + 가짜 뿌리오(fetch 대체)로 흐름 전체를 돌립니다.
// 실행: node --test tests/sms/worker.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { SmsWorker, readConfig } from "../../sms-worker/lib/core.mjs";
import { classifyNetworkError, classifyResponse, parsePpurioExpired, sanitize } from "../../sms-worker/lib/ppurio.mjs";

const SECRET = "s".repeat(40);
const API = "https://app.test";
const PPURIO = "https://ppurio.test";

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * 가짜 서버. queue 의 문자를 claim 으로 내주고, report 를 기록합니다.
 * ppurioReplies: /v1/message 에 차례로 돌려줄 응답(함수면 호출, Error 면 throw)
 */
function fakeServers({ queue = [], ppurioReplies = [], tokenReplies = [] } = {}) {
  const calls = { claims: [], reports: [], messages: [], tokens: 0, authHeaders: [] };
  const replies = [...ppurioReplies];
  const tokens = [...tokenReplies];

  const fetchImpl = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;

    if (url === `${API}/api/internal/sms/claim`) {
      assert.equal(init.headers.Authorization, `Bearer ${SECRET}`);
      calls.claims.push(body);
      const messages = body.heartbeatOnly ? [] : queue.splice(0, body.limit);
      return json(200, { success: true, messages });
    }

    if (url === `${API}/api/internal/sms/report`) {
      calls.reports.push(body);
      return json(200, { success: true, status: body.outcome === "retry" ? "queued" : body.outcome });
    }

    if (url === `${PPURIO}/v1/token`) {
      calls.tokens += 1;
      calls.authHeaders.push(init.headers.Authorization);
      const next = tokens.shift();
      if (next instanceof Error) throw next;
      return next ?? json(200, { token: `tok${calls.tokens}`, type: "Bearer", expired: "20991231235959" });
    }

    if (url === `${PPURIO}/v1/message`) {
      calls.messages.push({ body, auth: init.headers.Authorization });
      const next = replies.shift();
      if (next instanceof Error) throw next;
      return typeof next === "function" ? next() : next ?? json(200, { code: "1000", description: "success", refKey: body.refKey, messageKey: "MK1" });
    }

    throw new Error(`unexpected ${url}`);
  };

  return { fetchImpl, calls };
}

function makeWorker(fetchImpl, overrides = {}) {
  const config = {
    apiBase: API,
    secret: SECRET,
    workerId: "test-pc",
    dryRun: false,
    pollMs: 1000,
    ppurio: { baseUrl: PPURIO, account: "acct", apiKey: "key", from: "0212345678" },
    ...overrides,
  };
  const logs = [];
  const worker = new SmsWorker(config, { fetchImpl, log: (...a) => logs.push(a.join(" ")) });

  return { worker, logs };
}

const msg = (id) => ({ id, messageType: "LMS", subject: "제목", content: `본문 ${id}`, to: "01012345678", toMasked: "010-****-5678", attempts: 1 });

test("정상 발송: 토큰 받고 LMS 보내고 sent 보고, 로그에 번호·본문 없음", async () => {
  const { fetchImpl, calls } = fakeServers({ queue: [msg(1), msg(2)] });
  const { worker, logs } = makeWorker(fetchImpl);

  assert.equal(await worker.runOnce(), 2);
  assert.equal(calls.tokens, 1);
  assert.equal(calls.authHeaders[0], `Basic ${Buffer.from("acct:key").toString("base64")}`);
  assert.deepEqual(calls.messages.map((m) => m.body.refKey), ["o1", "o2"]);
  assert.equal(calls.messages[0].body.subject, "제목");
  assert.equal(calls.messages[0].body.duplicateFlag, "N");
  assert.equal(calls.messages[0].auth, "Bearer tok1");
  assert.deepEqual(calls.reports.map((r) => [r.id, r.outcome, r.messageKey]), [[1, "sent", "MK1"], [2, "sent", "MK1"]]);
  assert.equal(calls.claims[0].mode, "live");

  const all = logs.join("\n");
  assert.ok(!all.includes("01012345678"));
  assert.ok(!all.includes("본문"));
  assert.ok(!all.includes("key"));
});

test("모의 발송: 뿌리오를 부르지 않고 DRYRUN 으로 sent", async () => {
  const { fetchImpl, calls } = fakeServers({ queue: [msg(3)] });
  const { worker } = makeWorker(fetchImpl, { dryRun: true });

  await worker.runOnce();
  assert.equal(calls.tokens, 0);
  assert.equal(calls.messages.length, 0);
  assert.equal(calls.reports[0].resultCode, "DRYRUN");
  assert.equal(calls.reports[0].dryRun, true);
  assert.equal(calls.claims[0].mode, "dry-run");
});

test("토큰 만료 응답(3005)이면 새 토큰으로 한 번만 다시 보냄", async () => {
  const { fetchImpl, calls } = fakeServers({
    queue: [msg(4)],
    ppurioReplies: [json(401, { code: "3005", description: "invalid bearer" })],
  });
  const { worker } = makeWorker(fetchImpl);

  await worker.runOnce();
  assert.equal(calls.tokens, 2);
  assert.equal(calls.messages.length, 2);
  assert.equal(calls.messages[1].auth, "Bearer tok2");
  assert.equal(calls.reports[0].outcome, "sent");
});

test("IP 미등록(3003): 시도 횟수 미포함 재시도 + 나머지 문자는 보내지 않고 돌려놓고 + 오류를 연결 기록에 올림", async () => {
  const { fetchImpl, calls } = fakeServers({
    queue: [msg(5), msg(6)],
    ppurioReplies: [json(401, { code: "3003", description: "invalid ip" })],
  });
  const { worker } = makeWorker(fetchImpl);

  await worker.runOnce();
  assert.equal(calls.messages.length, 1, "두 번째 문자는 뿌리오로 보내지 않음");
  assert.deepEqual(calls.reports.map((r) => [r.id, r.outcome, r.countAttempt]), [[5, "retry", false], [6, "retry", false]]);

  // 다음 회차: 쉬는 중이므로 가져가지 않고 연결 기록만, 오류 문구 포함
  await worker.runOnce();
  const last = calls.claims.at(-1);
  assert.equal(last.heartbeatOnly, true);
  assert.match(last.lastError, /3003/);
});

test("토큰 발급 단계에서 막히면(4006) 문자를 가져가지도 않고 오류만 연결 기록에 올림", async () => {
  const queue = [msg(7)];
  const { fetchImpl, calls } = fakeServers({
    queue,
    tokenReplies: [json(401, { code: "4006", description: "invalid auth key" })],
  });
  const { worker } = makeWorker(fetchImpl);

  await worker.runOnce();
  assert.equal(calls.messages.length, 0);
  assert.equal(calls.reports.length, 0);
  assert.equal(queue.length, 1, "대기열에 그대로 남음");
  assert.equal(calls.claims[0].heartbeatOnly, true);
  assert.match(calls.claims[0].lastError, /4006/);
});

test("토큰 발급 중 첫 문자 직전 실패(만료 갱신 시점)면 미포함 재시도", async () => {
  const { fetchImpl, calls } = fakeServers({
    queue: [msg(13)],
    ppurioReplies: [json(401, { code: "3005" })],
    tokenReplies: [undefined, json(401, { code: "3003" })],
  });
  const { worker } = makeWorker(fetchImpl);

  await worker.runOnce();
  assert.equal(calls.messages.length, 1);
  assert.equal(calls.reports[0].outcome, "retry");
  assert.equal(calls.reports[0].countAttempt, false);
});

test("시간 초과·서버 오류는 unknown(자동 재발송 안 함), 연결 거부는 미포함 재시도, 400 은 failed", async () => {
  const timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" });
  const refused = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
  const { fetchImpl, calls } = fakeServers({
    queue: [msg(8), msg(9), msg(10), msg(11)],
    ppurioReplies: [timeout, json(500, { code: "9000" }), refused, json(400, { code: "2000", description: "bad to 01099998888" })],
  });
  const { worker } = makeWorker(fetchImpl);

  await worker.runOnce();
  assert.deepEqual(
    calls.reports.map((r) => [r.id, r.outcome]),
    [[8, "unknown"], [9, "unknown"], [10, "retry"], [11, "failed"]]
  );
  assert.equal(calls.reports[2].countAttempt, false);
  assert.ok(!calls.reports[3].resultMessage.includes("01099998888"), "뿌리오 설명 속 번호는 가림");
});

test("결과 보고가 실패하면 모아 뒀다가 다음 회차에 다시 보고", async () => {
  const { fetchImpl: base, calls } = fakeServers({ queue: [msg(12)] });
  let failReport = true;
  const fetchImpl = async (url, init) => {
    if (url.endsWith("/report") && failReport) {
      failReport = false;
      return json(500, { success: false, message: "down" });
    }
    return base(url, init);
  };
  const { worker } = makeWorker(fetchImpl);

  await worker.runOnce();
  assert.equal(calls.reports.length, 0);
  assert.equal(worker.pendingReports.length, 1);

  await worker.runOnce();
  assert.equal(calls.reports.length, 1);
  assert.equal(calls.reports[0].outcome, "sent");
  assert.equal(calls.messages.length, 1, "재보고 때 다시 보내지 않음");
});

test("토큰은 만료 1시간 전에 미리 갱신(문자가 없어도)", async () => {
  let now = Date.UTC(2026, 9, 15, 0, 0, 0);
  const { fetchImpl, calls } = fakeServers({
    tokenReplies: [json(200, { token: "t1", expired: "20261016090000" })], // KST 10/16 09:00 = UTC 10/16 00:00
  });
  const worker = new SmsWorker(
    { apiBase: API, secret: SECRET, workerId: "w", dryRun: false, pollMs: 1000, ppurio: { baseUrl: PPURIO, account: "a", apiKey: "k", from: "0212345678" } },
    { fetchImpl, log: () => {}, now: () => now }
  );

  await worker.runOnce();
  assert.equal(calls.tokens, 1);

  now += 22 * 3600 * 1000; // 만료 2시간 전
  await worker.runOnce();
  assert.equal(calls.tokens, 1);

  now += 1.5 * 3600 * 1000; // 만료 30분 전
  await worker.runOnce();
  assert.equal(calls.tokens, 2);
});

test("보조 함수", () => {
  assert.equal(parsePpurioExpired("20261016090000"), Date.UTC(2026, 9, 16, 0, 0, 0));
  assert.equal(parsePpurioExpired("bad"), null);
  assert.equal(sanitize("to 01012345678 fail"), "to [숫자] fail");
  assert.equal(classifyResponse(200, { code: "1000", messageKey: "k" }).outcome, "sent");
  assert.equal(classifyResponse(429, {}).countAttempt, false);
  assert.equal(classifyNetworkError({ cause: { code: "ENOTFOUND" } }).outcome, "retry");
  assert.equal(classifyNetworkError({ cause: { code: "ECONNRESET" } }).outcome, "unknown");

  const { problems } = readConfig({ SMS_DRY_RUN: "0", SMS_WORKER_SECRET: "short" });
  assert.ok(problems.some((p) => p.includes("SMS_WORKER_SECRET")));
  assert.ok(problems.some((p) => p.includes("PPURIO_ACCOUNT")));
  assert.deepEqual(readConfig({ SMS_WORKER_SECRET: SECRET }).problems, [], "모의 발송은 뿌리오 설정 없이 동작");
});
