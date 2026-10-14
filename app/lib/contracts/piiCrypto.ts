import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// 서버 전용. 계약서에 들어가는 주민등록번호(외국인등록번호)를 암호화합니다.
//
// ▸ AES-256-GCM. 키는 환경변수 CONTRACT_PII_KEY(32바이트를 base64 로)에만 둡니다.
//   DB 에는 키가 없으므로 DB 가 통째로 유출돼도 번호를 풀 수 없습니다.
// ▸ 저장 형식: "v1:" + base64(IV 12바이트 | 인증태그 16바이트 | 암호문)
//   인증태그 덕분에 암호문이 한 글자라도 바뀌면 복호화가 실패합니다(몰래 바꿔치기 방지).
// ▸ 복호화는 계약서 PDF 를 만들 때만 합니다. 화면·로그에는 가린 값(900101-1******)만 씁니다.
// ▸ 기존 employees.resident_number(평문)는 이번 범위가 아닙니다(2026-10-14 결정).

const VERSION = "v1";
const AAD = Buffer.from("employment_contracts.resident_number");

export function loadPiiKey(raw = process.env.CONTRACT_PII_KEY): Buffer {
  if (!raw) {
    throw new Error("CONTRACT_PII_KEY 환경변수가 없습니다.");
  }

  const key = Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error("CONTRACT_PII_KEY 는 32바이트를 base64 로 인코딩한 값이어야 합니다.");
  }

  return key;
}

export function encryptPii(plain: string, key: Buffer = loadPiiKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);

  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${VERSION}:${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
}

export function decryptPii(token: string, key: Buffer = loadPiiKey()): string {
  const [version, body] = String(token || "").split(":");

  if (version !== VERSION || !body) {
    throw new Error("암호화된 값의 형식이 올바르지 않습니다.");
  }

  const raw = Buffer.from(body, "base64");

  if (raw.length < 12 + 16 + 1) {
    throw new Error("암호화된 값이 손상되었습니다.");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAAD(AAD);
  decipher.setAuthTag(raw.subarray(12, 28));

  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
