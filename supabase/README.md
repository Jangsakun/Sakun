# Supabase DB 용량 모니터링

근태 SaaS 전용 Supabase 프로젝트(`weaydriyldnfuotzigzh`)의 DB 사용량을 관리자 화면에서 보기 위한 설정입니다.
**BISEO / 클로브 등 다른 Supabase 프로젝트에는 적용하지 않았습니다.**

## 1회 설정 (필수)

1. Supabase Dashboard → SQL Editor 를 연다
2. `migrations/20260828100000_db_size_monitor.sql` 내용을 통째로 붙여넣고 **Run**
3. 관리자 페이지 → **DB 용량** 탭에서 값이 뜨는지 확인

이 SQL 이 만드는 것:

| 이름 | 종류 | 역할 |
|---|---|---|
| `public.db_size_snapshots` | 테이블 | 날짜 PK + 용량 bytes. 하루 1행. 365일 초과분 자동 삭제 |
| `public.get_db_size_bytes()` | RPC | `pg_database_size()` 현재값 조회 |
| `public.record_db_size_snapshot()` | RPC | 오늘(KST) 스냅샷 upsert + 오래된 행 정리 |
| `record-db-size-daily` | pg_cron 잡 | 매일 UTC 01:00 = **KST 10:00** 자동 기록 |

테이블은 RLS 켜고 정책을 안 만들었으므로 `anon`/`authenticated` 키로는 접근 불가.
서버 라우트에서 `SUPABASE_SERVICE_ROLE_KEY` 로만 읽습니다.

## 스케줄러: pg_cron 대신 HTTP 를 쓰려면

pg_cron 이 안 되는 경우에만 씁니다. SQL 4번 블록은 실패해도 1~3번을 롤백하지 않습니다.

1. 환경변수 `CRON_SECRET` 을 아무 긴 랜덤 문자열로 설정 (로컬 `.env.local` + Vercel 양쪽)
2. `vercel.json` 의 크론이 매일 UTC 01:00(KST 10:00)에 `/api/cron/db-size-snapshot` 을 호출
   - Vercel Cron 은 `Authorization: Bearer $CRON_SECRET` 을 자동으로 붙여줍니다
   - 다른 스케줄러면 `?key=<CRON_SECRET>` 도 됩니다
3. `CRON_SECRET` 이 없으면 이 라우트는 500 으로 거부합니다 (무인증 호출 방지)

pg_cron 과 HTTP 를 둘 다 켜도 안전합니다. 같은 날짜는 upsert 라 행이 중복되지 않습니다.

## 환경변수

| 이름 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `SUPABASE_DB_LIMIT_MB` | 아니오 | `500` | 플랜 한도(MB). 무료 플랜 500MB 기준 |
| `CRON_SECRET` | HTTP 스케줄러 쓸 때만 | 없음 | `/api/cron/db-size-snapshot` 인증용 |

## 화면 계산식 (전부 고정 수식, 예측 모델 없음)

- **사용률** = 현재 용량 ÷ 한도
- **평균 일일 증가량** = (창 안의 마지막 스냅샷 − 첫 스냅샷) ÷ 두 날짜 간격(일)
  - 창은 화면에서 최근 7 / 14 / 30일 중 선택
- **한도 도달까지** = (한도 − 현재 용량) ÷ 평균 일일 증가량
  - 개월 환산은 ÷ 30.4375

스냅샷이 **7일치 미만**이면 계산하지 않고 `"N일 후 계산 가능"` 을 표시합니다.
증가량이 0 이하면 `"증가 없음"`, 이미 한도를 넘었으면 `"한도 초과"` 로 빠집니다.

## 관련 파일

- `app/lib/dbSize.ts` — 계산 로직 (서버/클라이언트 공용)
- `app/api/admin/db-size/route.ts` — GET 조회 / POST 수동 스냅샷 (관리자 쿠키 필요)
- `app/api/cron/db-size-snapshot/route.ts` — 스케줄러용 (CRON_SECRET 필요)
- `app/admin/components/DbSizeTab.tsx` — 관리자 "DB 용량" 탭 UI
