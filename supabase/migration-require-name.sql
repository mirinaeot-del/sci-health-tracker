-- =========================================================
-- 회원가입 시 이름 필수 (서버에서 강제)
-- 앱 화면 검사를 우회하거나, 예전 버전 앱(이름 칸 없음)으로 가입하는 경우도 막는다.
-- Supabase → SQL Editor 에 붙여넣고 RUN (여러 번 실행해도 안전)
-- =========================================================

alter table public.profiles add column if not exists name text;
alter table public.profiles alter column nickname drop not null;

-- 1) 가입 트리거: 이름이 2자 미만이면 가입 자체를 거부
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(new.raw_user_meta_data->>'name', ''));
begin
  if char_length(v_name) < 2 then
    raise exception 'NAME_REQUIRED';
  end if;

  insert into public.profiles (id, username, name, nickname, injury_level, injury_degree, onset_date)
  values (
    new.id,
    new.email,
    v_name,
    nullif(trim(coalesce(new.raw_user_meta_data->>'nickname', '')), ''),
    nullif(new.raw_user_meta_data->>'injury_level', ''),
    nullif(new.raw_user_meta_data->>'injury_degree', ''),
    (nullif(new.raw_user_meta_data->>'onset_date', ''))::date
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) 이미 이름이 있는 참여자가 이름을 빈칸으로 바꾸지 못하게 막음
--    (이름이 아직 없는 기존 참여자는 이 규칙에 걸리지 않고, 이름을 새로 입력할 수 있음)
create or replace function public.keep_name_not_blank()
returns trigger
language plpgsql
as $$
begin
  if coalesce(trim(old.name), '') <> '' and coalesce(trim(new.name), '') = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_keep_name on public.profiles;
create trigger profiles_keep_name
  before update on public.profiles
  for each row execute function public.keep_name_not_blank();
