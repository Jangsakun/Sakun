import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const { pathname, search } = request.nextUrl;

  // 1) admin.sakun.kr 로 접속하면 /admin 으로 보내기
  if (host === "admin.sakun.kr") {
    // 정적 파일, Next 내부 경로, 관리자 API는 그대로 통과
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/favicon.ico") ||
      pathname.startsWith("/robots.txt") ||
      pathname.startsWith("/sitemap.xml") ||
      pathname.match(/\.[^/]+$/) ||
      pathname.startsWith("/api/admin")
    ) {
      return NextResponse.next();
    }

    // 이미 /admin 경로면 그대로 통과
    if (!pathname.startsWith("/admin")) {
      const url = request.nextUrl.clone();
      url.pathname = `/admin${pathname === "/" ? "" : pathname}`;
      url.search = search;
      return NextResponse.redirect(url);
    }
  }

  // 2) 기존 관리자 보호 로직
  const isAdminPage = pathname.startsWith("/admin");
  const isAdminLoginPage = pathname.startsWith("/admin/login");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isAdminPage || isAdminLoginPage || isAdminApi) {
    return NextResponse.next();
  }

  const adminAuth = request.cookies.get("admin_auth")?.value;

  if (adminAuth === "ok") {
    return NextResponse.next();
  }

  const loginUrl = new URL("/admin/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};