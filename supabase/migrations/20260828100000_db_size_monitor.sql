-- ============================================================
-- 근태 SaaS 전용 Supabase — DB 용량 모니터링
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run 하면 됩니다.
-- (근태 SaaS 프로젝트에만 적용. BISEO/클로브 Supabase에는 실행하지 마세요.)
-- ============================================================

-- ------------------------------------------------------------
-- 1) 일별 스냅샷 테이블
--    스냅샷 자체가 용량을 잡아먹지 않도록 최소 스키마로 유지합니다.
--    1일 1행(날짜 PK) · 행당 약 40바이트 · 1년치 365행 ≈ 15KB.
-- ------------------------------------------------------------
create table if not exists public.db_size_snapshots (
  snapshot_date date primary key,
  size_bytes    bigint      not null,
  created_at    timestamptz not null default now()
);

comment on table public.db_size_snapshots is
  'pg_database_size() 일별 스냅샷. record_db_size_snapshot()이 하루 1행 upsert하고 365일 초과분을 삭제한다.';

-- RLS 켜고 정책을 만들지 않는다 = anon/authenticated 는 읽기·쓰기 전부 차단.
-- service_role 키는 RLS를 우회하므로 서버 라우트에서만 접근 가능.
alter table public.db_size_snapshots enable row level security;

revoke all on table public.db_size_snapshots from anon, authenticated;


-- ------------------------------------------------------------
-- 2) 현재 DB 용량 조회 (pg_database_size)
--    PostgREST(supabase-js)는 임의 SQL을 못 돌리므로 RPC로 감쌉니다.
-- ------------------------------------------------------------
create or replace function public.get_db_size_bytes()
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select pg_database_size(current_database());
$$;

revoke all on function public.get_db_size_bytes() from public, anon, authenticated;
grant execute on function public.get_db_size_bytes() to service_role;


-- ------------------------------------------------------------
-- 3) 오늘(KST) 스냅샷 기록 + 1년 이상 지난 스냅샷 정리
--    하루에 몇 번 호출돼도 같은 날짜 행을 갱신하므로 행이 늘지 않습니다.
-- ------------------------------------------------------------
create or replace function public.record_db_size_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  today_kst     date   := (now() at time zone 'Asia/Seoul')::date;
  current_bytes bigint := pg_database_size(current_database());
  deleted_count integer;
begin
  insert into public.db_size_snapshots (snapshot_date, size_bytes)
  values (today_kst, current_bytes)
  on conflict (snapshot_date) do update
    set size_bytes = excluded.size_bytes,
        created_at = now();

  -- 365일 초과 스냅샷 정리
  delete from public.db_size_snapshots
  where snapshot_date < today_kst - 365;

  get diagnostics deleted_count = row_count;

  return jsonb_build_object(
    'snapshot_date', today_kst,
    'size_bytes',    current_bytes,
    'deleted_count', deleted_count
  );
end;
$$;

revoke all on function public.record_db_size_snapshot() from public, anon, authenticated;
grant execute on function public.record_db_size_snapshot() to service_role;


-- ------------------------------------------------------------
-- 4) 매일 1회 자동 기록 — pg_cron (권장)
--    KST 10:00 = UTC 01:00. pg_cron 스케줄은 UTC 기준입니다.
--    같은 jobname 으로 다시 실행하면 덮어써지므로 재실행해도 안전합니다.
--
--    pg_cron 을 못 쓰는 환경이면 이 블록을 건너뛰고
--    /api/cron/db-size-snapshot 을 외부 스케줄러(Vercel Cron 등)로 호출하세요.
-- ------------------------------------------------------------
--    pg_cron 을 못 쓰면 실패해도 위 1~3번(테이블/함수)은 그대로 남도록
--    DO 블록으로 감싸서 예외를 삼킵니다.
do $outer$
begin
  execute 'create extension if not exists pg_cron';
  execute $q$
    select cron.schedule(
      'record-db-size-daily',
      '0 1 * * *',
      $cron$select public.record_db_size_snapshot();$cron$
    )
  $q$;

  raise notice 'pg_cron 등록 완료 — 매일 UTC 01:00 (KST 10:00) 실행';
exception when others then
  raise notice 'pg_cron 설정 실패(%) — 테이블/함수는 정상 생성됐습니다. /api/cron/db-size-snapshot 을 외부 스케줄러로 호출하세요.', sqlerrm;
end
$outer$;

--    위 DO 블록이 안 먹으면 아래 2줄을 따로 실행해도 결과는 같습니다.
--    create extension if not exists pg_cron;
--    select cron.schedule('record-db-size-daily', '0 1 * * *', 'select public.record_db_size_snapshot();');


-- ------------------------------------------------------------
-- 5) 즉시 첫 스냅샷 1건 기록 (오늘 값 바로 넣어두기)
-- ------------------------------------------------------------
select public.record_db_size_snapshot();


-- ------------------------------------------------------------
-- 확인용 쿼리
-- ------------------------------------------------------------
-- select * from public.db_size_snapshots order by snapshot_date desc limit 30;
-- select jobname, schedule, active from cron.job where jobname = 'record-db-size-daily';
-- select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'record-db-size-daily') order by start_time desc limit 10;
