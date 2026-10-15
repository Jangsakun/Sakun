// 문자 워커 본체 — 근태 앱 대기열에서 가져가기 → 뿌리오 발송 → 결과 보고.
// 실행 위치(사무실 PC / 클라우드 서버)와 무관합니다. 설정은 전부 config 로만 받습니다.

import os from "node:os";
import { PpurioClient } from "./ppurio.mjs";

export const VERSION = "1.0.0";
const BATCH = 5;

export function readConfig(env = process.env) {
  const dryRun = env.SMS_DRY_RUN !== "0";
  const config = {
    apiBase: String(env.SMS_API_BASE_URL || "https://sakun.kr").replace(/\/+$/, ""),
    secret: env.SMS_WORKER_SECRET || "",
    workerId: (env.SMS_WORKER_ID || os.hostname()).replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 40),
    dryRun,
    pollMs: Math.max(Number(env.SMS_POLL_SECONDS) || 30, 5) * 1000,
    ppurio: {
      baseUrl: env.PPURIO_BASE_URL || "https://message.ppurio.com",
      account: env.PPURIO_ACCOUNT || "",
      apiKey: env.PPURIO_API_KEY || "",
      from: String(env.PPURIO_FROM || "").replace(/\D/g, ""),
    },
  };

  const problems = [];

  if (config.secret.length < 32) problems.push("SMS_WORKER_SECRET 이 없거나 32자 미만");

  if (!dryRun) {
    if (!config.ppurio.account) problems.push("PPURIO_ACCOUNT 없음");
    if (!config.ppurio.apiKey) problems.push("PPURIO_API_KEY 없음");
    if (!/^\d{8,12}$/.test(config.ppurio.from)) problems.push("PPURIO_FROM(발신번호) 없음/형식 오류");
  }

  return { config, problems };
}

export class SmsWorker {
  constructor(config, { log, fetchImpl = fetch, now = Date.now, ppurio } = {}) {
    this.config = config;
    this.log = log ?? ((...a) => console.log(...a));
    this.fetch = fetchImpl;
    this.now = now;
    this.ppurio = ppurio ?? (config.dryRun ? null : new PpurioClient({ ...config.ppurio, fetchImpl, now }));
    this.pauseUntil = 0;
    this.lastError = null;
    this.pendingReports = [];
    this.stopping = false;
  }

  async api(path, body) {
    const res = await this.fetch(`${this.config.apiBase}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.success) {
      const error = new Error(`근태 앱 API ${path} 실패 HTTP ${res.status} ${json?.message ?? ""}`.trim());
      error.httpStatus = res.status;
      throw error;
    }

    return json;
  }

  setError(message) {
    if (message && message !== this.lastError) this.log(`[오류] ${message}`);
    if (!message && this.lastError) this.log("[복구] 오류 해제");
    this.lastError = message;
  }

  /** 결과 보고. 실패하면 모아 뒀다가 다음 회차에 다시 보냅니다(그 사이 10분이 지나면 DB 가 unknown 처리). */
  async report(entry) {
    try {
      const r = await this.api("/api/internal/sms/report", { workerId: this.config.workerId, ...entry });
      return r.status;
    } catch (error) {
      this.log(`[보고 실패] #${entry.id} ${error.message} — 다음 회차에 다시 보고`);
      this.pendingReports.push(entry);
      return null;
    }
  }

  async flushReports() {
    const list = this.pendingReports.splice(0);

    for (const entry of list) await this.report(entry);
  }

