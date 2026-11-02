-- =========================================================
-- 마이그레이션: 본명(name) 컬럼 추가 + 닉네임 선택화 + 트리거 갱신
-- 이미 schema.sql 을 한 번 실행한 프로젝트에서, 이 파일만 실행하세요.
-- (Supabase → SQL Editor 에 붙여넣고 RUN)
-- 여러 번 실행해도 안전합니다.
-- =========================================================

-- 1) 본명 컬럼 추가, 닉네임 NOT NULL 해제
alter table public.profiles add column if not exists name text;
alter table public.profiles alter column nickname drop not null;

-- 2) 가입 트리거가 name 도 저장하도록 갱신
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, name, nickname, injury_level, injury_degree, onset_date)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'name', ''),
    nullif(new.raw_user_meta_data->>'nickname', ''),
    nullif(new.raw_user_meta_data->>'injury_level', ''),
    nullif(new.raw_user_meta_data->>'injury_degree', ''),
    (nullif(new.raw_user_meta_data->>'onset_date', ''))::date
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
