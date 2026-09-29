-- ============================================================
-- 근태 SaaS — 계약형태(시급 / 도급)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 이 SQL 은 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--    BISEO 자체 Supabase 에는 실행하지 마세요.
-- ⚠️ 코드 배포 "전에" 먼저 실행해야 합니다.
--    새 코드는 이 컬럼을 조회하므로, 컬럼이 없으면 직원·급여 화면이 오류가 납니다.
--
-- 무엇을 하는가
--   hourly (시급) : 지금과 동일. 근무시간 × 시급 + 주휴수당.
--   piece  (도급) : 출근 기록이 있는 날마다 daily_wage(일당)를 지급. 퇴근 기록 불필요.
--                   주휴수당 없음.
--   계약형태는 관리자 화면에서만 바꿀 수 있다(근로자 가입 경로는 이 값을 쓰지 않는다).
--
-- 기존 직원과 신규 가입자는 default 'hourly' 로 전부 시급이 된다.
-- ============================================================

begin;

alter table public.employees
  add column if not exists contract_type text not null default 'hourly';

alter table public.employees
  add column if not exists daily_wage integer;

alter table public.employees
  drop constraint if exists employees_contract_type_check;

alter table public.employees
  add constraint employees_contract_type_check
  check (contract_type in ('hourly', 'piece'));

alter table public.employees
  drop constraint if exists employees_daily_wage_check;

alter table public.employees
  add constraint employees_daily_wage_check
  check (daily_wage is null or (daily_wage >= 0 and daily_wage <= 10000000));

comment on column public.employees.contract_type is
  '계약형태. hourly=시급(근무시간×시급), piece=도급(출근한 날마다 daily_wage 지급, 주휴수당 없음). 관리자만 변경.';
comment on column public.employees.daily_wage is
  '도급 일당(원, 세전). contract_type=piece 일 때만 쓴다.';

commit;

notify pgrst, 'reload schema';


-- ------------------------------------------------------------
-- 확인용 쿼리
-- ------------------------------------------------------------
-- select contract_type, count(*) from public.employees group by 1;


-- ------------------------------------------------------------
-- 롤백 (코드도 함께 되돌려야 함)
-- ------------------------------------------------------------
-- alter table public.employees drop constraint if exists employees_daily_wage_check;
-- alter table public.employees drop constraint if exists employees_contract_type_check;
-- alter table public.employees drop column if exists daily_wage;
-- alter table public.employees drop column if exists contract_type;
