-- ============================================================
-- 근태 SaaS — 문의사항 사진 첨부 (2026-11-26 사용자 요청)
-- Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 Run
--
-- ⚠️ 근태 SaaS Supabase(weaydriyldnfuotzigzh) 에만 실행합니다.
--
-- 근로자가 문의에 사진을 최대 3장 붙입니다(화면에서 1600px JPEG 로 줄여 올림).
-- 사진은 비공개 저장소(inquiry-photos)에만 두고, 본인·관리자 화면에서 1시간짜리 서명 URL 로만 엽니다.
-- 실행 전 배포해도 안전: 사진 없는 문의는 그대로 되고, 사진을 붙이면 "준비 중" 안내.
-- ============================================================

begin;

alter table public.worker_inquiries
  add column if not exists photo_paths text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inquiry-photos', 'inquiry-photos', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

commit;
