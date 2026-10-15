-- ============================================================
-- 근태 SaaS — 문자 발송 대기열 + 서명본 다운로드 링크 (뿌리오 연동)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--
-- 구조
--   근태 앱(Vercel)은 sms_outbox 에 문자를 "적기만" 합니다.
--   사무실 PC 워커(sms-worker/)가 근태 앱 내부 API 를 거쳐 대기 문자를 가져가 뿌리오로 보내고
--   결과를 기록합니다. 뿌리오는 등록된 IP 에서만 발송을 받기 때문입니다(Vercel 은 고정 IP 없음).
--
-- 만드는 것
--   contract_entities.short_name   문자 첫머리에 쓰는 짧은 회사명([장사꾼], [헤모즈])
--   sms_outbox                     범용 문자 대기열(용도 purpose 로 구분)
--   sms_worker_heartbeats          워커 마지막 연결 시각(관리자 화면 경고용)
--   contract_download_links        서명본 다운로드 링크(토큰 원본은 저장하지 않고 SHA-256 만)
--   함수 sms_outbox_claim / sms_outbox_report / contract_link_verify
--   contract_signature_events 기록 종류 추가(문자·링크)
--
-- 같은 문자가 두 번 나가지 않게
--   ① 가져가기(sms_outbox_claim)는 for update skip locked — 워커가 둘이어도 같은 줄을 못 집습니다.
--   ② dedupe_key unique — 같은 일로 생긴 중복 줄은 DB 가 거부합니다.
--   ③ "발송중"에서 멈춘 줄(워커가 보내다 꺼짐)은 자동으로 다시 보내지 않고 unknown 으로 바꿉니다.
--      뿌리오에 접수됐는지 알 수 없기 때문입니다(뿌리오에는 발송결과 조회 API 가 없음, 2026-10-15 확인).
--
-- 개인정보
--   받는 번호(to_phone)·본문(content)은 대기/발송중일 때만 들고 있고, 끝나면 지웁니다(가린 번호만 남김).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) 계약 명의 짧은 이름
-- ------------------------------------------------------------
alter table public.contract_entities add column if not exists short_name text;

update public.contract_entities set short_name = '장사꾼' where code = 'jangsakun' and short_name is null;
update public.contract_entities set short_name = '헤모즈' where code = 'hemoz' and short_name is null;

-- ------------------------------------------------------------
-- 2) 문자 대기열
-- ------------------------------------------------------------
create table if not exists public.sms_outbox (
  id                    bigserial   primary key,
  purpose               text        not null check (purpose ~ '^[a-z0-9_]{1,40}$'),
  -- 같은 일로 두 줄이 생기지 않게 하는 키(예: contract_signed_link:123:auto)
  dedupe_key            text        not null unique,
  ref_table             text,
  ref_id                bigint,
  employee_id           bigint,
  message_type          text        not null check (message_type in ('SMS', 'LMS')),
  subject               text        check (subject is null or char_length(subject) <= 30),
  content               text,
  to_phone              text        check (to_phone is null or to_phone ~ '^01[016789][0-9]{7,8}$'),
  to_phone_masked       text        not null,
  status                text        not null default 'queued'
                          check (status in ('queued', 'sending', 'sent', 'failed', 'unknown', 'cancelled')),
  attempts              int         not null default 0 check (attempts >= 0),
  max_attempts          int         not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at       timestamptz not null default now(),
  locked_by             text,
  locked_at             timestamptz,
  provider_ref_key      text,
  provider_message_key  text,
  result_code           text,
  result_message        text,
  dry_run               boolean     not null default false,
  created_by            text        not null check (created_by in ('system', 'admin-ui')),
  created_at            timestamptz not null default now(),
  sent_at               timestamptz,
  finished_at           timestamptz,
  -- 번호·본문은 끝나지 않은 줄에만 있다
  constraint sms_outbox_pii_only_while_open check (
    (status in ('queued', 'sending')) = (to_phone is not null and content is not null)
  ),
  constraint sms_outbox_finished check (
    (status in ('queued', 'sending')) = (finished_at is null)
  )
);

create index if not exists sms_outbox_queue_idx on public.sms_outbox(next_attempt_at, id) where status = 'queued';
create index if not exists sms_outbox_ref_idx on public.sms_outbox(purpose, ref_id, id);

comment on table public.sms_outbox is
  '문자 발송 대기열. 근태 앱은 적기만 하고 사무실 PC 워커가 뿌리오로 보낸다. 번호·본문은 발송이 끝나면 지운다.';

-- ------------------------------------------------------------
-- 3) 워커 연결 기록
-- ------------------------------------------------------------
create table if not exists public.sms_worker_heartbeats (
  worker_id     text        primary key check (worker_id ~ '^[A-Za-z0-9_.-]{1,40}$'),
  last_seen_at  timestamptz not null default now(),
  mode          text        not null check (mode in ('live', 'dry-run')),
  version       text,
  host          text,
  last_error    text,
  last_error_at timestamptz
);

