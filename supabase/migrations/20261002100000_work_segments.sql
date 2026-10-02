-- ============================================================
-- 근태 SaaS — 근로형태 3종 + 출퇴근 기록 구간 종류
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 이 SQL 은 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--    BISEO 자체 Supabase 에는 실행하지 마세요.
-- ⚠️ 코드 배포 "전에" 먼저 실행해야 합니다.
--    (관리자 화면에서 '시급+도급'을 저장하면 hybrid 값이 들어가는데,
--     이 SQL 전에는 기존 check 제약이 거절합니다)
--    이 SQL 만 먼저 실행해도 기존 화면·급여는 그대로 동작합니다(새 칸은 기본값이 채워짐).
--
-- 무엇을 하는가
--   1) employees.contract_type 에 'hybrid'(시급+도급) 허용
--        hourly : 시급만
--        piece  : 도급만 (출퇴근은 찍되 하루 고정 일급)
--        hybrid : 시급 근무 후 이어서 도급 근무 / 도급만 하는 날도 있음
--      도급 일급은 기존 employees.daily_wage 칸을 그대로 씁니다.
--   2) attendance_records.segment_type 추가 ('hourly' | 'piece')
--      기존 기록은 기본값으로 전부 'hourly' 가 됩니다.
--   3) attendance_records.piece_daily_wage_snapshot 추가
--      도급 기록을 만들 때 그 날 기준 일급을 저장합니다.
--      나중에 직원 일급을 바꿔도 과거 급여는 바뀌지 않습니다.
--      (시급의 hourly_wage_snapshot 과 같은 원리)
-- ============================================================

begin;

-- 1) 근로형태 3종 -------------------------------------------------
alter table public.employees
  drop constraint if exists employees_contract_type_check;

alter table public.employees
  add constraint employees_contract_type_check
  check (contract_type in ('hourly', 'piece', 'hybrid'));

comment on column public.employees.contract_type is
  '근로형태. hourly=시급, piece=도급(출퇴근 기록 있는 날 일급), hybrid=시급+도급(같은 날 시급 구간 뒤 도급 구간 가능). 관리자만 변경.';
comment on column public.employees.daily_wage is
  '도급 일급(원, 세전). contract_type 이 piece/hybrid 일 때 쓴다. 도급 기록 생성 시 attendance_records.piece_daily_wage_snapshot 으로 복사된다.';

-- 2) 구간 종류 ----------------------------------------------------
-- 상수 기본값이 있는 not null 칸 추가는 기존 행 전체에 즉시 'hourly' 가 채워진다(테이블 재작성 없음).
alter table public.attendance_records
  add column if not exists segment_type text not null default 'hourly';

alter table public.attendance_records
  drop constraint if exists attendance_records_segment_type_check;

alter table public.attendance_records
  add constraint attendance_records_segment_type_check
  check (segment_type in ('hourly', 'piece'));

comment on column public.attendance_records.segment_type is
  '구간 종류. hourly=시급 구간, piece=도급 구간. 같은 날 hybrid 직원은 두 구간이 모두 있을 수 있다.';

-- 3) 도급 일급 스냅샷 ---------------------------------------------
alter table public.attendance_records
  add column if not exists piece_daily_wage_snapshot integer;

alter table public.attendance_records
  drop constraint if exists attendance_records_piece_snapshot_check;

-- 시급 구간에는 일급 스냅샷이 없어야 한다(잘못 섞여 이중 지급되는 것을 막는다).
alter table public.attendance_records
  add constraint attendance_records_piece_snapshot_check
  check (
    piece_daily_wage_snapshot is null
    or (
      segment_type = 'piece'
      and piece_daily_wage_snapshot >= 0
      and piece_daily_wage_snapshot <= 10000000
    )
  );

comment on column public.attendance_records.piece_daily_wage_snapshot is
  '도급 구간 기록 생성 당시의 일급(원, 세전). 급여는 이 값으로 계산한다. 시급 구간은 null.';

commit;

notify pgrst, 'reload schema';


-- ------------------------------------------------------------
-- 권한(GRANT) 확인
-- ------------------------------------------------------------
-- 새 칸은 테이블 단위 권한을 그대로 따릅니다. 단, 이 테이블에 "칸 단위" 권한이
-- 따로 걸려 있으면 새 칸은 빠지므로 아래 두 쿼리로 확인합니다.
--
-- ① 새 칸과 기존 hourly_wage_snapshot 칸의 권한 비교
--    두 결과가 같으면 정상(새 칸도 기존 칸과 똑같이 읽고 쓸 수 있음).
-- select column_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
--   from information_schema.column_privileges
--  where table_schema = 'public' and table_name = 'attendance_records'
--    and column_name in ('hourly_wage_snapshot', 'segment_type', 'piece_daily_wage_snapshot')
--    and grantee in ('anon', 'authenticated', 'service_role')
--  group by 1, 2 order by 2, 1;
--
-- ② 테이블 권한 현황 (참고용)
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_schema = 'public' and table_name in ('attendance_records', 'employees')
--  order by 1, 2;


-- ------------------------------------------------------------
-- 확인용 쿼리
-- ------------------------------------------------------------
-- select segment_type, count(*) from public.attendance_records group by 1;   -- 전부 hourly
-- select contract_type, count(*) from public.employees group by 1;


-- ------------------------------------------------------------
-- 롤백 (도급 기록이 생기기 전까지만 안전. 코드도 함께 되돌려야 함)
-- ------------------------------------------------------------
-- alter table public.attendance_records drop constraint if exists attendance_records_piece_snapshot_check;
-- alter table public.attendance_records drop column if exists piece_daily_wage_snapshot;
-- alter table public.attendance_records drop constraint if exists attendance_records_segment_type_check;
-- alter table public.attendance_records drop column if exists segment_type;
-- alter table public.employees drop constraint if exists employees_contract_type_check;
-- alter table public.employees add constraint employees_contract_type_check
--   check (contract_type in ('hourly', 'piece'));
