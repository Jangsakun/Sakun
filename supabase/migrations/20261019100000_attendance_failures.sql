-- ============================================================
-- 근태 SaaS — 출퇴근 실패 기록 (2026-10-19 사용자 요청)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--
-- 왜
--   10/17 토요일 당근 근로자 7명의 출근이 비어 있었는데, 버튼을 안 눌렀는지 / 눌렀는데 반경 밖·GPS 로
--   거절됐는지 알 방법이 없었다(Vercel 무료 플랜 서버 로그는 1시간 보관).
--   출근·퇴근 요청이 실패할 때마다 이유를 여기에 남긴다. 성공은 기록하지 않는다(attendance_records 에 있음).
--
-- 무엇을 남기나
--   직원(찾았으면 id, 이름), 출근/퇴근, 실패 이유와 화면에 보여 준 안내 문구, 가장 가까운 사업장과 거리(m),
--   GPS 정확도(m), 휴대폰 위치 기능 오류(권한 거부 등, 화면에서 보냄).
--   좌표(위도·경도)는 남기지 않는다. 거리만으로 원인 확인에 충분하다.
--
-- 실행 전 배포해도 안전: 기록 저장이 실패해도 출퇴근 응답에는 영향이 없다.
-- ============================================================

begin;

create table if not exists public.attendance_failures (
  id                bigserial   primary key,
  employee_id       bigint,
  employee_name     text,
  record_type       text        not null check (record_type in ('check_in', 'check_out')),
  segment_type      text,
  -- server: 출퇴근 API 가 거절 / client: 휴대폰 위치 기능 오류 등 서버까지 못 온 경우
  source            text        not null check (source in ('server', 'client')),
  http_status       int,
  reason            text        not null,
  message           text,
  nearest_workplace text,
  distance_m        int,
  accuracy_m        int,
  user_agent        text,
  created_at        timestamptz not null default now()
);

create index if not exists attendance_failures_created_idx on public.attendance_failures(created_at desc);
create index if not exists attendance_failures_employee_idx on public.attendance_failures(employee_id, created_at desc);

comment on table public.attendance_failures is
  '출퇴근 실패 기록(반경 밖·GPS 부정확·흐름 규칙·위치 권한 거부 등). 좌표는 저장하지 않음.';

alter table public.attendance_failures enable row level security;
revoke all on table public.attendance_failures from anon, authenticated, service_role;
grant select, insert on public.attendance_failures to service_role;
grant usage, select on sequence public.attendance_failures_id_seq to service_role;

commit;

-- 확인 (따로 실행): 최근 실패
-- select created_at at time zone 'Asia/Seoul' as 시각, employee_name, record_type, reason, message, distance_m, accuracy_m
--   from public.attendance_failures order by id desc limit 50;
