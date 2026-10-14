import fs from "fs";
import path from "path";

// 서버 전용. 근로계약서 양식 PDF·글꼴·직인을 읽습니다.
// 배포 묶음 포함은 next.config.ts 의 outputFileTracingIncludes 가 맡습니다.

const cache = new Map<string, Uint8Array>();

export function readAsset(relativePath: string): Uint8Array {
  const cached = cache.get(relativePath);

  if (cached) return cached;

  // 저장소 밖 경로를 읽지 못하게 막습니다(DB 에 적힌 경로를 그대로 쓰므로).
  if (!/^assets\/contracts\/[A-Za-z0-9_./-]+$/.test(relativePath) || relativePath.includes("..")) {
    throw new Error(`허용되지 않은 파일 경로입니다: ${relativePath}`);
  }

  // 경로를 assets/contracts 아래로 못박아 둡니다. process.cwd() 와 변수만 붙이면
  // 번들러가 프로젝트 전체를 배포 묶음에 넣으려 합니다(Turbopack NFT 경고).
  const inside = relativePath.slice("assets/contracts/".length);
  const bytes = new Uint8Array(fs.readFileSync(path.join(process.cwd(), "assets", "contracts", inside)));
  cache.set(relativePath, bytes);

  return bytes;
}

export const CONTRACT_FONT_PATH = "assets/contracts/fonts/NanumGothic-Regular.ttf";
