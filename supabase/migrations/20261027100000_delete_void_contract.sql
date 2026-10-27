-- ============================================================
-- 관리자 화면 "삭제" 버튼: 무효 계약서 삭제 (2026-10-27 사용자 요청)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--
-- 원칙 변경
--   2026-10-14: 서명된 계약서는 지우지 않고 무효 처리만 한다.
--   2026-10-27: 사용자 결정으로 "무효" 계약서는 관리자가 삭제할 수 있게 한다.
--               서명 완료·종료 계약서는 지금처럼 삭제할 수 없다.
--
-- 방식
--   보호 트리거(employment_contracts_guard)는 그대로 두고, 삭제 전용 함수 delete_void_contract 안에서만
--   "무효 계약서 삭제 허용" 표시(app.allow_void_contract_delete, 이 실행 안에서만 유효)를 켠다.
--   그 밖의 경로(SQL Editor·서버 키·다른 함수)로는 지금처럼 삭제가 막힌다.
--   계약서와 함께 서명 증거 기록·다운로드 링크·문자 기록을 지운다.
--   저장소의 PDF·서명 이미지는 함수가 경로를 돌려주고 관리자 API 가 지운다.
-- ============================================================

begin;

-- 1) 보호 트리거: 삭제 부분만 바뀜(무효 + 허용 표시일 때만 통과). 수정 규칙은 기존과 같다.
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
    if old.status = 'pending' then
      return old;
    end if;
    if old.status = 'void' and current_setting('app.allow_void_contract_delete', true) = 'on' then
      return old;
    end if;
    raise exception '서명된 계약서는 삭제할 수 없습니다 (계약 %)', old.id using errcode = '42501';
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

-- 2) 무효 계약서 삭제 함수
create or replace function public.delete_void_contract(p_contract_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c record;
  n_events int;
  n_links int;
  n_sms int;
begin
  select id, employee_id, employee_name, status, signed_pdf_path, signature_path
    into c
    from public.employment_contracts
   where id = p_contract_id
   for update;

  if not found then
    raise exception '계약서를 찾을 수 없습니다 (계약 %)', p_contract_id using errcode = 'P0002';
  end if;

  if c.status <> 'void' then
    raise exception '무효 계약서만 삭제할 수 있습니다 (계약 %, 상태 %)', p_contract_id, c.status using errcode = '42501';
  end if;

  delete from public.sms_outbox where purpose = 'contract_signed_link' and ref_id = p_contract_id;
  get diagnostics n_sms = row_count;

  delete from public.contract_download_links where contract_id = p_contract_id;
  get diagnostics n_links = row_count;

  delete from public.contract_signature_events where contract_id = p_contract_id;
  get diagnostics n_events = row_count;

  perform set_config('app.allow_void_contract_delete', 'on', true);
  delete from public.employment_contracts where id = p_contract_id and status = 'void';
  perform set_config('app.allow_void_contract_delete', 'off', true);

  return jsonb_build_object(
    'contractId', c.id,
    'employeeId', c.employee_id,
    'employeeName', c.employee_name,
    'deletedEvents', n_events,
    'deletedLinks', n_links,
    'deletedSms', n_sms,
    'files', jsonb_build_array(c.signed_pdf_path, c.signature_path)
  );
end;
$$;

revoke all on function public.delete_void_contract(bigint) from public, anon, authenticated;
grant execute on function public.delete_void_contract(bigint) to service_role;

commit;

notify pgrst, 'reload schema';

-- 확인: 함수가 보이면 정상
select proname, prosecdef as security_definer from pg_proc where proname in ('delete_void_contract', 'employment_contracts_guard');

-- 되돌리기(무효 삭제 막기): 20261014100000_employment_contracts.sql 의 employment_contracts_guard 를 다시 실행하고
-- drop function if exists public.delete_void_contract(bigint);
