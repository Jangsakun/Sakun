-- ============================================================
-- 근태 SaaS — 주휴수당 대상/비대상 변경 이력 (2026-10-27 사용자 요청)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--
-- 문제: 직원정보의 주휴수당 상태는 하나뿐이라, 비대상으로 지난주 급여를 이체한 뒤 대상으로 바꾸면
--       지난주까지 주휴수당이 붙은 금액으로 다시 계산됐다.
-- 해결: 상태를 바꿀 때마다 이 표에 남기고, 변경은 "바꾼 날이 속한 주(월~일)"부터 적용한다.
--       그 전 주는 바꾸기 전 상태로 계산한다. (app/lib/weeklyAllowanceHistory.ts)
-- ============================================================

begin;

create table if not exists public.weekly_allowance_status_changes (
  id                    bigserial   primary key,
  employee_id           bigint      not null references public.employees(id) on delete cascade,
  old_status            text,
  new_status            text        not null,
  effective_week_start  date        not null,
  changed_at            timestamptz not null default now()
);

create index if not exists weekly_allowance_status_changes_emp_idx
  on public.weekly_allowance_status_changes (employee_id, effective_week_start);

comment on table public.weekly_allowance_status_changes is
  '주휴수당 상태 변경 이력. effective_week_start(월요일) 주부터 new_status, 그 전 주는 old_status.';

alter table public.weekly_allowance_status_changes enable row level security;
revoke all on table public.weekly_allowance_status_changes from anon, authenticated, service_role;
grant select, insert on public.weekly_allowance_status_changes to service_role;
grant usage, select on sequence public.weekly_allowance_status_changes_id_seq to service_role;

-- 이력 표가 생기기 전에 바꾼 건: 한나라(306) 10/27 비대상 → 대상 (10/19~25 주는 비대상으로 이체 완료)
insert into public.weekly_allowance_status_changes (employee_id, old_status, new_status, effective_week_start)
select 306, '비대상', '대상', date '2026-10-26'
 where not exists (
   select 1 from public.weekly_allowance_status_changes where employee_id = 306 and effective_week_start = date '2026-10-26'
 );

commit;

notify pgrst, 'reload schema';

select employee_id, old_status, new_status, effective_week_start from public.weekly_allowance_status_changes order by id;
