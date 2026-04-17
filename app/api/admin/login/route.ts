import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { password } = body;

    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return NextResponse.json(
        { success: false, message: "ADMIN_PASSWORD 환경변수가 없습니다." },
        { status: 500 }
      );
    }

    if (!password) {
      return NextResponse.json(
        { success: false, message: "비밀번호를 입력해주세요." },
        { status: 400 }
      );
    }

    if (password !== adminPassword) {
      return NextResponse.json(
        { success: false, message: "비밀번호가 틀렸습니다." },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: "로그인 성공",
    });

    response.cookies.set("admin_auth", "ok", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "로그인 오류",
      },
      { status: 500 }
    );
  }
}