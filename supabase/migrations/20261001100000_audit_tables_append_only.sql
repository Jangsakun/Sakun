-- ============================================================
-- 근태 SaaS — 기록 테이블을 정말로 "쌓기만" 되게 막기 (2026-10-01)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--
-- 왜 필요한가
--   Supabase 는 public 스키마에 새 테이블을 만들면 service_role 에 모든 권한을
--   기본으로 붙인다(ALTER DEFAULT PRIVILEGES). 이전 마이그레이션들은
--   "grant select, insert" 만 적고 나머지를 회수하지 않아서, 서버 키로
--   기록을 고치거나 지울 수 있는 상태였다. 2026-10-01 실측으로 확인.
--     - employment_contract_history  (20260930100000)
--     - attendance_record_audit      (20260909100000)
--   앱 코드는 두 테이블에 insert 만 한다(수정·삭제 경로 없음, BISEO 도 사용 안 함).
--   그래서 수정·삭제·비우기 권한을 회수해도 기능에는 영향이 없다.
--
--   이제 이 두 테이블을 고치거나 지울 수 있는 것은 SQL Editor(테이블 소유자)뿐이다.
-- ============================================================

begin;

revoke update, delete, truncate on public.employment_contract_history from service_role;
revoke update, delete, truncate on public.attendance_record_audit      from service_role;

commit;

notify pgrst, 'reload schema';


-- ------------------------------------------------------------
-- 확인용 — 두 테이블 모두 service_role 에 INSERT, SELECT 만 남아야 한다
-- ------------------------------------------------------------
-- select table_name, privilege_type from information_schema.role_table_grants
--  where grantee = 'service_role'
--    and table_name in ('employment_contract_history', 'attendance_record_audit')
--  order by table_name, privilege_type;