  /** 뿌리오 토큰을 만료 1시간 전에 미리 갱신(문자가 없어도). 인증·IP 문제를 일찍 알아채는 효과도 있습니다. */
  async keepTokenFresh() {
    if (!this.ppurio || this.now() < this.pauseUntil || !this.ppurio.tokenNeedsRefresh()) return;

    const t = await this.ppurio.refreshToken();

    if (t.ok) {
      this.log(`[토큰] 뿌리오 토큰 갱신 — 만료 ${new Date(t.expiresAt).toISOString()}`);
      if (this.lastError?.startsWith("뿌리오")) this.setError(null);
    } else {
      this.setError(t.resultMessage);
      if (t.pause) this.pauseUntil = this.now() + (t.retryAfterSeconds ?? 300) * 1000;
    }
  }

  async handle(message) {
    let result;

    if (this.config.dryRun) {
      result = { outcome: "sent", resultCode: "DRYRUN", resultMessage: "모의 발송(실제로 보내지 않음)", refKey: `o${message.id}` };
    } else {
      result = await this.ppurio.send(message);
    }

    if (result.pause) {
      this.pauseUntil = this.now() + (result.retryAfterSeconds ?? 300) * 1000;
      this.setError(result.resultMessage);
    } else if (result.outcome === "sent" && this.lastError?.startsWith("뿌리오")) {
      this.setError(null);
    }

    const status = await this.report({
      id: message.id,
      outcome: result.outcome,
      resultCode: result.resultCode,
      resultMessage: result.resultMessage,
      messageKey: result.messageKey ?? null,
      refKey: result.refKey,
      retryAfterSeconds: result.retryAfterSeconds,
      countAttempt: result.countAttempt !== false,
      dryRun: this.config.dryRun,
    });

    // 번호는 가린 값만, 본문은 남기지 않습니다.
    this.log(`#${message.id} ${message.toMasked} ${message.messageType} → ${result.outcome} (${result.resultCode})${status ? ` DB:${status}` : ""}`);

    return result;
  }

  /** 1회차: 밀린 보고 → 토큰 점검 → 가져가기(+연결 기록) → 하나씩 발송. 가져온 개수를 돌려줍니다. */
  async runOnce() {
    await this.flushReports();
    await this.keepTokenFresh();

    const paused = this.now() < this.pauseUntil;
    let claimed;

    try {
      claimed = await this.api("/api/internal/sms/claim", {
        workerId: this.config.workerId,
        mode: this.config.dryRun ? "dry-run" : "live",
        version: VERSION,
        host: os.hostname(),
        limit: BATCH,
        lastError: this.lastError,
        heartbeatOnly: paused,
      });
    } catch (error) {
      this.log(`[연결 실패] ${error.message}`);
      return 0;
    }

    const messages = claimed.messages ?? [];

    for (let i = 0; i < messages.length; i++) {
      // 앞 문자에서 설정 오류가 나면 나머지는 보내지 않고 대기열로 돌려놓습니다(시도 횟수 미포함).
      if (this.now() < this.pauseUntil) {
        await this.report({
          id: messages[i].id,
          outcome: "retry",
          resultCode: "PAUSED",
          resultMessage: this.lastError ?? "워커 일시 중지",
          countAttempt: false,
          retryAfterSeconds: Math.ceil((this.pauseUntil - this.now()) / 1000),
          dryRun: this.config.dryRun,
        });
        continue;
      }

      await this.handle(messages[i]);
    }

    return messages.length;
  }

  /** 종료 요청. 대기 중이면 바로 깨워서, 처리 중이면 그 문자까지만 끝내고 멈춥니다. */
  stop() {
    this.stopping = true;
    this.wakeUp?.();
  }

  async loop(
    sleep = (ms) =>
      new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        this.wakeUp = () => {
          clearTimeout(timer);
          resolve();
        };
      })
  ) {
    while (!this.stopping) {
      let count = 0;

      try {
        count = await this.runOnce();
      } catch (error) {
        this.log(`[예상 못한 오류] ${error?.message ?? error}`);
      }

      // 꽉 차게 가져왔으면 밀린 문자가 더 있을 수 있으니 바로 다음 회차
      if (count < BATCH && !this.stopping) await sleep(this.config.pollMs);
    }
  }
}
