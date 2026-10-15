// 뿌리오 문자 API 클라이언트 (https://www.ppurio.com/send-api/guide, 2026-10-15 확인)
//
//   토큰: POST {base}/v1/token  (Basic base64(계정:인증키)) → { token, type: "Bearer", expired: "YYYYMMDDHHMMSS" }  24시간 유효
//   발송: POST {base}/v1/message (Bearer 토큰)              → { code: "1000", description, refKey, messageKey }
//   뿌리오에는 발송 결과 조회 API·웹훅이 없습니다. code 1000 은 "접수 성공"이고 실제 도착 여부는
//   뿌리오 사이트 발송결과 페이지에서만 볼 수 있습니다.
//
// 결과 분류 원칙: "확실히 안 나간 것"만 자동 재시도하고, 나갔는지 모르는 것은 unknown(사람이 확인).
// 같은 문자가 두 번 나가는 것보다 한 번 덜 나가는 쪽이 낫다는 판단입니다(관리자 재발송 버튼이 있음).

/** 인증·계정·IP 문제 — 요청이 거부된 것이 확실하므로 재시도해도 되지만, 고쳐질 때까지 계속 실패한다 */
const CONFIG_ERRORS = {
  3001: "뿌리오 인증 헤더 오류(3001) — 계정/인증키 확인",
  3003: "뿌리오 연동 IP 미등록(3003) — 이 PC의 공인 IP가 뿌리오에 등록돼 있는지 확인",
  3004: "뿌리오 계정 오류(3004) — PPURIO_ACCOUNT 확인",
  3006: "뿌리오 인증 헤더 없음(3006)",
  3007: "뿌리오 토큰 발행 실패(3007)",
  4004: "뿌리오 API 접근 비활성(4004) — 연동 승인 상태 확인",
  4006: "뿌리오 인증키 오류(4006) — PPURIO_API_KEY 확인",
  4007: "뿌리오 인증키 미발급(4007)",
};

const TOKEN_EXPIRED_CODES = new Set(["3002", "3005"]);

/** 연결 자체가 안 된 네트워크 오류 — 요청이 뿌리오에 닿지 않았으므로 다시 보내도 중복이 아니다 */
const NOT_SENT_NETWORK_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"]);

/** 뿌리오 설명 문구에 번호 같은 긴 숫자가 섞여 있으면 가립니다(로그·DB 에 번호를 남기지 않기 위해) */
export function sanitize(text) {
  return String(text ?? "")
    .replace(/\d{8,}/g, "[숫자]")
    .slice(0, 200);
}

/**
 * HTTP 응답 → 처리 결과
 *   outcome: sent | failed | unknown | retry | token_expired
 *   countAttempt=false : 시도 횟수에 넣지 않음(확실히 안 나감)
 *   pause=true         : 설정 문제 — 워커가 몇 분 쉬고 관리자 화면에 오류를 띄움
 */
export function classifyResponse(httpStatus, body) {
  const code = String(body?.code ?? "");
  const description = sanitize(body?.description);

  if (httpStatus === 200 && code === "1000") {
    return { outcome: "sent", resultCode: code, resultMessage: "뿌리오 접수 성공", messageKey: body?.messageKey ?? null };
  }

  if (TOKEN_EXPIRED_CODES.has(code)) {
    return { outcome: "token_expired", resultCode: code, resultMessage: description };
  }

  if (httpStatus === 429 || code === "3008") {
    return { outcome: "retry", resultCode: code || "429", resultMessage: "뿌리오 요청 속도 제한", countAttempt: false, retryAfterSeconds: 30 };
  }

  if (CONFIG_ERRORS[code]) {
    return {
      outcome: "retry",
      resultCode: code,
      resultMessage: CONFIG_ERRORS[code],
      countAttempt: false,
      retryAfterSeconds: 300,
      pause: true,
    };
  }

  // 뿌리오 서버 오류는 접수됐는지 알 수 없음
  if (httpStatus >= 500 || code.startsWith("9")) {
    return { outcome: "unknown", resultCode: code || String(httpStatus), resultMessage: `뿌리오 서버 오류 — 발송결과 페이지 확인 필요 ${description}`.trim() };
  }

  // 요청 내용 문제(번호 형식 등) — 다시 보내도 같은 결과
  if (httpStatus === 400 || code === "2000") {
    return { outcome: "failed", resultCode: code || "400", resultMessage: description || "뿌리오가 요청을 거부함" };
  }

  return { outcome: "unknown", resultCode: code || String(httpStatus), resultMessage: `예상하지 못한 응답 — 발송결과 페이지 확인 필요 ${description}`.trim() };
}

