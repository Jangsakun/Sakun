import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/app/lib/telegram/sendMessage";
import { detectIntent } from "@/app/lib/bot/detectIntent";
import { executeIntent } from "@/app/lib/bot/executeIntent";

type TelegramWebhookBody = {
  message?: {
    text?: string;
    chat?: {
      id?: number;
    };
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TelegramWebhookBody;

    const allowedChatIdsRaw = process.env.TELEGRAM_ALLOWED_CHAT_IDS;

    if (!allowedChatIdsRaw) {
      return NextResponse.json(
        { success: false, message: "TELEGRAM_ALLOWED_CHAT_IDS 환경변수가 없습니다." },
        { status: 500 }
      );
    }

    const allowedChatIds = allowedChatIdsRaw
      .split(",")
      .map((id) => id.trim().replace(/^"|"$/g, ""));

    const chatId = String(body.message?.chat?.id || "");
    const text = body.message?.text?.trim() || "";

    if (!chatId) {
      return NextResponse.json({
        success: true,
        message: "chat_id가 없는 요청이라 종료합니다.",
      });
    }

    if (!allowedChatIds.includes(chatId)) {
      await sendTelegramMessage(chatId, "접근 권한이 없습니다.");
      return NextResponse.json({
        success: true,
        message: "허용되지 않은 chat_id 요청 차단",
      });
    }

    if (!text) {
      await sendTelegramMessage(chatId, "텍스트 메시지만 처리할 수 있습니다.");
      return NextResponse.json({
        success: true,
        message: "텍스트 없음",
      });
    }

    const intent = detectIntent(text);
    const replyText = await executeIntent(intent);

    await sendTelegramMessage(chatId, replyText);

    return NextResponse.json({
      success: true,
      message: "메시지 처리 완료",
    });
  } catch (error) {
    console.error("telegram webhook error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "알 수 없는 오류",
      },
      { status: 500 }
    );
  }
}