-- ============================================================
-- 근태 SaaS — 근로계약서 작성·전자서명 (1차: 장사꾼 명의)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--
-- 만드는 것
--   contract_entities          계약 명의(상호·대표자·주소·직인)
--   workplace_contract_entity  사업장 → 계약 명의 연결(코드에 하드코딩하지 않음)
--   contract_templates         양식(명의·1주/11개월·원본 PDF·필드맵 버전)
--   employment_contracts       계약서(서명대기/서명완료/무효/종료)
--   contract_signature_events  증거 기록(쌓기만)
--   minimum_wages              연도별 최저시급
--   Storage 비공개 버킷 employment-contracts
--
-- 지키는 원칙
--   ① 서명 완료된 계약서는 수정·삭제할 수 없다. 앱 코드가 아니라 DB 트리거가 막는다.
--      트리거는 서버 키(service_role)로 접근해도, SQL Editor 에서 접근해도 똑같이 막는다.
--      허용되는 변경은 "서명완료 → 무효/종료" 상태 전환 하나뿐이다.
--   ② 모든 테이블에 RLS 를 켜고 정책을 만들지 않는다 = 브라우저 키(anon) 접근 전면 차단.
--      근로자 앱은 Supabase 로그인을 쓰지 않으므로 "본인 계약서만"은 서버가 확인한다.
--   ③ Supabase 는 새 테이블에 service_role 전체 권한을 기본으로 붙인다(2026-10-01 실측).
--      grant 만 적으면 안 막히므로, 먼저 전부 회수하고 필요한 권한만 다시 준다.
--   ④ 주민등록번호 원본은 DB 에 두지 않는다. 서버가 AES-256-GCM 으로 암호화한 값만 저장한다
--      (키는 서버 환경변수에만 있음). 증거 기록에는 가린 값조차 남기지 않는다.
--
-- 기존 테이블은 건드리지 않는다. 기존 직원에게는 계약서 행이 생기지 않는다.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) 계약 명의
-- ------------------------------------------------------------
create table if not exists public.contract_entities (
  id              bigserial   primary key,
  code            text        not null unique,
  business_name   text        not null,
  representative  text        not null,
  address         text        not null,
  -- 직인 이미지 위치(저장소 기준 경로). 원본 양식에 이미 인쇄된 상호·대표자·주소와 같아야 한다.
  seal_path       text,
  created_at      timestamptz not null default now()
);

comment on table public.contract_entities is
  '근로계약서 계약 명의(사용자/갑). 1차는 장사꾼만. 헤모즈는 2차에 행만 추가.';

-- ------------------------------------------------------------
-- 2) 사업장 → 계약 명의 (한 직원은 한 사업장에만 소속)
-- ------------------------------------------------------------
create table if not exists public.workplace_contract_entity (
  workplace_name  text        primary key,
  entity_id       bigint      not null references public.contract_entities(id),
  created_at      timestamptz not null default now()
);

comment on table public.workplace_contract_entity is
  '직원 소속 사업장(employees.workplace_name) → 계약 명의. 여기 없는 사업장(헤모즈 등)은 계약서 대상이 아니다.';

-- ------------------------------------------------------------
-- 3) 양식
-- ------------------------------------------------------------
create table if not exists public.contract_templates (
  id                   bigserial   primary key,
  code                 text        not null unique,
  entity_id            bigint      not null references public.contract_entities(id),
  kind                 text        not null check (kind in ('week', 'month11')),
  title                text        not null,
  file_path            text        not null,
  -- 원본 PDF 지문. 파일이 바뀌면 칸 위치가 어긋나므로 서버가 생성을 거부한다.
  file_sha256          text        not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  field_map_version    int         not null check (field_map_version > 0),
  -- 양식에 인쇄된 시급. 최저시급·직원 시급과 비교한다.
  printed_hourly_wage  int         not null check (printed_hourly_wage > 0),
  is_active            boolean     not null default true,
  created_at           timestamptz not null default now()
);

-- 명의·종류마다 쓰는 양식은 하나
create unique index if not exists contract_templates_active_uidx
  on public.contract_templates(entity_id, kind) where is_active;

comment on table public.contract_templates is
  '근로계약서 양식. 원본 PDF 를 배경으로 쓰고 필드맵(app/lib/contracts/templates.ts)의 좌표에 입력값만 얹는다.';

