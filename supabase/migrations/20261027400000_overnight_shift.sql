-- ============================================================
-- 근태 SaaS — 야간 근무(자정 넘김) 출퇴근 (2026-10-27 사용자 요청)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--
-- 예) 19일 21:00 출근 → 20일 02:00 퇴근
--   규칙: 새벽 06:00(한국 시간) 전 "퇴근" 기록은 전날 근무의 퇴근으로 본다. 출근 기록은 찍힌 날 그대로.
--   앱 쪽 같은 규칙: app/lib/workTime.ts attendanceWorkDateKey (한쪽을 바꾸면 다른 쪽도 같이)
--
-- 바뀌는 것
--   1) attendance_work_date()  기록이 속한 근무일 계산 함수 (새로 만듦)
--   2) 중복 불가 제약          "같은 날(KST)" → "같은 근무일" 기준으로 다시 만듦
--                              (20일 02:00 퇴근은 19일 근무의 퇴근이라 20일 낮 근무 퇴근과 겹치지 않음)
--                              실행 시점 기존 기록 중 새벽 0~6시 기록은 0건 → 기존 기록에는 영향 없음
--   3) 퇴근 시각 보정/퇴근 가능 시간: 새벽 06:00 전 퇴근은 언제든 가능, 10분 단위 내림 (22시 이후와 같음)
--   4) record_attendance()     새벽 06:00 전 퇴근은 전날 근무의 출근을 찾아 퇴근 처리
--                              (그 외 규칙·문구·권한은 20261003110000 과 같음)
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) 근무일
-- ------------------------------------------------------------
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
    else (p_at at time zone 'Asia/Seoul')::date
  end
$$;

comment on function public.attendance_work_date(timestamptz, text) is
  '기록이 속한 근무일(KST). 새벽 06:00 전 퇴근은 전날 근무(야간 근무). app/lib/workTime.ts attendanceWorkDateKey 와 같음.';

revoke all on function public.attendance_work_date(timestamptz, text) from public;
grant execute on function public.attendance_work_date(timestamptz, text) to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 2) 중복 불가 제약: 같은 직원·같은 근무일·같은 구간·같은 출퇴근 종류는 1건
-- ------------------------------------------------------------
drop index if exists public.attendance_records_one_per_day_idx;

create unique index attendance_records_one_per_day_idx
  on public.attendance_records (
    employee_id,
    public.attendance_work_date(checked_at, record_type),
    segment_type,
    record_type
  );

comment on index public.attendance_records_one_per_day_idx is
  '같은 직원·같은 근무일(KST, 새벽 06:00 전 퇴근은 전날)·같은 구간·같은 출퇴근 종류는 1건.';

-- ------------------------------------------------------------
-- 3) 퇴근 시각 보정 / 퇴근 가능 시간 (20261015300000 + 새벽 06:00 전 규칙)
-- ------------------------------------------------------------
create or replace function public.attendance_normalize_check_out(
  p_at timestamptz,
  p_workplace text
) returns timestamptz
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_local timestamp := p_at at time zone 'Asia/Seoul';
  v_day   timestamp := date_trunc('day', v_local);
  v_hour  int := extract(hour from v_local)::int;
  v_min   int := extract(minute from v_local)::int;
  v_total int := v_hour * 60 + v_min;
  v_place text := coalesce(nullif(btrim(p_workplace), ''), '장사꾼');
begin
  -- 22:00 이후, 새벽 06:00 전(야간 근무): 10분 단위 내림
  if v_hour >= 22 or v_hour < 6 then
    return (v_day + make_interval(hours => v_hour, mins => (v_min / 10) * 10)) at time zone 'Asia/Seoul';
  end if;
  if v_place = '헤모즈' and v_total between 12 * 60 + 30 and 12 * 60 + 40 then
    return (v_day + interval '12 hours 30 minutes') at time zone 'Asia/Seoul';
  end if;
  if v_min <= 10 then
    return (v_day + make_interval(hours => v_hour)) at time zone 'Asia/Seoul';
  end if;
  if v_min <= 40 then
    return (v_day + make_interval(hours => v_hour, mins => 30)) at time zone 'Asia/Seoul';
  end if;
  return (v_day + make_interval(hours => v_hour + 1)) at time zone 'Asia/Seoul';
