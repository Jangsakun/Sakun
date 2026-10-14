-- ============================================================
-- 헤모즈 11개월 양식 교체 (2026-10-14)
--   v1 은 소재지가 장사꾼 주소(덕진구 팔복동4가 238)로 인쇄돼 있었음 → 사용자가 고친 양식 v2(완산구 후곡길 23-18)
--   v1 행은 지우지 않고 비활성만. 이미 만들어진 서명대기 계약서는 v1 로 계속 작성 가능, 새 계약서부터 v2.
-- 다시 실행해도 같은 결과입니다.
-- ============================================================

begin;

-- 명의·종류마다 활성 양식은 하나(unique index)라서 v1 을 먼저 끕니다.
update public.contract_templates set is_active = false where code = 'hemoz_11m_v1';

insert into public.contract_templates
  (code, entity_id, kind, title, file_path, file_sha256, field_map_version, printed_hourly_wage)
select 'hemoz_11m_v2', e.id, 'month11', '헤모즈 근로계약서(11개월)',
       'assets/contracts/templates/hemoz_11m_v2.pdf',
       '793b70e53a69603d62c37400ce2372acc75c5a541c2f7c2ed8dd2728a4aacf79', 1, 10320
  from public.contract_entities e
 where e.code = 'hemoz'
on conflict (code) do nothing;

commit;

-- 확인: 헤모즈 줄에 hemoz_11m_v2 / hemoz_week_v1 이 보이면 정상
select w.workplace_name, t.code, t.kind
  from public.workplace_contract_entity w
  join public.contract_templates t on t.entity_id = w.entity_id and t.is_active
 order by 1, 3;