-- ------------------------------------------------------------
-- 4) 연도별 최저시급
-- ------------------------------------------------------------
create table if not exists public.minimum_wages (
  year         int         primary key check (year between 2020 and 2100),
  hourly_wage  int         not null check (hourly_wage > 0),
  note         text,
  updated_at   timestamptz not null default now()
);

comment on table public.minimum_wages is
  '연도별 최저시급. 계약 시작일이 속한 연도 값으로 비교한다. 값이 없는 해는 계약서 작성을 막는다.';

-- ------------------------------------------------------------
-- 5) 계약서
--    employee_id 에 FK 를 걸지 않는다. 직원을 지워도 서명된 계약서는 남아야 하고,
--    직원 삭제 기능은 하위 테이블을 지우고 나서 직원을 지우므로 FK 가 있으면 삭제가 막힌다.
-- ------------------------------------------------------------
create table if not exists public.employment_contracts (
  id                  bigserial   primary key,
  employee_id         bigint      not null,
  employee_name       text        not null,
  workplace_name      text        not null,
  entity_id           bigint      not null references public.contract_entities(id),
  template_id         bigint      not null references public.contract_templates(id),
  kind                text        not null check (kind in ('week', 'month11')),
  status              text        not null default 'pending'
                        check (status in ('pending', 'signed', 'void', 'ended')),
  -- 왜 이 계약서가 필요해졌는지
  trigger_reason      text        not null
                        check (trigger_reason in ('signup', 'type_change', 'renewal', 'week_expired', 'reissue')),
  start_date          date,
  end_date            date,
  -- 서명대기 때 미리 채울 값(직전 계약 입력값 등). 주민번호는 암호문만.
  prefill             jsonb       not null default '{}'::jsonb,
  -- 서명 시점 입력값 전체. 주민번호는 암호문(v1:...)과 가린 값만.
  input_snapshot      jsonb,
  signature_path      text,
  signed_pdf_path     text,
  signed_pdf_sha256   text        check (signed_pdf_sha256 is null or signed_pdf_sha256 ~ '^[0-9a-f]{64}$'),
  signed_at           timestamptz,
  signer_device_id    text,
  signer_ip           text,
  signer_user_agent   text,
  void_reason         text,
  voided_at           timestamptz,
  ended_at            timestamptz,
  superseded_by       bigint,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,

  constraint employment_contracts_period check (start_date is null or end_date is null or end_date >= start_date),
  -- 상태별로 서명 정보가 있어야 하는지 / 없어야 하는지
  --   서명대기: 서명 정보 없음
  --   서명완료·종료: 서명 시각·PDF·지문·입력값 스냅샷이 모두 있어야 함
  --   무효: 서명 전에 무효면 모두 없음, 서명 후 무효면 모두 있음(섞이면 안 됨)
  constraint employment_contracts_signed_complete check (
    case
      when status = 'pending' then
        signed_at is null and signed_pdf_path is null and signed_pdf_sha256 is null and input_snapshot is null
      when status in ('signed', 'ended') then
        signed_at is not null and signed_pdf_path is not null and signed_pdf_sha256 is not null and input_snapshot is not null
      else
        (signed_at is null) = (signed_pdf_path is null)
        and (signed_at is null) = (signed_pdf_sha256 is null)
        and (signed_at is null) = (input_snapshot is null)
    end
  ),
  constraint employment_contracts_ended_at check (status <> 'ended' or ended_at is not null),
  constraint employment_contracts_signed_has_period check (
    signed_at is null or (start_date is not null and end_date is not null)
  ),
  constraint employment_contracts_void_reason check (status <> 'void' or (voided_at is not null and void_reason is not null))
);

comment on table public.employment_contracts is
  '근로계약서. pending=서명대기, signed=서명완료, void=관리자 무효, ended=새 계약 서명으로 종료. 서명 완료 행은 트리거가 수정·삭제를 막는다.';
comment on column public.employment_contracts.input_snapshot is
  '서명 시점 입력값 전체. 직원 정보가 나중에 바뀌어도 이 값은 바뀌지 않는다. 주민번호는 residentNumberEncrypted(암호문)와 residentNumberMasked(가린 값)만.';

-- 직원마다 서명대기는 하나만
create unique index if not exists employment_contracts_one_pending_uidx
  on public.employment_contracts(employee_id) where status = 'pending';

create index if not exists employment_contracts_employee_idx
  on public.employment_contracts(employee_id, created_at desc);

create index if not exists employment_contracts_status_idx
  on public.employment_contracts(status);

