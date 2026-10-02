-- ============================================================
-- 근태 SaaS — 출퇴근 저장 DB 함수 + 중복 불가 제약 + 서버 시각 저장 (4단계)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
-- ⚠️ 실행 순서
--    1) 20261003100000_cleanup_duplicate_attendance.sql (중복 26건 정리) — 먼저
--    2) 이 파일
--    3) 코드 배포
--    이 파일만 실행돼 있고 코드가 옛 버전이어도 출퇴근은 그대로 동작합니다
--    (옛 코드는 이 함수를 쓰지 않고 직접 저장하며, 중복 불가 제약만 추가로 적용됨).
--
-- 무엇을 하는가
--   1) 중복 불가 제약
--      같은 직원 + 같은 날(한국 시간) + 같은 구간 종류 + 같은 출퇴근 종류는 1건만.
--      버튼 연타·동시 요청·관리자 중복 입력·BISEO 직접 저장 모두 DB 에서 막힙니다.
--   2) 출퇴근 저장 함수 record_attendance()
--      근로자 출근/퇴근 API 가 이 함수 하나로 저장합니다.
--      - 시각은 요청 값이 아니라 DB 시각(now())을 씁니다. 화면이 보낸 시각은 무시합니다.
--      - 시급 구간: 기존 시각 보정 규칙과 퇴근 가능 시간 제한을 DB 시각 기준으로 그대로 적용.
--      - 도급 구간: 보정·제한 없이 DB 시각 그대로.
--      - 직원별 잠금(advisory lock) 안에서 하루 흐름 규칙을 검사하고 저장하므로
--        동시에 두 요청이 와도 하나만 저장됩니다.
--      - 규칙은 app/lib/attendanceFlow.ts(근로자 화면 버튼)와 같아야 합니다.
--        한쪽을 바꾸면 다른 쪽도 같이 바꿉니다. 안내 문구도 같습니다.
--   3) 시각 보정 규칙 함수 3개 (record_attendance 가 사용) + 1분 단위 비교 검증용 조회 함수 1개
--
-- 관리자 수동 입력·수정, BISEO 수정은 관리자가 지정한 시각을 써야 하므로
-- 이 함수를 쓰지 않습니다(중복 불가 제약만 적용됨).
--
-- 거절 시 오류 코드 (API 가 화면 안내로 바꿈)
--   AT400 : 잘못된 요청 값       → HTTP 400
--   AT404 : 직원 없음            → HTTP 404
--   AT409 : 하루 흐름 규칙 위반   → HTTP 409
--   AT422 : 퇴근 가능 시간 아님   → HTTP 400
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) 중복 불가 제약
-- ------------------------------------------------------------
-- 한국 시간 날짜. 인덱스 식에는 immutable 함수만 쓸 수 있어 명시적으로 감싼다.
create or replace function public.attendance_kst_date(p_at timestamptz)
returns date
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$ select (p_at at time zone 'Asia/Seoul')::date $$;

create unique index if not exists attendance_records_one_per_day_idx
  on public.attendance_records (
    employee_id,
    public.attendance_kst_date(checked_at),
    segment_type,
    record_type
  );

comment on index public.attendance_records_one_per_day_idx is
  '같은 직원·같은 날(KST)·같은 구간·같은 출퇴근 종류는 1건. 버튼 연타/동시 요청 중복 방지.';


-- ------------------------------------------------------------
-- 2) 시급 구간 시각 보정 / 퇴근 가능 시간 (기존 API 의 TypeScript 규칙을 그대로 옮김)
-- ------------------------------------------------------------

