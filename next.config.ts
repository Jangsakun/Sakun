import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 근로계약서 PDF 를 만드는 서버 경로는 원본 양식·글꼴·직인 파일을 직접 읽습니다.
  // 코드에서 import 하지 않는 파일이라 배포 묶음에 자동으로 안 들어가므로 명시합니다.
  outputFileTracingIncludes: {
    "/api/worker/econtract/**": ["./assets/contracts/**/*"],
  },
};

export default nextConfig;
