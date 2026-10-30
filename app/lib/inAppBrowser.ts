// 앱 안 브라우저(당근·카카오톡·네이버·인스타 등) 감지와 폰 기본 브라우저로 열기 (2026-10-30 사용자 요청)
//
// 출퇴근은 폰 기본 브라우저(크롬/사파리)에서만 하도록 안내합니다. 앱 안 브라우저는 저장 공간이 따로라
// 거기서 가입하면 기본 브라우저의 sakun.kr 이 그 가입을 모릅니다.

const IN_APP_TOKENS = /KAKAOTALK|NAVER\(inapp|NAVER|Line\/|Instagram|FBAN|FBAV|FB_IAB|daangn|DaangnApp|Daum|whale\/.*inapp|everytimeApp|BAND\//i;

export function isInAppBrowser(ua = typeof navigator === "undefined" ? "" : navigator.userAgent) {
  if (!ua) return false;
  if (IN_APP_TOKENS.test(ua)) return true;
  // 안드로이드 웹뷰는 "; wv)" 표시가 붙습니다.
  if (/Android/i.test(ua) && /;\s*wv\)/i.test(ua)) return true;
  // 아이폰 앱 안 브라우저는 "Safari/" 가 빠져 있습니다(사파리·크롬·엣지는 있음).
  if (/iPhone|iPad|iPod/i.test(ua) && !/Safari\//i.test(ua)) return true;

  return false;
}

export function isIos(ua = typeof navigator === "undefined" ? "" : navigator.userAgent) {
  return /iPhone|iPad|iPod/i.test(ua);
}

/**
 * 주소를 폰 기본 브라우저로 엽니다.
 * - 카카오톡: 카톡 전용 "외부 브라우저로 열기" 주소
 * - 안드로이드: intent 주소(앱 지정 없음 → 기본 브라우저)
 * - 아이폰: iOS 17 이상 사파리 열기 주소. 안 되면 화면 안내(⋯ → 기본 브라우저로 열기)를 따릅니다.
 */
export function openInDefaultBrowser(url: string) {
  const ua = navigator.userAgent;
  const absolute = new URL(url, window.location.origin);

  if (/KAKAOTALK/i.test(ua)) {
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(absolute.toString())}`;
    return;
  }

  if (/Android/i.test(ua)) {
    window.location.href =
      `intent://${absolute.host}${absolute.pathname}${absolute.search}` +
      `#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(absolute.toString())};end`;
    return;
  }

  if (isIos(ua)) {
    window.location.href = `x-safari-${absolute.toString()}`;
    return;
  }

  window.location.href = absolute.toString();
}
