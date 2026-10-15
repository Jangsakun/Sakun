-- ============================================================
-- 관리자 화면 "삭제" 버튼: 서명대기 계약서만 지우는 함수 (2026-10-15 사용자 요청)
--
--   테스트하다 생긴 서명대기 계약서를 관리자 화면에서 지울 수 있게 합니다.
--   ▸ 서명대기(pending)만 지웁니다. 서명 완료·종료·무효는 함수가 거부하고,
--     기존 보호 트리거(employment_contracts_guard)도 그대로 거부합니다. 트리거는 건드리지 않습니다.
--   ▸ 계약서와 그 계약서의 기록(작성 화면 열림 등)을 함께 지웁니다. 서명 전이라 서명 증거는 없습니다.
--   ▸ 서버 키(service_role)만 부를 수 있습니다. 테이블 권한(삭제 금지)은 그대로입니다.
-- ============================================================

begin;

create or replace function public.delete_pending_contract(p_contract_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c record;
  n_events int;
begin
  select id, employee_id, employee_name, status
    into c
    from public.employment_contracts
   where id = p_contract_id
   for update;

  if not found then
    raise exception '계약서를 찾을 수 없습니다 (계약 %)', p_contract_id using errcode = 'P0002';
  end if;

  if c.status <> 'pending' then
    raise exception '서명대기 계약서만 삭제할 수 있습니다 (계약 %, 상태 %)', p_contract_id, c.status using errcode = '42501';
  end if;

  delete from public.contract_signature_events where contract_id = p_contract_id;
  get diagnostics n_events = row_count;

  delete from public.employment_contracts where id = p_contract_id and status = 'pending';

  return jsonb_build_object('contractId', c.id, 'employeeId', c.employee_id, 'employeeName', c.employee_name, 'deletedEvents', n_events);
end;
$$;

revoke all on function public.delete_pending_contract(bigint) from public, anon, authenticated;
grant execute on function public.delete_pending_contract(bigint) to service_role;

commit;

notify pgrst, 'reload schema';

-- 확인: 함수가 보이면 정상
select proname, prosecdef as security_definer from pg_proc where proname = 'delete_pending_contract';

-- 되돌리기
-- drop function if exists public.delete_pending_contract(bigint);
