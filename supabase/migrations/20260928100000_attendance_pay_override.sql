-- ============================================================
-- 근태 SaaS — 세전급여 수동 수정(하루 단위 고정 금액)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 이 SQL 은 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--    BISEO 자체 Supabase 에는 실행하지 마세요.
--
-- 무엇을 하는가
--   관리자가 출퇴근 기록 화면에서 "그 날 그 사람의 세전급여"를 직접 입력하면
--   근무시간 × 시급 계산을 무시하고 입력한 금액을 쓴다.
--   일당으로 합의했거나 추가수당을 얹는 경우를 위한 것이다.
--
-- 어디에 반영되는가
--   출퇴근 기록 화면 / 출퇴근 엑셀·CSV / 급여 탭 / 급여 엑셀 /
--   은행제출용 다건이체 / 근로자 본인 화면  — 전부.
--   즉 실제 송금액이 바뀐다.
--
-- 주휴수당은 이 표가 건드리지 않는다.
--   주휴수당은 지금처럼 근무시간과 평균시급으로 계산되고,
--   평균시급은 (수정된 기본급 합계 ÷ 총 근무시간) 으로 자연스럽게 따라간다.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) 세전급여 수정 테이블
--    키는 (직원, 날짜) 하나. 같은 날 두 번 수정하면 덮어쓴다.
--
--    일부러 attendance_records 에 컬럼을 붙이지 않았다.
--    하루치 기록은 출근행 + 퇴근행 두 줄이라 어느 줄에 붙여도
--    "한 줄만 지웠을 때" 금액이 같이 사라지거나 남는 문제가 생긴다.
-- ------------------------------------------------------------
create table if not exists public.attendance_pay_override (
  id           bigserial   primary key,
  employee_id  bigint      not null references public.employees(id) on delete cascade,
  work_date    date        not null,
  gross_pay    integer     not null check (gross_pay >= 0 and gross_pay <= 100000000),
  memo         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  unique (employee_id, work_date)
);

comment on table public.attendance_pay_override is
  '관리자가 직접 지정한 하루치 세전급여. 이 행이 있으면 근무시간 × 시급 계산 대신 이 금액을 쓴다. 급여·은행제출용까지 전부 반영된다.';
comment on column public.attendance_pay_override.work_date is
  '한국시간(KST) 기준 근무일. 출퇴근 기록 화면에서 한 줄로 묶이는 그 날짜와 같다.';
comment on column public.attendance_pay_override.gross_pay is
  '세전급여(원). 세후급여는 여기에 0.967 을 곱해 자동 계산하므로 따로 저장하지 않는다.';
comment on column public.attendance_pay_override.memo is
  '왜 고쳤는지. 나중에 왜 이 금액인지 모르게 되는 것을 막는다.';

-- 급여 계산은 "기간 + 직원 여러 명"으로 조회하므로 날짜 인덱스가 필요하다.
-- (employee_id, work_date) 는 위 unique 제약이 이미 인덱스를 만든다.
create index if not exists attendance_pay_override_work_date_idx
  on public.attendance_pay_override(work_date);

create or replace function public.set_attendance_pay_override_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists attendance_pay_override_set_updated_at on public.attendance_pay_override;

create trigger attendance_pay_override_set_updated_at
  before update on public.attendance_pay_override
  for each row
  execute function public.set_attendance_pay_override_updated_at();

-- RLS 켜고 정책을 만들지 않는다 = anon/authenticated 접근 전면 차단.
-- 급여 금액이라 브라우저 키로는 절대 읽히면 안 된다.
alter table public.attendance_pay_override enable row level security;

revoke all on table public.attendance_pay_override from anon, authenticated;

-- ⚠️ service_role 의 RLS bypass 와 테이블 GRANT 는 별개 권한 체계다.
grant select, insert, update, delete on public.attendance_pay_override to service_role;
grant usage, select on sequence public.attendance_pay_override_id_seq to service_role;


-- ------------------------------------------------------------
-- 2) 감사 테이블에 근무일 컬럼 추가
--    금액 수정 이력은 "언제 한 수정이냐"가 아니라
--    "어느 근무일의 금액이냐"가 핵심이라 날짜를 따로 남긴다.
--    기존 시간수정/추가/삭제 이력에는 null 로 남는다.
-- ------------------------------------------------------------
alter table public.attendance_record_audit
  add column if not exists work_date date;

comment on column public.attendance_record_audit.work_date is
  '세전급여 수정(source=admin-pay-override)에서 대상 근무일. 그 외 경로는 null.';

commit;

notify pgrst, 'reload schema';


-- ------------------------------------------------------------
-- 확인용 쿼리
-- ------------------------------------------------------------
-- select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='attendance_pay_override' order by ordinal_position;
-- select * from public.attendance_pay_override order by work_date desc limit 30;
-- select * from public.attendance_record_audit where source='admin-pay-override' order by created_at desc limit 30;


-- ------------------------------------------------------------
-- 롤백
-- ------------------------------------------------------------
-- drop trigger if exists attendance_pay_override_set_updated_at on public.attendance_pay_override;
-- drop function if exists public.set_attendance_pay_override_updated_at();
-- drop table if exists public.attendance_pay_override;
-- alter table public.attendance_record_audit drop column if exists work_date;
