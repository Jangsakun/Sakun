-- ============================================================
-- 현장 직원 PIN — 계약서 화면에서 당근 → 고정(11개월) 바로 전환 (2026-10-27 사용자 요청)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--
-- 흐름
--   근로자 1주 계약서 화면 → "고정(11개월)으로 전환 — 현장 직원용" → 현장 직원이 PIN 입력
--   → 고용구분 고정 + 1주 서명대기 무효 + 11개월 서명대기 생성 → 그 자리에서 11개월 계약서 작성
--
-- 만드는 것
--   app_secrets           PIN 의 해시(scrypt)만 저장. 원래 PIN 은 어디에도 저장하지 않는다.
--                          관리자 화면(전자계약 탭)에서 관리자가 직접 설정·변경한다.
--   field_pin_attempts    PIN 시도 기록(틀린 횟수 제한용). 직원별 15분에 5번, 전체 15분에 20번 틀리면 잠시 막힌다.
--   contract_signature_events 기록 종류 추가: field_converted(현장 전환), field_pin_failed(PIN 틀림)
-- ============================================================

begin;

create table if not exists public.app_secrets (
  key         text        primary key check (key ~ '^[a-z0-9_]{1,40}$'),
  value_hash  text        not null,
  updated_at  timestamptz not null default now()
);

comment on table public.app_secrets is '비밀값의 해시만 저장(원래 값 저장 안 함). field_staff_pin = 현장 직원 PIN(scrypt).';

create table if not exists public.field_pin_attempts (
  id           bigserial   primary key,
  employee_id  bigint,
  success      boolean     not null,
  request_ip   text,
  created_at   timestamptz not null default now()
);

create index if not exists field_pin_attempts_recent_idx on public.field_pin_attempts(created_at desc);
create index if not exists field_pin_attempts_employee_idx on public.field_pin_attempts(employee_id, created_at desc);

comment on table public.field_pin_attempts is '현장 직원 PIN 시도 기록(틀린 횟수 제한용).';

-- 증거 기록 종류 추가 (기존 제약을 이름과 상관없이 찾아 지운 뒤 다시 만든다)
do $$
declare
  r record;
begin
  for r in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.contract_signature_events'::regclass
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%event_type%'
  loop
    execute format('alter table public.contract_signature_events drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.contract_signature_events add constraint contract_signature_events_event_type_check
  check (event_type in (
    'page_opened', 'input_started', 'preview_read_to_end',
    'warning_acknowledged', 'sign_rejected', 'signed',
    'pdf_downloaded', 'voided', 'ended', 'created',
    'sms_queued', 'sms_queue_failed', 'link_verify_failed', 'link_locked', 'link_downloaded',
    'field_converted', 'field_pin_failed'
  ));

-- 권한: 브라우저 키 차단, 서버 키만 (삭제 권한 없음)
alter table public.app_secrets        enable row level security;
alter table public.field_pin_attempts enable row level security;

revoke all on table public.app_secrets        from anon, authenticated, service_role;
revoke all on table public.field_pin_attempts from anon, authenticated, service_role;

grant select, insert, update on public.app_secrets        to service_role;
grant select, insert         on public.field_pin_attempts to service_role;
grant usage, select on sequence public.field_pin_attempts_id_seq to service_role;

commit;

notify pgrst, 'reload schema';

-- 확인: 두 표가 보이면 정상
select table_name from information_schema.tables where table_schema = 'public' and table_name in ('app_secrets', 'field_pin_attempts');
