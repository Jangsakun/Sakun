-- ============================================================
-- 근태 SaaS — 출퇴근 기록 수정 이력 추적 (D)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 이 SQL 은 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--    BISEO 자체 Supabase 에는 실행하지 마세요.
--
-- BISEO(biseo/web) 의 public.attendance_audit_log 와는 다른 테이블입니다.
--   - attendance_audit_log      : BISEO 자체 DB. BISEO 인라인 수정 경로(confirm/mutate) 전용.
--                                 pending_action_id 를 필수로 요구하므로 관리자 UI 에서 재사용 불가.
--   - attendance_record_audit   : 이 파일. 근태 DB. 관리자 화면 수정/추가/삭제 전용.
-- 두 코드베이스가 같은 attendance_records 를 수정하므로, 나중에 한쪽으로 합칠 수 있도록
-- 컬럼 구성을 호환되게 잡아둡니다(record_id / employee_id / field / old_value / new_value).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) attendance_records.updated_at
--    ★ 애플리케이션 코드가 아니라 트리거로 채웁니다.
--      근태 SaaS 와 BISEO 두 코드베이스가 같은 테이블을 수정하므로,
--      코드에서 채우면 BISEO 경로의 수정이 누락됩니다.
-- ------------------------------------------------------------
alter table public.attendance_records
  add column if not exists updated_at timestamptz;

comment on column public.attendance_records.updated_at is
  '마지막 UPDATE 시각. 트리거가 자동 관리한다(INSERT 시에는 null — 최초 생성은 created_at 을 본다).';

create or replace function public.set_attendance_records_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists attendance_records_set_updated_at on public.attendance_records;

create trigger attendance_records_set_updated_at
  before update on public.attendance_records
  for each row
  execute function public.set_attendance_records_updated_at();


-- ------------------------------------------------------------
-- 2) 감사 테이블
--    record_id 에 FK 를 걸지 않습니다 — 삭제된 기록의 이력이 함께 사라지면
--    삭제 감사 자체가 무의미해집니다.
-- ------------------------------------------------------------
create table if not exists public.attendance_record_audit (
  id           bigserial   primary key,
  record_id    bigint,
  employee_id  bigint,
  action       text        not null check (action in ('update', 'insert', 'delete')),
  field        text,
  old_value    text,
  new_value    text,
  source       text        not null,
  actor        text,
  request_ip   text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

comment on table public.attendance_record_audit is
  '관리자 화면에서 발생한 attendance_records 변경 이력. 성공한 변경만 기록한다. BISEO 의 attendance_audit_log(별도 DB)와 다른 테이블.';
comment on column public.attendance_record_audit.record_id is
  'attendance_records.id. 삭제 이력 보존을 위해 FK 를 걸지 않는다.';
comment on column public.attendance_record_audit.field is
  '변경된 컬럼명(현재는 checked_at). insert/delete 는 null 가능.';
comment on column public.attendance_record_audit.source is
  '변경 경로. admin-time-edit | admin-manual-add | admin-delete';
comment on column public.attendance_record_audit.actor is
  '현재 관리자 인증은 공용 비밀번호 1개(admin_auth 쿠키)라 개인 식별이 불가능하다. 항상 admin-ui. 사람별 추적이 필요해지면 관리자 계정 분리가 선행되어야 한다.';

create index if not exists attendance_record_audit_record_id_idx
  on public.attendance_record_audit(record_id);

create index if not exists attendance_record_audit_employee_created_idx
  on public.attendance_record_audit(employee_id, created_at desc);

create index if not exists attendance_record_audit_created_idx
  on public.attendance_record_audit(created_at desc);

-- RLS 켜고 정책을 만들지 않는다 = anon/authenticated 접근 전면 차단.
alter table public.attendance_record_audit enable row level security;

revoke all on table public.attendance_record_audit from anon, authenticated;

-- ⚠️ service_role 의 RLS bypass 와 테이블 GRANT 는 별개 권한 체계다.
--    (BISEO 0020 주석에 기록된 함정 — 여기서는 처음부터 같이 넣는다)
grant select, insert on public.attendance_record_audit to service_role;
grant usage, select on sequence public.attendance_record_audit_id_seq to service_role;

commit;

notify pgrst, 'reload schema';


-- ------------------------------------------------------------
-- 확인용 쿼리
-- ------------------------------------------------------------
-- select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='attendance_records' and column_name='updated_at';
-- select tgname from pg_trigger where tgname='attendance_records_set_updated_at';
-- select * from public.attendance_record_audit order by created_at desc limit 30;


-- ------------------------------------------------------------
-- 롤백
-- ------------------------------------------------------------
-- drop trigger if exists attendance_records_set_updated_at on public.attendance_records;
-- drop function if exists public.set_attendance_records_updated_at();
-- drop table if exists public.attendance_record_audit;
-- alter table public.attendance_records drop column if exists updated_at;
