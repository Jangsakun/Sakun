-- ============================================================
-- 근태 SaaS — 근로자 문의사항 (2026-11-26 사용자 요청)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--
-- 흐름
--   근로자 출퇴근 화면 → [문의사항] → 문의 작성
--   관리자 화면 [문의사항] 탭 → 답변 작성(수정 가능)
--   근로자는 문의사항 화면에서 답변을 보고, 새 답변이 있으면 출퇴근 화면에 "새 답변" 표시
--
-- 근로자 확인은 휴대폰에 연결된 기기(employee_devices)로 합니다. 본인 문의만 보입니다.
-- 실행 전 배포해도 안전: 문의사항 화면만 "준비 중" 안내가 나오고 출퇴근에는 영향 없음.
-- ============================================================

begin;

create table if not exists public.worker_inquiries (
  id              bigserial   primary key,
  employee_id     bigint      not null,
  employee_name   text        not null,
  workplace_name  text,
  message         text        not null check (char_length(message) between 1 and 1000),
  answer          text        check (answer is null or char_length(answer) <= 2000),
  answered_at     timestamptz,
  -- 근로자가 답변을 확인한 시각(답변이 바뀌면 다시 null → 새 답변 표시)
  answer_read_at  timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists worker_inquiries_employee_idx on public.worker_inquiries(employee_id, created_at desc);
create index if not exists worker_inquiries_created_idx on public.worker_inquiries(created_at desc);

comment on table public.worker_inquiries is '근로자 문의사항과 관리자 답변.';

alter table public.worker_inquiries enable row level security;
revoke all on table public.worker_inquiries from anon, authenticated, service_role;
grant select, insert, update on public.worker_inquiries to service_role;
grant usage, select on sequence public.worker_inquiries_id_seq to service_role;

commit;

-- 확인 (따로 실행): 최근 문의
-- select created_at at time zone 'Asia/Seoul' as 시각, employee_name, message, answer
--   from public.worker_inquiries order by id desc limit 50;