end;
$$;

create or replace function public.attendance_checkout_block_reason(
  p_at timestamptz,
  p_workplace text
) returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_local timestamp := p_at at time zone 'Asia/Seoul';
  v_hour  int := extract(hour from v_local)::int;
  v_min   int := extract(minute from v_local)::int;
  v_total int := v_hour * 60 + v_min;
  v_place text := coalesce(nullif(btrim(p_workplace), ''), '장사꾼');
  v_next_hour int := v_hour;
  v_next_min  int := 0;
begin
  -- 22:00 이후, 새벽 06:00 전(야간 근무): 언제든 가능
  if v_hour >= 22 or v_hour < 6 then
    return null;
  end if;
  if v_place = '헤모즈' and v_total between 12 * 60 + 30 and 12 * 60 + 40 then
    return null;
  end if;
  if v_total < 12 * 60 + 30 then
    return '12시 30분 이후부터 퇴근 가능합니다.';
  end if;
  if v_min between 0 and 10 or v_min between 30 and 40 then
    return null;
  end if;
  if v_min between 11 and 29 then
    v_next_min := 30;
  elsif v_min >= 41 then
    v_next_hour := v_hour + 1;
    v_next_min := 0;
  end if;
  return '퇴근 가능 시간이 아닙니다. 다음 가능 시간: '
    || lpad(v_next_hour::text, 2, '0') || ':' || lpad(v_next_min::text, 2, '0');
end;
$$;