-- 출근 시각 보정 (기존 app/api/attendance/check-in normalizeCheckInTime)
create or replace function public.attendance_normalize_check_in(
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
  -- 깨소금 전용
  --   08:00 이전 → 08:00 / 매시 :15~:30 → :30 / 매시 :45~:59 → 다음 정각 / 그 외 그대로
  if v_place = '깨소금' then
    if v_total < 8 * 60 then
      return (v_day + interval '8 hours') at time zone 'Asia/Seoul';
    end if;
    if v_min between 15 and 30 then
      return (v_day + make_interval(hours => v_hour, mins => 30)) at time zone 'Asia/Seoul';
    end if;
    if v_min >= 45 then
      return (v_day + make_interval(hours => v_hour + 1)) at time zone 'Asia/Seoul';
    end if;
    return p_at;
  end if;

  -- 헤모즈 조기 출근 06:45~07:10 → 07:00
  if v_place = '헤모즈' and v_total between 6 * 60 + 45 and 7 * 60 + 10 then
    return (v_day + interval '7 hours') at time zone 'Asia/Seoul';
  end if;

  -- 장사꾼 / 헤모즈 공통
  if v_total between 8 * 60 + 45 and 9 * 60 + 10 then
    return (v_day + interval '9 hours') at time zone 'Asia/Seoul';
  end if;
  if v_total between 9 * 60 + 11 and 9 * 60 + 30 then
    return (v_day + interval '9 hours 30 minutes') at time zone 'Asia/Seoul';
  end if;
  if v_total between 17 * 60 + 50 and 18 * 60 + 10 then
    return (v_day + interval '18 hours') at time zone 'Asia/Seoul';
  end if;

  return p_at;
end;
$$;

-- 퇴근 시각 보정 (기존 app/api/attendance/check-out normalizeCheckOutTime)
--   매시 :00~:10 → 정각 / :11~:40 → :30 / :41~ → 다음 정각
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

-- 퇴근 가능 시간 (기존 isCheckoutAllowedAtKst). 가능하면 null, 아니면 안내 문구.
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


-- 하루 1,440분 전체에 대해 위 규칙 결과를 돌려주는 조회 전용 함수.
-- 기존 TypeScript 규칙과 1분 단위로 같은지 비교 검증할 때 씁니다. 저장은 하지 않습니다.
create or replace function public.attendance_rule_preview(
  p_day date,
  p_workplace text,
  p_second int default 0
) returns table (
  minute_of_day   int,
  at_time         timestamptz,
  check_in_at     timestamptz,
  check_out_at    timestamptz,
  checkout_block  text
)
language sql
immutable
set search_path = pg_catalog, public
as $$
  select
    m,
    t,
    public.attendance_normalize_check_in(t, p_workplace),
    public.attendance_normalize_check_out(t, p_workplace),
    public.attendance_checkout_block_reason(t, p_workplace)
  from generate_series(0, 1439) as m,
       lateral (
         select ((p_day::timestamp) + make_interval(mins => m, secs => p_second)) at time zone 'Asia/Seoul' as t
       ) x
$$;


-- ------------------------------------------------------------
-- 3) 출퇴근 저장 함수
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
  v_day        date := (v_now at time zone 'Asia/Seoul')::date;
  v_day_start  timestamptz := (v_day::timestamp) at time zone 'Asia/Seoul';
  v_day_end    timestamptz := ((v_day + 1)::timestamp) at time zone 'Asia/Seoul';
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

  -- 오늘(KST) 기록 상태
  select
    coalesce(bool_or(r.segment_type = 'hourly' and r.record_type = 'check_in'), false),
    coalesce(bool_or(r.segment_type = 'hourly' and r.record_type = 'check_out'), false),
    coalesce(bool_or(r.segment_type = 'piece'  and r.record_type = 'check_in'), false),
    coalesce(bool_or(r.segment_type = 'piece'  and r.record_type = 'check_out'), false)
    into v_hourly_in, v_hourly_out, v_piece_in, v_piece_out
    from public.attendance_records r
   where r.employee_id = p_employee_id
     and r.checked_at >= v_day_start
     and r.checked_at <  v_day_end;

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
    -- 잠금이 있으므로 정상 경로에서는 오지 않는다. 관리자 입력과 겹친 경우 등.
    raise exception '오늘은 이미 처리된 기록이 있습니다. 화면을 새로고침해주세요.'
      using errcode = 'AT409';
  end;

  return query select v_id, v_at, p_segment_type;
end;
$$;

comment on function public.record_attendance(bigint, text, text, double precision, double precision, double precision, integer) is
  '근로자 출퇴근 저장. DB 시각 기준, 직원별 잠금, 하루 흐름 규칙(attendanceFlow.ts 와 동일). 4단계 2026-10-03.';

-- 권한
--   근로자 출퇴근 API 는 지금 공개 키(anon)로 동작하므로 anon 에 실행 권한을 준다.
--   (공개 키 정리는 docs/SECURITY_TODO.md — 정리할 때 이 권한도 회수)
--   보정 규칙 함수는 계산만 하므로 검증용으로 service_role 에도 연다.
revoke all on function public.record_attendance(bigint, text, text, double precision, double precision, double precision, integer) from public;
grant execute on function public.record_attendance(bigint, text, text, double precision, double precision, double precision, integer) to anon, service_role;

revoke all on function public.attendance_kst_date(timestamptz) from public;
grant execute on function public.attendance_kst_date(timestamptz) to anon, authenticated, service_role;
revoke all on function public.attendance_normalize_check_in(timestamptz, text) from public;
revoke all on function public.attendance_normalize_check_out(timestamptz, text) from public;
revoke all on function public.attendance_checkout_block_reason(timestamptz, text) from public;
grant execute on function public.attendance_normalize_check_in(timestamptz, text) to service_role;
grant execute on function public.attendance_normalize_check_out(timestamptz, text) to service_role;
grant execute on function public.attendance_checkout_block_reason(timestamptz, text) to service_role;
revoke all on function public.attendance_rule_preview(date, text, int) from public;
grant execute on function public.attendance_rule_preview(date, text, int) to service_role;

commit;

notify pgrst, 'reload schema';


-- ------------------------------------------------------------
-- 확인용 쿼리
-- ------------------------------------------------------------
-- select indexname from pg_indexes where indexname = 'attendance_records_one_per_day_idx';
-- select grantee, privilege_type from information_schema.role_routine_grants
--  where routine_name = 'record_attendance' order by 1;   -- anon, service_role 의 EXECUTE


-- ------------------------------------------------------------
-- 롤백 (코드도 함께 되돌려야 함)
-- ------------------------------------------------------------
-- drop function if exists public.record_attendance(bigint, text, text, double precision, double precision, double precision, integer);
-- drop function if exists public.attendance_rule_preview(date, text, int);
-- drop function if exists public.attendance_checkout_block_reason(timestamptz, text);
-- drop function if exists public.attendance_normalize_check_out(timestamptz, text);
-- drop function if exists public.attendance_normalize_check_in(timestamptz, text);
-- drop index if exists public.attendance_records_one_per_day_idx;
-- drop function if exists public.attendance_kst_date(timestamptz);
