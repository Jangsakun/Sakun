import type { Metadata } from "next";
import DownloadForm from "./DownloadForm";

// 문자로 받은 서명본 다운로드 링크. 앱 로그인 없이 생년월일 6자리만 확인합니다.

export const metadata: Metadata = {
  title: "근로계약서 서명본 받기",
  // 주소에 든 토큰이 다른 사이트로 새지 않게 + 검색에 안 잡히게
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function ContractLinkPage() {
  return <DownloadForm />;
}
