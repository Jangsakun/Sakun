import type { ReactNode } from "react";

// 관리자 화면 전용 래퍼. 입력칸 글자색 고정(globals.css 의 .admin-scope 규칙)에 쓰입니다.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="admin-scope">{children}</div>;
}
