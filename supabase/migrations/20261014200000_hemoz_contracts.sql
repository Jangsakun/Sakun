-- ============================================================
-- 전자 근로계약서: 헤모즈 신규 가입자에게도 적용 (2026-10-14 사용자 결정)
--
--   명의: 주식회사 헤모즈 (대표 서수빈) / 직인: 주급명세서 직인(public/stamp1.png) 그대로
--   양식: 사용자 제공 PDF 2개 (바탕화면 일용직_7일 근로계약서_헤모즈.pdf, 용역계약서_11개월_10320원_헤모즈.pdf)
--   대상: 헤모즈 근무지 신규 가입자부터. 기존 헤모즈 직원은 그대로(계약서 행을 만들지 않음)
--
-- 테이블 구조·권한은 바꾸지 않고 행만 추가합니다. 다시 실행해도 같은 결과입니다.
-- ============================================================

begin;

insert into public.contract_entities (code, business_name, representative, address, seal_path)
values ('hemoz', '주식회사 헤모즈', '서수빈', '전북특별자치도 전주시 완산구 후곡길 23-18',
        'assets/contracts/seals/hemoz.png')
on conflict (code) do nothing;

insert into public.contract_templates
  (code, entity_id, kind, title, file_path, file_sha256, field_map_version, printed_hourly_wage)
select t.code, e.id, t.kind, t.title, t.file_path, t.sha, 1, 10320
  from (values
    ('hemoz_week_v1', 'week', '헤모즈 일용직 근로계약서(1주)',
     'assets/contracts/templates/hemoz_week_v1.pdf',
     '44b836710486541333c2eefcf21a8a11d5bd44efc2440468164c405c391b9d48'),
    ('hemoz_11m_v1', 'month11', '헤모즈 근로계약서(11개월)',
     'assets/contracts/templates/hemoz_11m_v1.pdf',
     '92eadbe9f2a2589cd6d0f785b9b95bf48d58274c39ce4f27f004abd210993132')
  ) as t(code, kind, title, file_path, sha)
  cross join public.contract_entities e
 where e.code = 'hemoz'
on conflict (code) do nothing;

-- 이 줄이 들어가는 순간부터 헤모즈 신규 가입자에게 계약서 화면이 뜹니다.
insert into public.workplace_contract_entity (workplace_name, entity_id)
select '헤모즈', e.id from public.contract_entities e where e.code = 'hemoz'
on conflict (workplace_name) do nothing;

commit;

notify pgrst, 'reload schema';

-- 확인
select w.workplace_name, e.business_name, t.code, t.kind
  from public.workplace_contract_entity w
  join public.contract_entities e on e.id = w.entity_id
  join public.contract_templates t on t.entity_id = e.id and t.is_active
 order by 1, 4;

-- ------------------------------------------------------------
-- 되돌리기 (헤모즈 계약서가 하나도 없을 때만)
-- ------------------------------------------------------------
-- delete from public.workplace_contract_entity where workplace_name = '헤모즈';
-- delete from public.contract_templates where code in ('hemoz_week_v1', 'hemoz_11m_v1');
-- delete from public.contract_entities where code = 'hemoz';