export function classifyNetworkError(error) {
  const code = error?.cause?.code || error?.code || error?.name || "NETWORK";

  if (NOT_SENT_NETWORK_CODES.has(code)) {
    return { outcome: "retry", resultCode: code, resultMessage: "뿌리오 연결 안 됨(인터넷 확인)", countAttempt: false, retryAfterSeconds: 60 };
  }

  // 시간 초과·연결 끊김: 요청이 뿌리오에 닿았을 수도 있음
  return { outcome: "unknown", resultCode: code, resultMessage: "뿌리오 응답 없음(시간 초과/연결 끊김) — 발송결과 페이지 확인 필요" };
}

/** "YYYYMMDDHHMMSS"(한국 시간) → epoch ms. 형식이 다르면 null */
export function parsePpurioExpired(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(value ?? ""));

  if (!m) return null;

  const [, y, mo, d, h, mi, s] = m.map(Number);

  return Date.UTC(y, mo - 1, d, h - 9, mi, s);
}

export class PpurioClient {
  /** 만료 1시간 전부터 새 토큰을 받습니다 */
  static REFRESH_MARGIN_MS = 60 * 60 * 1000;

  constructor({ baseUrl, account, apiKey, from, timeoutMs = 20000, fetchImpl = fetch, now = Date.now }) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.account = account;
    this.apiKey = apiKey;
    this.from = from;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
    this.now = now;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  tokenNeedsRefresh() {
    return !this.token || this.tokenExpiresAt - this.now() < PpurioClient.REFRESH_MARGIN_MS;
  }

  /**
   * 토큰 받기. 실패하면 { ok:false, ...classify 결과 } — 토큰 단계 실패는 문자를 보내기 전이므로 항상 "안 나감"입니다.
   */
  async refreshToken() {
    let res;
    let body = null;

    try {
      res = await this.fetch(`${this.baseUrl}/v1/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${this.account}:${this.apiKey}`).toString("base64")}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      body = await res.json().catch(() => null);
    } catch (error) {
      const code = error?.cause?.code || error?.code || error?.name || "NETWORK";

      return { ok: false, outcome: "retry", resultCode: code, resultMessage: "뿌리오 토큰 발급 연결 실패", countAttempt: false, retryAfterSeconds: 60 };
    }

    if (res.ok && body?.token) {
      this.token = body.token;
      this.tokenExpiresAt = parsePpurioExpired(body.expired) ?? this.now() + 23 * 60 * 60 * 1000;

      return { ok: true, expiresAt: this.tokenExpiresAt };
    }

    this.token = null;
    const code = String(body?.code ?? res.status);

    return {
      ok: false,
      outcome: "retry",
      resultCode: code,
      resultMessage: CONFIG_ERRORS[code] ?? `뿌리오 토큰 발급 실패(${code}) ${sanitize(body?.description)}`.trim(),
      countAttempt: false,
      retryAfterSeconds: 300,
      pause: true,
    };
  }

  async postMessage(message, refKey) {
    const payload = {
      account: this.account,
      messageType: message.messageType,
      content: message.content,
      from: this.from,
      duplicateFlag: "N",
      targetCount: 1,
      targets: [{ to: message.to }],
      refKey,
    };

    if (message.messageType === "LMS" && message.subject) payload.subject = message.subject;

    try {
      const res = await this.fetch(`${this.baseUrl}/v1/message`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const body = await res.json().catch(() => null);

      return classifyResponse(res.status, body);
    } catch (error) {
      return classifyNetworkError(error);
    }
  }

  /** 문자 1건 보내기. 토큰이 만료됐다는 응답이면 새 토큰으로 딱 한 번 다시 보냅니다(만료 응답 = 거부됨 = 안 나감). */
  async send(message) {
    const refKey = `o${message.id}`;

    if (this.tokenNeedsRefresh()) {
      const t = await this.refreshToken();
      if (!t.ok) return { ...t, refKey };
    }

    let result = await this.postMessage(message, refKey);

    if (result.outcome === "token_expired") {
      const t = await this.refreshToken();
      if (!t.ok) return { ...t, refKey };

      result = await this.postMessage(message, refKey);

      if (result.outcome === "token_expired") {
        result = { outcome: "retry", resultCode: result.resultCode, resultMessage: "뿌리오 토큰 거부가 반복됨", countAttempt: false, retryAfterSeconds: 300, pause: true };
      }
    }

    return { ...result, refKey };
  }
}
