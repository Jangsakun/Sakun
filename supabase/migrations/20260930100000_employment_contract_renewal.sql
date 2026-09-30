-- ============================================================
-- 근태 SaaS — 근로계약 11개월 갱신 + 첫입사일 + 갱신 기록
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 이 SQL 은 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--    BISEO 자체 Supabase 에는 실행하지 마세요.
-- ⚠️ 코드 배포 "전에" 먼저 실행해야 합니다.
--    새 코드는 employees.first_hire_date 를 조회하므로, 이 컬럼이 없으면
--    직원·근로계약 화면이 오류가 납니다.
--
-- 기존 데이터는 바꾸지 않습니다. first_hire_date 는 전원 빈 값으로 시작합니다.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) 첫입사일
--    관리자가 직접 입력한다. 갱신할 때 비어 있으면 그 직전 계약 시작일로 한 번 채운다.
-- ------------------------------------------------------------
alter table public.employees
  add column if not exists first_hire_date date;

comment on column public.employees.first_hire_date is
  '첫입사일. 관리자가 직접 입력. 11개월 갱신 시 비어 있으면 직전 계약 시작일로 자동 채움(이미 값이 있으면 건드리지 않음).';


-- ------------------------------------------------------------
-- 2) 갱신 기록
--    employee_id 에 FK 를 걸지 않는다.
--    직원을 지우면 기록도 같이 사라지게 되는데, 2026-09-30 조사에서
--    삭제 후 재등록된 직원의 과거를 복원할 근거가 없어 곤란했다.
--    같은 이유로 이름도 함께 남긴다.
-- ------------------------------------------------------------
create table if not exists public.employment_contract_history (
  id              bigserial   primary key,
  employee_id     bigint      not null,
  employee_name   text,
  previous_start  date,
  previous_end    date        not null,
  new_start       date        not null,
  new_end         date        not null,
  actor           text        not null default 'admin-ui',
  request_ip      text,
  user_agent      text,
  created_at      timestamptz not null default now(),
  -- 계약 사이에 빈 날도 겹치는 날도 없어야 한다
  constraint employment_contract_history_contiguous check (new_start = previous_end + 1),
  constraint employment_contract_history_order      check (new_end > new_start)
);

comment on table public.employment_contract_history is
  '근로계약 갱신 기록. 11개월 갱신 버튼으로 바뀐 계약기간을 한 줄씩 남긴다. 수정·삭제 없이 쌓기만 한다.';
comment on column public.employment_contract_history.employee_id is
  'employees.id. 직원을 지워도 기록이 남도록 FK 를 걸지 않는다.';
comment on column public.employment_contract_history.actor is
  '현재 관리자 인증은 공용 비밀번호 1개라 개인 식별이 불가능하다. 항상 admin-ui.';

create index if not exists employment_contract_history_employee_idx
  on public.employment_contract_history(employee_id, created_at desc);

alter table public.employment_contract_history enable row level security;

revoke all on table public.employment_contract_history from anon, authenticated;

-- ⚠️ service_role 의 RLS bypass 와 테이블 GRANT 는 별개 권한 체계다.
--    쌓기만 하는 기록이라 update/delete 는 주지 않는다.
grant select, insert on public.employment_contract_history to service_role;
grant usage, select on sequence public.employment_contract_history_id_seq to service_role;


-- ------------------------------------------------------------
-- 3) 갱신 함수
--    계약 변경 + 첫입사일 채움 + 기록 추가를 한 트랜잭션으로 처리한다.
--    셋 중 하나라도 실패하면 전부 취소된다(바뀌었는데 기록이 없는 상태가 생기지 않음).
--
--    두 번 눌러 22개월이 되는 사고 방지:
--      직원 행을 잠그고(FOR UPDATE) "현재 만료일 = 화면에서 본 만료일"일 때만 바꾼다.
--      동시에 두 번 들어와도 두 번째는 잠금이 풀린 뒤 바뀐 만료일을 보고 stale 로 끝난다.
--
--    날짜 계산(11개월, 월말 보정)은 서버 코드에서 한다. 여기서는 앞뒤가 맞는지만 확인한다.
-- ------------------------------------------------------------
create or replace function public.renew_employment_contract(
  p_employee_id  bigint,
  p_expected_end date,
  p_new_start    date,
  p_new_end      date,
  p_request_ip   text,
  p_user_agent   text
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_emp         record;
  v_history_id  bigint;
  v_first_hire  date;
begin
  if p_expected_end is null
     or p_new_start is distinct from p_expected_end + 1
     or p_new_end is null
     or p_new_end <= p_new_start then
    return jsonb_build_object('ok', false, 'code', 'bad_dates');
  end if;

  select id, name, contract_start_date, contract_end_date, first_hire_date
    into v_emp
    from public.employees
   where id = p_employee_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_emp.contract_end_date is null then
    return jsonb_build_object('ok', false, 'code', 'no_end_date');
  end if;

  if v_emp.contract_end_date <> p_expected_end then
    return jsonb_build_object(
      'ok', false,
      'code', 'stale',
      'current_start', v_emp.contract_start_date,
      'current_end', v_emp.contract_end_date
    );
  end if;

  v_first_hire := coalesce(v_emp.first_hire_date, v_emp.contract_start_date);

  update public.employees
     set contract_start_date = p_new_start,
         contract_end_date   = p_new_end,
         first_hire_date     = v_first_hire
   where id = p_employee_id;

  insert into public.employment_contract_history (
    employee_id, employee_name,
    previous_start, previous_end,
    new_start, new_end,
    actor, request_ip, user_agent
  )
  values (
    v_emp.id, v_emp.name,
    v_emp.contract_start_date, v_emp.contract_end_date,
    p_new_start, p_new_end,
    'admin-ui', p_request_ip, p_user_agent
  )
  returning id into v_history_id;

  return jsonb_build_object(
    'ok', true,
    'history_id', v_history_id,
    'employee_name', v_emp.name,
    'previous_start', v_emp.contract_start_date,
    'previous_end', v_emp.contract_end_date,
    'new_start', p_new_start,
    'new_end', p_new_end,
    'first_hire_date', v_first_hire,
    'first_hire_filled', v_emp.first_hire_date is null and v_first_hire is not null
  );
end;
$$;

comment on function public.renew_employment_contract(bigint, date, date, date, text, text) is
  '근로계약 11개월 갱신. 현재 만료일이 p_expected_end 와 같을 때만 바꾸고 기록을 남긴다. 서버(service_role)만 호출 가능.';

-- ⚠️ 함수는 기본으로 누구나(PUBLIC) 실행할 수 있다. 막지 않으면 브라우저 키로
--    아무 직원의 계약을 갱신할 수 있게 된다.
revoke all on function public.renew_employment_contract(bigint, date, date, date, text, text)
  from public, anon, authenticated;
grant execute on function public.renew_employment_contract(bigint, date, date, date, text, text)
  to service_role;

commit;

notify pgrst, 'reload schema';


-- ------------------------------------------------------------
-- 확인용 쿼리
-- ------------------------------------------------------------
-- select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='employees' and column_name='first_hire_date';
-- select * from public.employment_contract_history order by created_at desc limit 30;
-- select grantee, privilege_type from information_schema.role_routine_grants
--   where routine_name = 'renew_employment_contract';


-- ------------------------------------------------------------
-- 롤백
-- ------------------------------------------------------------
-- drop function if exists public.renew_employment_contract(bigint, date, date, date, text, text);
-- drop table if exists public.employment_contract_history;
-- alter table public.employees drop column if exists first_hire_date;