-- ------------------------------------------------------------
-- 5-1) 서명 완료 계약서 보호 트리거
-- ------------------------------------------------------------
create or replace function public.employment_contracts_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  -- 서명 완료 → 무효/종료 전환 때 바뀌어도 되는 칸
  allowed text[] := array['status', 'void_reason', 'voided_at', 'ended_at', 'superseded_by', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'pending' then
      raise exception '서명된 계약서는 삭제할 수 없습니다 (계약 %)', old.id using errcode = '42501';
    end if;
    return old;
  end if;

  -- 아래는 UPDATE
  if old.status = 'pending' then
    if new.status not in ('pending', 'signed', 'void') then
      raise exception '서명대기 계약서는 서명완료 또는 무효로만 바꿀 수 있습니다 (계약 %)', old.id using errcode = '42501';
    end if;
    -- 직원·명의·양식·종류는 서명대기 중에도 바꾸지 않는다(바꾸려면 무효 후 새로 만든다)
    if new.employee_id <> old.employee_id
       or new.entity_id <> old.entity_id
       or new.template_id <> old.template_id
       or new.kind <> old.kind then
      raise exception '계약서의 직원·명의·양식·종류는 바꿀 수 없습니다 (계약 %)', old.id using errcode = '42501';
    end if;
    return new;
  end if;

  if old.status = 'signed' then
    if new.status not in ('void', 'ended') then
      raise exception '서명 완료된 계약서는 수정할 수 없습니다 (계약 %). 바꿔야 하면 무효 처리 후 새로 작성하세요.', old.id
        using errcode = '42501';
    end if;
    if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
      raise exception '서명 완료된 계약서의 내용은 바꿀 수 없습니다 (계약 %). 상태만 무효/종료로 바꿀 수 있습니다.', old.id
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception '무효·종료된 계약서는 수정할 수 없습니다 (계약 %)', old.id using errcode = '42501';
end;
$$;

drop trigger if exists employment_contracts_guard_trg on public.employment_contracts;
create trigger employment_contracts_guard_trg
  before update or delete on public.employment_contracts
  for each row execute function public.employment_contracts_guard();

create or replace function public.employment_contracts_touch()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employment_contracts_touch_trg on public.employment_contracts;
create trigger employment_contracts_touch_trg
  before update on public.employment_contracts
  for each row execute function public.employment_contracts_touch();

-- 새로 만드는 행은 서명대기로만(서명 완료 행을 직접 끼워 넣지 못하게)
create or replace function public.employment_contracts_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status <> 'pending' or new.signed_at is not null then
    raise exception '계약서는 서명대기 상태로만 만들 수 있습니다' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists employment_contracts_insert_guard_trg on public.employment_contracts;
create trigger employment_contracts_insert_guard_trg
  before insert on public.employment_contracts
  for each row execute function public.employment_contracts_insert_guard();

-- ------------------------------------------------------------
-- 6) 증거 기록 (쌓기만)
-- ------------------------------------------------------------
create table if not exists public.contract_signature_events (
  id                bigserial   primary key,
  contract_id       bigint      not null references public.employment_contracts(id),
  employee_id       bigint      not null,
  event_type        text        not null check (event_type in (
                       'page_opened', 'input_started', 'preview_read_to_end',
                       'warning_acknowledged', 'sign_rejected', 'signed',
                       'pdf_downloaded', 'voided', 'ended', 'created'
                     )),
  -- 주민번호는 원본·가린 값 모두 넣지 않는다
  detail            jsonb       not null default '{}'::jsonb,
  document_sha256   text        check (document_sha256 is null or document_sha256 ~ '^[0-9a-f]{64}$'),
  actor             text        not null check (actor in ('worker', 'admin-ui', 'system')),
  device_id         text,
  request_ip        text,
  user_agent        text,
  created_at        timestamptz not null default now()
);

create index if not exists contract_signature_events_contract_idx
  on public.contract_signature_events(contract_id, created_at);

comment on table public.contract_signature_events is
  '근로계약서 증거 기록. 페이지 진입·작성 시작·미리보기 끝까지 열람·경고 확인·서명 완료 시각과 IP/User-Agent. 수정·삭제 권한 없음.';

-- ------------------------------------------------------------
-- 7) 권한: 브라우저 키 전면 차단 + service_role 은 필요한 것만
-- ------------------------------------------------------------
alter table public.contract_entities          enable row level security;
alter table public.workplace_contract_entity  enable row level security;
alter table public.contract_templates         enable row level security;
alter table public.minimum_wages              enable row level security;
alter table public.employment_contracts       enable row level security;
alter table public.contract_signature_events  enable row level security;

