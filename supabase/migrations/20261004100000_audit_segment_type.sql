-- ============================================================
-- 근태 SaaS — 출퇴근 변경 감사로그에 구간 종류(시급/도급) 기록
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 이 SQL 은 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
-- ⚠️ 코드 배포 "전에" 먼저 실행해야 합니다.
--    새 코드는 감사 행에 segment_type 을 함께 넣는데, 칸이 없으면 감사 기록이 실패합니다
--    (변경 자체는 성공하지만 감사 이력이 남지 않습니다).
--
-- 무엇을 하는가
--   attendance_record_audit.segment_type 추가 ('hourly' | 'piece').
--   기존 행은 null 로 남습니다(구간 개념이 생기기 전 기록 = 전부 시급).
--   이 테이블은 append-only(수정·삭제 불가) 설정을 그대로 유지합니다 — 권한은 건드리지 않습니다.
-- ============================================================

begin;

alter table public.attendance_record_audit
  add column if not exists segment_type text;

alter table public.attendance_record_audit
  drop constraint if exists attendance_record_audit_segment_type_check;

alter table public.attendance_record_audit
  add constraint attendance_record_audit_segment_type_check
  check (segment_type is null or segment_type in ('hourly', 'piece'));

comment on column public.attendance_record_audit.segment_type is
  '변경된 출퇴근 기록의 구간 종류. hourly=시급 구간, piece=도급 구간, null=구간 개념 이전 기록 또는 해당 없음(세전급여 직접지정).';

commit;

notify pgrst, 'reload schema';

-- 확인
-- select column_name, data_type from information_schema.columns
--  where table_name = 'attendance_record_audit' and column_name = 'segment_type';

-- 롤백
-- alter table public.attendance_record_audit drop constraint if exists attendance_record_audit_segment_type_check;
-- alter table public.attendance_record_audit drop column if exists segment_type;
