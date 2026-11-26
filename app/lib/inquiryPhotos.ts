import type { SupabaseClient } from "@supabase/supabase-js";

// 서버 전용. 문의사항 사진(비공개 저장소 inquiry-photos).

export const INQUIRY_PHOTO_BUCKET = "inquiry-photos";
export const MAX_INQUIRY_PHOTOS = 3;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const SIGNED_URL_SECONDS = 60 * 60;

/** 화면이 보낸 data URL(JPEG) → 바이트. 형식이 틀리면 null. */
export function decodeJpegDataUrl(value: unknown): Buffer | null {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(value ?? ""));

  if (!match) return null;

  const bytes = Buffer.from(match[1], "base64");

  // JPEG 시작 표식(FF D8 FF) 확인 — 이름만 사진인 다른 파일을 막습니다.
  if (bytes.length < 100 || bytes.length > MAX_PHOTO_BYTES) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;

  return bytes;
}

/** 저장된 경로들 → 1시간짜리 열람 URL. 실패한 것은 빠집니다. */
export async function signInquiryPhotos(supabase: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  if (paths.length === 0) return result;

  const { data } = await supabase.storage.from(INQUIRY_PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);

  for (const item of data ?? []) {
    if (item.path && item.signedUrl) result.set(item.path, item.signedUrl);
  }

  return result;
}

export function photoPathsOf(row: Record<string, unknown>): string[] {
  const value = row.photo_paths;

  return Array.isArray(value) ? value.filter((p): p is string => typeof p === "string") : [];
}