-- ------------------------------------------------------------
-- 4) 출퇴근 저장 함수 — 근무일 기준
-- ------------------------------------------------------------
create or replace function public.record_attendance(
  p_employee_id  bigint,
  p_record_type  text,     -- 'check_in' | 'check_out'
  p_segment_type text,     -- 'hourly' | 'piece'
  p_lat          double precision,
  p_lng          double precision,
  p_accuracy     double precision,
  p_distance     integer
) returns table (
  record_id    bigint,
  checked_at   timestamptz,
  segment_type text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_now        timestamptz := now();   -- 서버(DB) 시각. 요청이 보낸 시각은 쓰지 않는다.
  -- 근무일: 새벽 06:00 전 퇴근이면 전날 근무(야간 근무), 그 외 오늘
  v_day        date := public.attendance_work_date(now(), p_record_type);
  -- 근무일 기록 범위: 근무일 00:00 ~ 다음날 06:00 (다음날 새벽 퇴근 포함)
  v_day_start  timestamptz := (v_day::timestamp) at time zone 'Asia/Seoul';
  v_day_end    timestamptz := ((v_day + 1)::timestamp + interval '6 hours') at time zone 'Asia/Seoul';
  v_emp        record;
  v_contract   text;
  v_place      text;
  v_is_hybrid  boolean;
  v_piece_lbl  text;
  v_hourly_in  boolean;
  v_hourly_out boolean;
  v_piece_in   boolean;
  v_piece_out  boolean;
  v_block      text;
  v_at         timestamptz;
  v_hourly_snapshot integer;
  v_piece_snapshot  integer;
  v_seg_in_hourly   integer;
  v_seg_in_piece    integer;
  v_id         bigint;
begin
  if p_record_type not in ('check_in', 'check_out') then
    raise exception '출퇴근 종류 값이 올바르지 않습니다.' using errcode = 'AT400';
  end if;
  if p_segment_type not in ('hourly', 'piece') then
    raise exception '구간 종류 값이 올바르지 않습니다.' using errcode = 'AT400';
  end if;

  -- 같은 직원의 요청은 한 번에 하나씩만 처리한다(버튼 연타·동시 요청).
  perform pg_advisory_xact_lock(20261003, p_employee_id::int);

  select e.id, e.contract_type, e.daily_wage, e.hourly_wage, e.workplace_name
    into v_emp
    from public.employees e
   where e.id = p_employee_id;

  if not found then
    raise exception '직원 정보를 찾을 수 없습니다.' using errcode = 'AT404';
  end if;

  v_contract  := case when v_emp.contract_type in ('piece', 'hybrid') then v_emp.contract_type else 'hourly' end;
  v_place     := coalesce(nullif(btrim(v_emp.workplace_name), ''), '장사꾼');
  v_is_hybrid := v_contract = 'hybrid';
  v_piece_lbl := case when v_is_hybrid then '도급 ' else '' end;

  -- 이 직원이 쓸 수 있는 구간인지 (attendanceFlow.ts isSegmentAllowedFor)
  if not v_is_hybrid and v_contract <> p_segment_type then
    raise exception '%',
      case when p_segment_type = 'piece'
        then '도급 출퇴근은 시급+도급 직원만 할 수 있습니다.'
        else '도급 직원은 도급 출퇴근만 기록할 수 있습니다.'
      end
      using errcode = 'AT409';
  end if;

  -- 이 근무일의 기록 상태
  select
    coalesce(bool_or(r.segment_type = 'hourly' and r.record_type = 'check_in'), false),
    coalesce(bool_or(r.segment_type = 'hourly' and r.record_type = 'check_out'), false),
    coalesce(bool_or(r.segment_type = 'piece'  and r.record_type = 'check_in'), false),
    coalesce(bool_or(r.segment_type = 'piece'  and r.record_type = 'check_out'), false)
    into v_hourly_in, v_hourly_out, v_piece_in, v_piece_out
    from public.attendance_records r
   where r.employee_id = p_employee_id
     and r.checked_at >= v_day_start
     and r.checked_at <  v_day_end
     and public.attendance_work_date(r.checked_at, r.record_type) = v_day;

  -- 하루 흐름 규칙 (attendanceFlow.ts checkAttendanceAction 과 같음)
  if p_segment_type = 'hourly' then
    if p_record_type = 'check_in' then
      if v_hourly_in then
        raise exception '%', case when v_hourly_out
          then '오늘은 이미 퇴근 처리되었습니다.'
          else '오늘은 이미 출근 처리되었습니다.' end
          using errcode = 'AT409';
      end if;
      if v_piece_in or v_piece_out then
        raise exception '오늘은 도급 근무를 먼저 시작해서 시급 출근을 할 수 없습니다. (도급 → 시급 순서 불가)'
          using errcode = 'AT409';
      end if;
    else
      if not v_hourly_in then
        raise exception '출근 기록이 없어 퇴근할 수 없습니다.' using errcode = 'AT409';
      end if;
      if v_hourly_out then
        raise exception '오늘은 이미 퇴근 처리되었습니다.' using errcode = 'AT409';
      end if;
    end if;
  else
    if p_record_type = 'check_in' then
      if v_piece_in then
        raise exception '%', case when v_piece_out
          then '오늘은 이미 ' || v_piece_lbl || '퇴근 처리되었습니다.'
          else '오늘은 이미 ' || v_piece_lbl || '출근 처리되었습니다.' end
          using errcode = 'AT409';
      end if;
      if v_hourly_in and not v_hourly_out then
        raise exception '시급 근무 중에는 도급 출근을 할 수 없습니다. 먼저 퇴근해주세요.'
          using errcode = 'AT409';
      end if;
    else
      if not v_piece_in then
        raise exception '%', v_piece_lbl || '출근 기록이 없어 ' || v_piece_lbl || '퇴근할 수 없습니다.'
          using errcode = 'AT409';
      end if;
      if v_piece_out then
        raise exception '%', '오늘은 이미 ' || v_piece_lbl || '퇴근 처리되었습니다.'
          using errcode = 'AT409';
      end if;
    end if;
  end if;

  -- 저장 시각: 시급은 기존 보정 규칙·퇴근 가능 시간, 도급은 DB 시각 그대로
  if p_segment_type = 'hourly' then
    if p_record_type = 'check_in' then
      v_at := public.attendance_normalize_check_in(v_now, v_place);
    else
      v_block := public.attendance_checkout_block_reason(v_now, v_place);
      if v_block is not null then
        raise exception '%', v_block using errcode = 'AT422';
      end if;
      v_at := public.attendance_normalize_check_out(v_now, v_place);
    end if;
  else
    v_at := v_now;
  end if;

  -- 금액 스냅샷
  --   시급: 출근 시 현재 시급(없으면 10320), 퇴근은 같은 구간 출근의 값을 이어 씀
  --   도급: 출근 시 현재 일급(없으면 비움), 퇴근은 같은 구간 출근의 값을 이어 씀
  select r.hourly_wage_snapshot, r.piece_daily_wage_snapshot
    into v_seg_in_hourly, v_seg_in_piece
    from public.attendance_records r
   where r.employee_id = p_employee_id
     and r.checked_at >= v_day_start
     and r.checked_at <  v_day_end
     and public.attendance_work_date(r.checked_at, r.record_type) = v_day
     and r.segment_type = p_segment_type
     and r.record_type = 'check_in'
   order by r.checked_at, r.id
   limit 1;

  v_hourly_snapshot := case
    when p_record_type = 'check_out' and coalesce(v_seg_in_hourly, 0) > 0 then v_seg_in_hourly
    when coalesce(v_emp.hourly_wage, 0) > 0 then v_emp.hourly_wage
    else 10320
  end;

  v_piece_snapshot := case
    when p_segment_type <> 'piece' then null
    when p_record_type = 'check_out' then v_seg_in_piece
    when coalesce(v_emp.daily_wage, 0) > 0 then v_emp.daily_wage
    else null
  end;

  begin
    insert into public.attendance_records (
      employee_id, record_type, segment_type, lat, lng, checked_at,
      accuracy, distance, hourly_wage_snapshot, piece_daily_wage_snapshot
    ) values (
      p_employee_id, p_record_type, p_segment_type, p_lat, p_lng, v_at,
      p_accuracy, p_distance, v_hourly_snapshot, v_piece_snapshot
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception '오늘은 이미 처리된 기록이 있습니다. 화면을 새로고침해주세요.'
      using errcode = 'AT409';
  end;

  return query select v_id, v_at, p_segment_type;
end;
$$;

comment on function public.record_attendance(bigint, text, text, double precision, double precision, double precision, integer) is
  '근로자 출퇴근 저장. DB 시각 기준, 직원별 잠금, 근무일(새벽 06:00 전 퇴근은 전날) 흐름 규칙. 2026-10-27 야간 근무.';

-- 권한은 기존과 같게 (create or replace 는 권한을 유지하지만 명시)
revoke all on function public.record_attendance(bigint, text, text, double precision, double precision, double precision, integer) from public;
grant execute on function public.record_attendance(bigint, text, text, double precision, double precision, double precision, integer) to anon, service_role;

commit;

notify pgrst, 'reload schema';

-- 확인: 근무일 함수 / 새 제약 / 새벽 퇴근 규칙
select
  public.attendance_work_date('2026-10-20 02:00:00+09', 'check_out') as "20일02시퇴근_근무일(19일)",
  public.attendance_work_date('2026-10-20 02:00:00+09', 'check_in')  as "20일02시출근_근무일(20일)",
  to_char(public.attendance_normalize_check_out('2026-10-20 02:07:00+09', '장사꾼') at time zone 'Asia/Seoul', 'HH24:MI') as "02:07퇴근→02:00",
  public.attendance_checkout_block_reason('2026-10-20 02:07:00+09', '장사꾼') is null as "새벽퇴근_가능",
  (select indexdef from pg_indexes where indexname = 'attendance_records_one_per_day_idx') as 제약;
