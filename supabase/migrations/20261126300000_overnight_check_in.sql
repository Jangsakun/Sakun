-- ============================================================
-- 근태 SaaS — 자정 넘어 출근한 야간 근무 (2026-11-26 사용자 요청)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--
-- 왜
--   한나라 11/25 00:41 출근 → 03:45 퇴근이 "출근 기록이 없어 퇴근할 수 없습니다"로 10번 실패.
--   새벽 06:00 전 퇴근은 전날 근무로 보는데, 출근은 찍힌 날(25일) 그대로라 짝이 안 맞았다.
--
-- 바뀌는 규칙
--   새벽 05:00(KST) 전 "출근"도 전날 근무로 본다. 2026-11-20 이후 기록에만 적용
--   (그 전 기록 — 유원미 11/17 02:30 등 — 은 그대로 두라는 요청).
--   앱 쪽 같은 규칙: app/lib/workTime.ts attendanceWorkDateKey
--
-- record_attendance() 는 이 함수로 근무일을 계산하므로 따로 바꿀 것이 없다.
-- 함수가 바뀌므로 중복 불가 인덱스를 다시 만든다(실행 시점 충돌 0건 확인).
-- ============================================================

begin;

create or replace function public.attendance_work_date(p_at timestamptz, p_record_type text)
returns date
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case
    when p_record_type = 'check_out'
     and extract(hour from (p_at at time zone 'Asia/Seoul')) < 6
      then (p_at at time zone 'Asia/Seoul')::date - 1
    when p_record_type = 'check_in'
     and extract(hour from (p_at at time zone 'Asia/Seoul')) < 5
     and (p_at at time zone 'Asia/Seoul')::date >= date '2026-11-20'
      then (p_at at time zone 'Asia/Seoul')::date - 1
    else (p_at at time zone 'Asia/Seoul')::date
  end
$$;

comment on function public.attendance_work_date(timestamptz, text) is
  '기록이 속한 근무일(KST). 새벽 06:00 전 퇴근, 새벽 05:00 전 출근(2026-11-20~)은 전날. app/lib/workTime.ts attendanceWorkDateKey 와 같음.';

drop index if exists public.attendance_records_one_per_day_idx;

create unique index attendance_records_one_per_day_idx
  on public.attendance_records (
    employee_id,
    public.attendance_work_date(checked_at, record_type),
    segment_type,
    record_type
  );

commit;

-- 확인 (따로 실행): 24일 / 25일 / 17일 이 나오면 정상
-- select public.attendance_work_date('2026-11-25 00:41:00+09', 'check_in'),
--        public.attendance_work_date('2026-11-25 05:00:00+09', 'check_in'),
--        public.attendance_work_date('2026-11-17 02:30:00+09', 'check_in');
