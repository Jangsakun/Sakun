// 기기 연결표 (2026-10-30 사용자 요청) — 서버 전용
//
// 당근·카톡 같은 앱 안의 브라우저에서 가입하면, 폰 기본 브라우저(크롬/사파리)는 그 가입을 모릅니다
// (브라우저끼리 저장 공간이 따로라서). 가입 직후 1회용 연결표를 만들어 주소에 붙여 기본 브라우저로 열면,
// 기본 브라우저가 다시 입력 없이 그 직원으로 연결됩니다.
//
// 연결표 = 직원 id + 가입한 기기 id + 만료 시각에 서버 비밀값으로 서명한 값.
// 1회용: 연결하면 가입한 기기 id 의 연결이 새 기기로 바뀌므로, 같은 연결표는 다시 쓸 수 없습니다.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const DEVICE_LINK_TTL_MS = 10 * 60 * 1000;

type Payload = { e: number; d: string; x: number };

function secret() {
  const value = process.env.DEVICE_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!value) throw new Error("연결표 비밀값 없음");

  return value;
}

function sign(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createDeviceLinkToken(employeeId: number, deviceId: string, now = Date.now()) {
  const body = Buffer.from(
    JSON.stringify({ e: employeeId, d: deviceId, x: now + DEVICE_LINK_TTL_MS } satisfies Payload)
  ).toString("base64url");

  return `${body}.${sign(body)}`;
}

/** 서명·만료 확인. 틀리면 null */
export function readDeviceLinkToken(token: string, now = Date.now()): Payload | null {
  const [body, mac] = String(token || "").split(".");

  if (!body || !mac) return null;

  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(mac);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;

    if (!Number.isFinite(payload.e) || !payload.d || !Number.isFinite(payload.x)) return null;
    if (payload.x < now) return null;

    return payload;
  } catch {
    return null;
  }
}

/** 직원의 기기 연결을 이 기기 하나로 바꿉니다(재등록코드 재연결과 같은 방식). */
export async function relinkEmployeeDevice(supabase: SupabaseClient, employeeId: number, deviceId: string) {
  const { error: deleteError } = await supabase.from("employee_devices").delete().eq("employee_id", employeeId);

  if (deleteError) return deleteError;

  // 이 브라우저가 다른 직원으로 연결돼 있었다면 그 연결은 풉니다(한 브라우저 = 한 직원).
  const { error: deleteOtherError } = await supabase.from("employee_devices").delete().eq("device_id", deviceId);

  if (deleteOtherError) return deleteOtherError;

  const { error: insertError } = await supabase
    .from("employee_devices")
    .insert([{ employee_id: employeeId, device_id: deviceId }]);

  return insertError;
}
