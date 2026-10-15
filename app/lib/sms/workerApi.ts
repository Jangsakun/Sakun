import { createHash, timingSafeEqual } from "node:crypto";

// 서버 전용. 문자 워커(sms-worker/) 전용 내부 API 의 인증.
//
// 워커는 DB 에 직접 붙지 않고 이 API 만 씁니다. 그래서 워커 PC 에는 Supabase 서비스 키를 두지 않고
// SMS_WORKER_SECRET 하나만 둡니다(Vercel 환경변수와 워커 .env 에 같은 값).

export const WORKER_ID_PATTERN = /^[A-Za-z0-9_.-]{1,40}$/;

export function isSmsWorkerRequest(request: Request) {
  const secret = process.env.SMS_WORKER_SECRET || "";

  // 비밀값이 없거나 너무 짧으면 내부 API 를 아예 닫습니다.
  if (secret.length < 32) return false;

  const header = request.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";

  // 길이가 달라도 같은 시간이 걸리게 해시끼리 비교
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();

  return timingSafeEqual(a, b) && given.length > 0;
}