comment on table public.sms_worker_heartbeats is
  '문자 워커가 대기열을 확인할 때마다 갱신. 관리자 화면이 10분 넘게 끊기면 경고한다.';

-- ------------------------------------------------------------
-- 4) 서명본 다운로드 링크
-- ------------------------------------------------------------
create table if not exists public.contract_download_links (
  id               bigserial   primary key,
  contract_id      bigint      not null references public.employment_contracts(id),
  employee_id      bigint      not null,
  token_hash       text        not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at       timestamptz not null,
  failed_attempts  int         not null default 0 check (failed_attempts >= 0),
  locked_at        timestamptz,
  revoked_at       timestamptz,
  last_used_at     timestamptz,
  created_by       text        not null check (created_by in ('system', 'admin-ui')),
  created_at       timestamptz not null default now()
);

create index if not exists contract_download_links_contract_idx on public.contract_download_links(contract_id, id);

comment on table public.contract_download_links is
  '문자로 보낸 서명본 다운로드 링크. 토큰 원본은 저장하지 않는다. 30일 유효, 생년월일 5회 틀리면 잠김, 재발송하면 이전 링크는 막힘.';

-- ------------------------------------------------------------
-- 5) 증거 기록 종류 추가
-- ------------------------------------------------------------
-- 기존 event_type 검사 제약을 이름과 상관없이 찾아 지운 뒤 다시 만든다
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
    'sms_queued', 'sms_queue_failed', 'link_verify_failed', 'link_locked', 'link_downloaded'
  ));

-- ------------------------------------------------------------
-- 6) 함수
-- ------------------------------------------------------------

-- 워커가 보낼 문자를 가져간다. 먼저 들어온 순서. 동시에 불러도 같은 줄을 두 번 주지 않는다.
-- "발송중"으로 10분 넘게 멈춘 줄은 다시 주지 않고 unknown 으로 바꾼다(이중 발송 방지).
create or replace function public.sms_outbox_claim(p_worker text, p_limit int)
returns setof public.sms_outbox
language plpgsql
as $$
begin
  update public.sms_outbox
     set status = 'unknown',
         finished_at = now(),
         to_phone = null,
         content = null,
         result_message = '발송 중 응답 없이 멈춤 — 뿌리오 발송결과 페이지에서 확인 필요'
   where status = 'sending'
     and locked_at < now() - interval '10 minutes';

  return query
  update public.sms_outbox o
     set status = 'sending',
         locked_by = p_worker,
         locked_at = now(),
         attempts = o.attempts + 1
   where o.id in (
           select q.id
             from public.sms_outbox q
            where q.status = 'queued'
              and q.next_attempt_at <= now()
            order by q.id
            limit greatest(1, least(coalesce(p_limit, 5), 20))
            for update skip locked
         )
  returning o.*;
end;
$$;

-- 워커가 결과를 적는다. 그 워커가 가져간 "발송중" 줄만 바뀐다.
--   p_outcome: sent | failed | unknown | retry
--   retry 는 p_count_attempt=false 면 시도 횟수에 넣지 않는다(뿌리오 인증·IP·속도 제한처럼 확실히 안 나간 경우).
--   시도 횟수를 다 쓰면 retry 도 failed 로 끝난다.
create or replace function public.sms_outbox_report(
  p_id bigint,
  p_worker text,
  p_outcome text,
  p_result_code text,
  p_result_message text,
  p_message_key text,
  p_ref_key text,
  p_retry_after_seconds int,
  p_count_attempt boolean,
  p_dry_run boolean
)
returns text
language plpgsql
as $$
declare
  v public.sms_outbox%rowtype;
  v_final text;
begin
  select * into v from public.sms_outbox where id = p_id for update;

  if not found or v.status <> 'sending' or v.locked_by is distinct from p_worker then
    return 'ignored';
  end if;

  if p_outcome = 'retry' then
    if not p_count_attempt then
      v.attempts := greatest(v.attempts - 1, 0);
    end if;

    if v.attempts < v.max_attempts then
      update public.sms_outbox
         set status = 'queued',
             attempts = v.attempts,
             next_attempt_at = now() + make_interval(secs => greatest(coalesce(p_retry_after_seconds, 60), 5)),
             locked_by = null,
             locked_at = null,
             result_code = left(p_result_code, 20),
             result_message = left(p_result_message, 300),
             provider_ref_key = coalesce(left(p_ref_key, 32), provider_ref_key)
       where id = p_id;

      return 'queued';
    end if;

    v_final := 'failed';
  elsif p_outcome in ('sent', 'failed', 'unknown') then
    v_final := p_outcome;
  else
    raise exception 'sms_outbox_report: 알 수 없는 결과 %', p_outcome;
  end if;

  update public.sms_outbox
     set status = v_final,
         attempts = v.attempts,
         finished_at = now(),
         sent_at = case when v_final = 'sent' then now() else null end,
         to_phone = null,
         content = null,
         locked_by = null,
         result_code = left(p_result_code, 20),
         result_message = left(p_result_message, 300),
         provider_message_key = left(p_message_key, 40),
         provider_ref_key = coalesce(left(p_ref_key, 32), provider_ref_key),
         dry_run = coalesce(p_dry_run, false)
   where id = p_id;

  return v_final;
