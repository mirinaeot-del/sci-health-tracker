-- =========================================================
-- 마이그레이션: 아이디 찾기 / 비밀번호 재설정(관리자 발급)
-- Supabase → SQL Editor 에 붙여넣고 RUN (여러 번 실행해도 안전)
-- 사전 조건: schema.sql 이 이미 실행되어 public.is_admin() 이 있어야 합니다.
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

-- 1) 비밀번호 재설정 요청 테이블 (관리자만 조회/수정)
create table if not exists public.password_requests (
  id          uuid primary key default gen_random_uuid(),
  username    text not null,                       -- 로그인용 내부 이메일 (예: abc@sci.local)
  name        text,                                -- 요청자가 입력한 이름
  note        text,                                -- 연락처/메모
  status      text not null default 'pending',     -- 'pending' | 'done'
  created_at  timestamptz not null default now(),
  handled_at  timestamptz
);
alter table public.password_requests enable row level security;

drop policy if exists "pwreq_admin_select" on public.password_requests;
create policy "pwreq_admin_select" on public.password_requests for select
  using (public.is_admin());

drop policy if exists "pwreq_admin_update" on public.password_requests;
create policy "pwreq_admin_update" on public.password_requests for update
  using (public.is_admin());

-- 2) 아이디 찾기: 이름이 일치하는 참여자의 아이디를 일부 가려서 반환 (최대 5건)
create or replace function public.find_username(p_name text)
returns table(masked text)
language sql security definer
set search_path = public
as $$
  select
    case
      when length(split_part(username, '@', 1)) >= 4 then
        left(split_part(username, '@', 1), 2)
        || repeat('*', length(split_part(username, '@', 1)) - 3)
        || right(split_part(username, '@', 1), 1)
      else
        left(split_part(username, '@', 1), 1)
        || repeat('*', greatest(length(split_part(username, '@', 1)) - 1, 1))
    end as masked
  from public.profiles
  where char_length(trim(coalesce(p_name, ''))) >= 2
    and lower(trim(name)) = lower(trim(p_name))
  limit 5;
$$;
revoke all on function public.find_username(text) from public;
grant execute on function public.find_username(text) to anon, authenticated;

-- 3) 비밀번호 재설정 요청 접수: 아이디와 이름이 모두 일치할 때만 접수 (true/false)
create or replace function public.request_password_reset(p_username text, p_name text, p_note text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_username, '')));
begin
  if position('@' in v_email) = 0 then v_email := v_email || '@sci.local'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then return false; end if;

  if not exists (
    select 1 from public.profiles
    where lower(username) = v_email and lower(trim(name)) = lower(trim(p_name))
  ) then
    return false;
  end if;

  -- 같은 아이디의 대기 중 요청이 이미 있으면 새로 만들지 않음
  if not exists (
    select 1 from public.password_requests where username = v_email and status = 'pending'
  ) then
    insert into public.password_requests (username, name, note)
    values (v_email, trim(p_name), left(coalesce(p_note, ''), 200));
  end if;
  return true;
end;
$$;
revoke all on function public.request_password_reset(text, text, text) from public;
grant execute on function public.request_password_reset(text, text, text) to anon, authenticated;

-- 4) 관리자 전용: 임시 비밀번호 발급
create or replace function public.admin_reset_password(p_username text, p_new_password text)
returns boolean
language plpgsql security definer
set search_path = public, extensions, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_username, '')));
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'password too short';
  end if;
  if position('@' in v_email) = 0 then v_email := v_email || '@sci.local'; end if;

  update auth.users
     set encrypted_password = crypt(p_new_password, gen_salt('bf')),
         updated_at = now()
   where lower(email) = v_email;
  return found;
end;
$$;
revoke all on function public.admin_reset_password(text, text) from public, anon;
grant execute on function public.admin_reset_password(text, text) to authenticated;
