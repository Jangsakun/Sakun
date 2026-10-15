-- ============================================================
-- 근태 SaaS — 오후 10시(22:00) 이후 퇴근은 10분 단위 (2026-10-15 사용자 요청)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--
-- 바뀌는 것 (시급 구간, 모든 사업장)
--   22:00 이후 퇴근: 언제든 가능, 시각은 10분 단위 내림 (22:07 → 22:00, 22:15 → 22:10, 23:59 → 23:50)
--   22:00 이전: 그대로 (매시 :00~:10 → 정각, :30~:40 → 30분, 그 사이 퇴근 불가)
--
-- 20261003110000_record_attendance_function.sql 의 두 함수를 같은 이름으로 바꿉니다.
-- 근로자 화면 규칙(app/page.tsx getCheckoutAvailability / normalizeDisplayCheckOut)과 같아야 합니다.
-- ============================================================

begin;

-- 퇴근 시각 보정
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
  -- 22:00 이후: 10분 단위 내림
  if v_hour >= 22 then
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

-- 퇴근 가능 시간. 가능하면 null, 아니면 안내 문구.
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
  -- 22:00 이후: 언제든 가능
  if v_hour >= 22 then
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

commit;

-- 확인 (따로 실행): 21:45 는 막힘(다음 22:00), 22:07→22:00, 22:15→22:10, 23:59→23:50, 18:35→18:30
-- select to_char(check_out_at at time zone 'Asia/Seoul', 'HH24:MI') as 찍힘, checkout_block as 막힘
--   from public.attendance_rule_preview(current_date, '장사꾼')
--  where minute_of_day in (21*60+45, 22*60+7, 22*60+15, 23*60+59, 18*60+35)
--  order by minute_of_day;
