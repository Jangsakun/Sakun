#!/usr/bin/env node
/**
 * 문자 발송 워커 — 근태 앱(sakun.kr) 대기열의 문자를 뿌리오로 보냅니다.
 *
 *   실행: node sms-worker/worker.mjs          (설정: sms-worker/.env, 안내: sms-worker/README.md)
 *   상시 실행: sms-worker/install-task.ps1 로 Windows 작업 스케줄러에 등록
 *
 * 뿌리오는 미리 등록한 IP 에서만 발송을 받기 때문에, 고정 IP 가 없는 Vercel 대신
 * 등록된 IP 를 가진 이 PC(또는 나중에 고정 IP 클라우드 서버)에서 돌립니다.
 * 워커는 DB 에 직접 붙지 않고 근태 앱 내부 API 만 부릅니다(이 PC 에 Supabase 키 없음).
 *
 * 로그(logs/sms-worker.log)에는 가린 번호(010-****-1234)와 결과 코드만 남기고,
 * 문자 본문·인증키·토큰은 남기지 않습니다.
 */

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SmsWorker, VERSION, readConfig } from "./lib/core.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(here, ".env");
const LOG_DIR = path.join(here, "logs");
const LOG_FILE = path.join(LOG_DIR, "sms-worker.log");
const LOG_MAX_BYTES = 5 * 1024 * 1024;
// 같은 PC 에서 워커가 두 개 뜨지 않게 하는 잠금(이 포트를 먼저 잡은 쪽만 실행). DB 잠금이 한 겹 더 있습니다.
const LOCK_PORT = 47651;

fs.mkdirSync(LOG_DIR, { recursive: true });

function log(...args) {
  const line = `${new Date().toISOString()} ${args.join(" ")}`;

  console.log(line);

  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > LOG_MAX_BYTES) {
      fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    }

    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {
    // 로그 파일 실패로 워커가 멈추면 안 됩니다
  }
}

function acquireLock() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(null));
    server.listen(LOCK_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

  const lock = await acquireLock();

  if (!lock) {
    log("[중복 실행] 이미 다른 워커가 실행 중이라 종료합니다.");
    process.exit(0);
  }

  const { config, problems } = readConfig();

  if (problems.length > 0) {
    log(`[설정 오류] ${problems.join(" / ")} — ${ENV_FILE} 를 확인하세요.`);
    process.exit(1);
  }

  log(`[시작] v${VERSION} worker=${config.workerId} mode=${config.dryRun ? "모의 발송(dry-run)" : "실발송(live)"} api=${config.apiBase} 주기=${config.pollMs / 1000}초`);

  const worker = new SmsWorker(config, { log });

  const stop = (signal) => {
    log(`[종료 요청] ${signal} — 지금 처리 중인 문자까지만 끝냅니다.`);
    worker.stop();
    setTimeout(() => process.exit(0), 30000).unref();
  };

  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("unhandledRejection", (reason) => log(`[처리 안 된 오류] ${reason?.message ?? reason}`));

  // .env 를 고쳐 저장하면 스스로 종료 → 감시 스크립트(run-worker.ps1)가 1분 뒤 새 설정으로 다시 켭니다.
  fs.watchFile(ENV_FILE, { interval: 10000 }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs) stop("설정 파일 변경");
  });

  await worker.loop();
  log("[종료]");
  lock.close();
  process.exit(0);
}

main().catch((error) => {
  log(`[치명적 오류] ${error?.stack ?? error}`);
  process.exit(1);
});
