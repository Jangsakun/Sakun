-- ✅ 2026-10-02 12:08 KST 실행 완료 (삭제 26건 / 감사로그 26건, source = 'cleanup_20261003').
--    다시 실행하지 마세요. 다시 실행해도 26건 확인 단계에서 멈추지만 의미가 없습니다.
-- ============================================================
-- 근태 SaaS — 중복 출퇴근 기록 정리 (17일 / 26건)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
-- ⚠️ 4단계 중복 불가 제약(20261003110000) 보다 "먼저" 실행해야 합니다.
--    중복이 남아 있으면 제약 추가가 실패합니다.
--
-- 무엇을 하는가 (2026-10-02 사용자 승인)
--   같은 직원·같은 날·같은 출퇴근 종류가 2건 이상인 17일에서 26건을 지웁니다.
--   어느 기록을 지울지는 "지워도 그 날 지급 금액이 바뀌지 않는 쪽"으로 골랐습니다
--   (과거 지급 기준 = 관리자 급여 API 방식으로 계산해 확인).
--
-- 안전장치
--   1) 26건이 지금도 같은 직원·같은 종류·같은 시각으로 남아 있는지 먼저 확인합니다.
--      하나라도 다르면(이미 지워졌거나 수정됨) 오류를 내고 전체를 취소합니다.
--   2) 지우기 전에 원래 값을 감사로그(attendance_record_audit)에 남깁니다.
--      source = 'cleanup_20261003'
--   3) 전체가 한 트랜잭션이라 중간에 실패하면 아무것도 지워지지 않습니다.
--
-- 실행 결과 표
--   26행: 지운 기록 목록(직원·날짜·기록 id·시각·삭제 사유)
--   마지막 1행: "삭제 26건 / 감사로그 26건" 요약
-- ============================================================

begin;

create temporary table cleanup_targets (
  record_id    bigint primary key,
  employee_id  bigint not null,
  employee_name text not null,
  record_type  text not null,
  segment_type text not null,
  checked_at   timestamptz not null,
  reason       text not null
) on commit drop;

insert into cleanup_targets values
    (218, 39, '김희진', 'check_out', 'hourly', '2026-04-30T08:30:00.000Z'::timestamptz, '같은 시각 퇴근 중복(관리자 수동 입력)'),
    (219, 39, '김희진', 'check_out', 'hourly', '2026-04-30T08:30:00.000Z'::timestamptz, '같은 시각 퇴근 중복(관리자 수동 입력)'),
    (991, 97, '김현아', 'check_in', 'hourly', '2026-05-18T00:30:00.000Z'::timestamptz, '같은 시각 출근 중복'),
    (2049, 71, '김다정', 'check_in', 'hourly', '2026-05-30T01:00:00.000Z'::timestamptz, '같은 시각 출근 중복(관리자 수동 입력)'),
    (2050, 71, '김다정', 'check_out', 'hourly', '2026-05-30T08:00:00.000Z'::timestamptz, '두 번째 퇴근 17:00 — 실제 지급은 16:00 기준'),
    (4860, 43, '최두나', 'check_out', 'hourly', '2026-07-13T10:00:00.000Z'::timestamptz, '19:00 퇴근 — 관리자가 18:00 으로 넣었고 실제 지급도 18:00 기준'),
    (6395, 124, '김지민', 'check_in', 'hourly', '2026-08-03T00:00:00.000Z'::timestamptz, '같은 시각 출근 중복(관리자 수동 입력)'),
    (6396, 124, '김지민', 'check_out', 'hourly', '2026-08-03T10:00:00.000Z'::timestamptz, '같은 시각 퇴근 중복(관리자 수동 입력)'),
    (6399, 124, '김지민', 'check_in', 'hourly', '2026-08-04T00:00:00.000Z'::timestamptz, '같은 시각 출근 중복(관리자 수동 입력)'),
    (6400, 124, '김지민', 'check_out', 'hourly', '2026-08-04T09:00:00.000Z'::timestamptz, '같은 시각 퇴근 중복(관리자 수동 입력)'),
    (6819, 107, '김진혁', 'check_in', 'hourly', '2026-08-10T22:00:00.000Z'::timestamptz, '같은 시각 출근 중복(관리자 수동 입력)'),
    (7172, 103, '김윤호', 'check_in', 'hourly', '2026-08-17T22:00:00.000Z'::timestamptz, '같은 시각 출근 중복(관리자 수동 입력)'),
    (7277, 63, '사민경', 'check_in', 'hourly', '2026-08-18T00:30:00.000Z'::timestamptz, '같은 시각 출근 중복(관리자 수동 입력)'),
    (7278, 63, '사민경', 'check_out', 'hourly', '2026-08-18T09:00:00.000Z'::timestamptz, '같은 시각 퇴근 중복(관리자 수동 입력)'),
    (7419, 136, '서보견', 'check_in', 'hourly', '2026-08-20T09:00:00.000Z'::timestamptz, '18:00 출근 — 09:00 출근(수동)과 중복, 지급은 09:00 기준'),
    (7507, 136, '서보견', 'check_out', 'hourly', '2026-08-20T09:00:00.000Z'::timestamptz, '같은 시각 퇴근 중복(관리자 수동 입력)'),
    (10622, 137, '김광임', 'check_out', 'hourly', '2026-08-28T09:00:00.000Z'::timestamptz, '같은 시각 퇴근 중복(관리자 수동 입력)'),
    (10623, 136, '서보견', 'check_out', 'hourly', '2026-08-28T09:00:00.000Z'::timestamptz, '같은 시각 퇴근 중복(관리자 수동 입력)'),
    (10624, 137, '김광임', 'check_out', 'hourly', '2026-08-28T09:00:00.000Z'::timestamptz, '같은 시각 퇴근 중복(관리자 수동 입력)'),
    (8640, 98, '오유진', 'check_out', 'hourly', '2026-09-04T09:30:00.000Z'::timestamptz, '같은 시각 퇴근 중복(관리자 수동 입력)'),
    (8643, 104, '진세곤', 'check_out', 'hourly', '2026-09-04T09:30:00.000Z'::timestamptz, '같은 시각 퇴근 중복(관리자 수동 입력)'),
    (9037, 87, '이경', 'check_in', 'hourly', '2026-09-10T00:10:00.000Z'::timestamptz, '같은 시각 출근 중복(관리자 수동 입력)'),
    (9276, 87, '이경', 'check_in', 'hourly', '2026-09-12T01:00:00.000Z'::timestamptz, '같은 시각 출근 중복(관리자 수동 입력)'),
    (9277, 87, '이경', 'check_out', 'hourly', '2026-09-12T09:00:00.000Z'::timestamptz, '같은 시각 퇴근 중복(관리자 수동 입력)'),
    (9879, 141, '정일성', 'check_in', 'hourly', '2026-09-18T00:00:00.000Z'::timestamptz, '같은 시각 출근 중복(관리자 수동 입력)'),
    (9880, 141, '정일성', 'check_out', 'hourly', '2026-09-18T09:00:00.000Z'::timestamptz, '같은 시각 퇴근 중복(관리자 수동 입력)');