end;
$$;

-- 다운로드 링크 생년월일 확인. 실패 횟수를 한 번에 세서 동시에 시도해도 우회되지 않는다.
--   결과: ok | wrong | locked | invalid
--   생년월일은 직원 정보(birth_date, YYYY-MM-DD) → 없으면 서명 시 주민번호 앞 6자리.
create or replace function public.contract_link_verify(p_token_hash text, p_birth6 text, p_max_failures int)
returns table (result text, contract_id bigint, employee_id bigint, remaining int)
language plpgsql
as $$
declare
  v public.contract_download_links%rowtype;
  v_status text;
  v_birth6 text;
  v_failed int;
begin
  select * into v from public.contract_download_links l where l.token_hash = p_token_hash for update;

  if not found or v.revoked_at is not null or v.expires_at < now() then
    return query select 'invalid'::text, null::bigint, null::bigint, 0;
    return;
  end if;

  if v.locked_at is not null then
    return query select 'locked'::text, null::bigint, null::bigint, 0;
    return;
  end if;

  select c.status,
         coalesce(
           nullif(replace(substr(e.birth_date::text, 3, 8), '-', ''), ''),
           left(c.input_snapshot->>'residentNumber', 6)
         )
    into v_status, v_birth6
    from public.employment_contracts c
    left join public.employees e on e.id = c.employee_id
   where c.id = v.contract_id;

  -- 무효 처리된 계약서는 링크로 내려받지 않는다
  if v_status is null or v_status not in ('signed', 'ended') then
    return query select 'invalid'::text, null::bigint, null::bigint, 0;
    return;
  end if;

  if v_birth6 is not null and length(v_birth6) = 6 and v_birth6 = p_birth6 then
    update public.contract_download_links set last_used_at = now() where id = v.id;
    return query select 'ok'::text, v.contract_id, v.employee_id, p_max_failures - v.failed_attempts;
    return;
  end if;

  v_failed := v.failed_attempts + 1;

  update public.contract_download_links
     set failed_attempts = v_failed,
         locked_at = case when v_failed >= p_max_failures then now() else null end
   where id = v.id;

  return query select
    case when v_failed >= p_max_failures then 'locked' else 'wrong' end,
    v.contract_id, v.employee_id, greatest(p_max_failures - v_failed, 0);
end;
$$;

-- ------------------------------------------------------------
-- 7) 권한: 브라우저 키 전면 차단 + service_role 은 필요한 것만 (삭제 권한 없음)
-- ------------------------------------------------------------
alter table public.sms_outbox               enable row level security;
alter table public.sms_worker_heartbeats    enable row level security;
alter table public.contract_download_links  enable row level security;

revoke all on table public.sms_outbox               from anon, authenticated, service_role;
revoke all on table public.sms_worker_heartbeats    from anon, authenticated, service_role;
revoke all on table public.contract_download_links  from anon, authenticated, service_role;

grant select, insert, update on public.sms_outbox               to service_role;
grant select, insert, update on public.sms_worker_heartbeats    to service_role;
grant select, insert, update on public.contract_download_links  to service_role;

grant usage, select on sequence public.sms_outbox_id_seq               to service_role;
grant usage, select on sequence public.contract_download_links_id_seq  to service_role;

revoke all on function public.sms_outbox_claim(text, int) from public, anon, authenticated;
revoke all on function public.sms_outbox_report(bigint, text, text, text, text, text, text, int, boolean, boolean) from public, anon, authenticated;
revoke all on function public.contract_link_verify(text, text, int) from public, anon, authenticated;

grant execute on function public.sms_outbox_claim(text, int) to service_role;
grant execute on function public.sms_outbox_report(bigint, text, text, text, text, text, text, int, boolean, boolean) to service_role;
grant execute on function public.contract_link_verify(text, text, int) to service_role;

commit;

-- ------------------------------------------------------------
-- 실행 후 확인 (따로 실행)
-- ------------------------------------------------------------
-- select code, short_name from public.contract_entities;                        -- 장사꾼 / 헤모즈
-- select table_name, privilege_type from information_schema.role_table_grants
--  where grantee = 'service_role' and table_name in ('sms_outbox', 'sms_worker_heartbeats', 'contract_download_links')
--  order by 1, 2;                                                               -- DELETE 가 없어야 함
-- select count(*) from public.sms_outbox;                                       -- 0
