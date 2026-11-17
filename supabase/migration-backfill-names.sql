-- =========================================================
-- 기존 가입자 이름 복구
-- 이름 칸이 생기기 전에 가입한 참여자는, 가입 때 입력한 이름이
-- 로그인 계정 정보(auth.users)에만 남아 있다. 이를 profiles.name 으로 옮긴다.
-- Supabase → SQL Editor 에 붙여넣고 RUN (여러 번 실행해도 안전)
-- =========================================================

-- 1) 복구 (이미 이름이 있는 참여자는 건드리지 않음)
update public.profiles p
   set name = trim(u.raw_user_meta_data->>'name'),
       updated_at = now()
  from auth.users u
 where u.id = p.id
   and coalesce(trim(p.name), '') = ''
   and coalesce(trim(u.raw_user_meta_data->>'name'), '') <> '';

-- 2) 결과 확인: 여전히 이름이 비어 있는 참여자 목록
--    (이 사람들은 가입 화면에 이름 칸이 생기기 전에 가입해서 이름 기록이 없음)
select username as 아이디, nickname as 닉네임, created_at as 가입일
  from public.profiles
 where coalesce(trim(name), '') = ''
 order by created_at;