-- 1) 26건이 그대로 남아 있는지 확인. 하나라도 다르면 전체 취소.
do $$
declare
  matched int;
begin
  select count(*) into matched
    from cleanup_targets t
    join public.attendance_records r
      on r.id = t.record_id
     and r.employee_id = t.employee_id
     and r.record_type = t.record_type
     and r.segment_type = t.segment_type
     and r.checked_at = t.checked_at;

  if matched <> 26 then
    raise exception '중복 정리 취소: 26건 중 %건만 일치합니다. 이미 지워졌거나 수정된 기록이 있습니다. 아무것도 지우지 않았습니다.', matched;
  end if;
end $$;

-- 2) 감사로그 → 3) 삭제 → 결과 표
with audit as (
  insert into public.attendance_record_audit
    (record_id, employee_id, action, field, old_value, new_value, source, actor)
  select
    t.record_id,
    t.employee_id,
    'delete',
    null,
    json_build_object(
      'record_type', r.record_type,
      'segment_type', r.segment_type,
      'checked_at', r.checked_at,
      'hourly_wage_snapshot', r.hourly_wage_snapshot,
      'lat', r.lat,
      'lng', r.lng,
      'reason', t.reason
    )::text,
    null,
    'cleanup_20261003',
    'sql-editor'
  from cleanup_targets t
  join public.attendance_records r on r.id = t.record_id
  returning record_id
),
deleted as (
  delete from public.attendance_records r
   using cleanup_targets t
   where r.id = t.record_id
  returning r.id
)
select *
  from (
    select
      1 as sort_group,
      t.employee_name as 직원,
      to_char(t.checked_at at time zone 'Asia/Seoul', 'YYYY-MM-DD') as 날짜,
      t.record_id::text as 기록id,
      case t.record_type when 'check_in' then '출근' else '퇴근' end
        || ' ' || to_char(t.checked_at at time zone 'Asia/Seoul', 'HH24:MI') as 시각,
      t.reason as 삭제사유
    from cleanup_targets t
    union all
    select
      2,
      '요약',
      null,
      null,
      null,
      '삭제 ' || (select count(*) from deleted) || '건 / 감사로그 ' || (select count(*) from audit) || '건'
  ) result
 order by sort_group, 날짜, 기록id;

commit;