revoke all on table public.contract_entities          from anon, authenticated, service_role;
revoke all on table public.workplace_contract_entity  from anon, authenticated, service_role;
revoke all on table public.contract_templates         from anon, authenticated, service_role;
revoke all on table public.minimum_wages              from anon, authenticated, service_role;
revoke all on table public.employment_contracts       from anon, authenticated, service_role;
revoke all on table public.contract_signature_events  from anon, authenticated, service_role;

grant select                         on public.contract_entities          to service_role;
grant select                         on public.workplace_contract_entity  to service_role;
grant select                         on public.contract_templates         to service_role;
grant select, insert, update         on public.minimum_wages              to service_role;
-- update·delete 는 트리거가 서명 완료 행을 막는다(delete 는 서명대기만 가능)
grant select, insert, update, delete on public.employment_contracts       to service_role;
grant select, insert                 on public.contract_signature_events  to service_role;

grant usage, select on sequence public.employment_contracts_id_seq       to service_role;
grant usage, select on sequence public.contract_signature_events_id_seq  to service_role;

-- ------------------------------------------------------------
-- 8) 비공개 저장소 (외부 공개 URL 금지, 짧은 유효기간 서명 URL 로만 열람)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employment-contracts', 'employment-contracts', false, 5242880, array['application/pdf', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- 9) 1차 기본값
-- ------------------------------------------------------------
insert into public.contract_entities (code, business_name, representative, address, seal_path)
values ('jangsakun', '(주)장사꾼을위한장사꾼', '서수빈', '전북특별자치도 전주시 덕진구 팔복동4가 238',
        'assets/contracts/seals/jangsakun.png')
on conflict (code) do nothing;

insert into public.workplace_contract_entity (workplace_name, entity_id)
select w, e.id
  from unnest(array['장사꾼', '깨소금', '로엔티크']) as w
  cross join public.contract_entities e
 where e.code = 'jangsakun'
on conflict (workplace_name) do nothing;

insert into public.contract_templates
  (code, entity_id, kind, title, file_path, file_sha256, field_map_version, printed_hourly_wage)
select t.code, e.id, t.kind, t.title, t.file_path, t.sha, 1, 10320
  from (values
    ('jangsakun_week_v1', 'week', '장사꾼 일용직 근로계약서(1주)',
     'assets/contracts/templates/jangsakun_week_v1.pdf',
     'f9e98f11efe46b57278f9037757ec951de94e924f96a78cc9911323a70c92274'),
    ('jangsakun_11m_v1', 'month11', '장사꾼 근로계약서(11개월)',
     'assets/contracts/templates/jangsakun_11m_v1.pdf',
     '66ba744c8cadf23401147d46f7bd3dbb7d2131bc87ce196c4d0a8bbc1991a897')
  ) as t(code, kind, title, file_path, sha)
  cross join public.contract_entities e
 where e.code = 'jangsakun'
on conflict (code) do nothing;

insert into public.minimum_wages (year, hourly_wage, note)
values (2026, 10320, '2026년 최저임금 고시(2026-10-14 사용자 확인)')
on conflict (year) do nothing;

commit;

notify pgrst, 'reload schema';


-- ------------------------------------------------------------
-- 확인용
-- ------------------------------------------------------------
-- select table_name, privilege_type from information_schema.role_table_grants
--  where grantee = 'service_role' and table_name in
--   ('contract_entities','workplace_contract_entity','contract_templates','minimum_wages',
--    'employment_contracts','contract_signature_events') order by 1, 2;
-- select id, public from storage.buckets where id = 'employment-contracts';


-- ------------------------------------------------------------
-- 롤백 (계약서가 하나도 없을 때만)
-- ------------------------------------------------------------
-- drop table if exists public.contract_signature_events;
-- drop table if exists public.employment_contracts;
-- drop function if exists public.employment_contracts_guard();
-- drop function if exists public.employment_contracts_touch();
-- drop function if exists public.employment_contracts_insert_guard();
-- drop table if exists public.minimum_wages;
-- drop table if exists public.contract_templates;
-- drop table if exists public.workplace_contract_entity;
-- drop table if exists public.contract_entities;
-- delete from storage.buckets where id = 'employment-contracts';
