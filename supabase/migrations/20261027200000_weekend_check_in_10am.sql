-- ============================================================
-- 근태 SaaS — 토·일요일 오전 10시 전 출근은 10:00 으로 (2026-10-27 사용자 요청)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--
-- 바뀌는 것 (시급 출근, 모든 사업장)
--   토요일·일요일(한국 시간)에 10:00 전에 출근하면 무조건 10:00 으로 기록.
--   10:00 이후 출근은 기존 규칙 그대로(대부분 찍은 시각 그대로).
--   평일은 바뀌지 않음.
--   도급 출근은 원래 보정 없이 찍은 시각 그대로라 해당 없음.
--
-- 20261003110000_record_attendance_function.sql 의 attendance_normalize_check_in 을 같은 이름으로 바꿉니다
-- (주말 규칙 한 덩어리만 맨 앞에 추가, 나머지는 기존과 같음).
-- 근로자 화면 표시(app/page.tsx normalizeDisplayCheckIn)도 같은 규칙으로 맞춥니다.
-- ============================================================

begin;

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
  -- 토(6)·일(0) 10:00 전 → 10:00 (모든 사업장, 2026-10-27)
  if extract(dow from v_local)::int in (0, 6) and v_total < 10 * 60 then
    return (v_day + interval '10 hours') at time zone 'Asia/Seoul';
  end if;

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

commit;

-- 확인 (따로 실행): 2026-10-31(토) 장사꾼 — 08:30·09:05·09:59 → 10:00, 10:20 → 10:20 / 2026-10-30(금) 09:05 → 09:00
-- select p.p_day, to_char(at_time at time zone 'Asia/Seoul','HH24:MI') as 찍은시각,
--        to_char(check_in_at at time zone 'Asia/Seoul','HH24:MI') as 기록
--   from (values (date '2026-10-31'), (date '2026-10-30')) p(p_day),
--        lateral public.attendance_rule_preview(p.p_day, '장사꾼') r
--  where r.minute_of_day in (8*60+30, 9*60+5, 9*60+59, 10*60+20)
--  order by 1, 2;
