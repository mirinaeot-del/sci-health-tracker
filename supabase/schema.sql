-- =========================================================
-- 건강 지킴이 · Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 이 전체를 붙여넣고 RUN 하세요.
-- (여러 번 실행해도 안전하도록 IF NOT EXISTS / OR REPLACE 사용)
-- =========================================================

-- ---------------------------------------------------------
-- 1) profiles : 사용자 프로필 (auth.users 와 1:1)
--    가입 시 닉네임(필수) + 손상레벨/정도/발병일(선택) 저장
--    role: 'user' | 'admin'
--    share_compare: 비교 데이터 공유 동의 여부
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique,                  -- 로그인 아이디(이메일로 매핑됨)
  nickname      text not null,                -- 닉네임(필수)
  injury_level  text,                         -- 손상 레벨 (선택)
  injury_degree text,                         -- 손상 정도 (선택)
  onset_date    date,                         -- 발병일 (선택)
  role          text not null default 'user', -- 'user' | 'admin'
  share_compare boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 2) records : 일일 건강/운동/활동 기록
--    상세 내용은 data(jsonb)에 저장 (mood/pain/spasticity/urine/
--    bowel/skin/exercises/activities/memo 등) → 유연한 확장
-- ---------------------------------------------------------
create table if not exists public.records (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  record_date date not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, record_date)   -- 하루 1건 (upsert 기준)
);

-- ---------------------------------------------------------
-- 3) surveys : 기능평가 설문 (여러 시점 누적)
-- ---------------------------------------------------------
create table if not exists public.surveys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  answers     jsonb not null default '{}'::jsonb,
  total_score int,
  total_max   int,
  is_baseline boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 4) goals : 사용자별 주간 목표
-- ---------------------------------------------------------
create table if not exists public.goals (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  ex_min      int not null default 150,
  ex_days     int not null default 3,
  act_min     int not null default 300,
  record_days int not null default 5,
  updated_at  timestamptz not null default now()
);

-- =========================================================
-- RLS (Row Level Security) : 접근 권한의 핵심
-- =========================================================
alter table public.profiles enable row level security;
alter table public.records  enable row level security;
alter table public.surveys  enable row level security;
alter table public.goals    enable row level security;

-- 관리자 판별 함수 (profiles.role = 'admin')
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- ---------- profiles 정책 ----------
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (
    id = auth.uid()                      -- 본인
    or public.is_admin()                 -- 관리자는 전체
    or share_compare = true              -- 비교 공유 동의자는 서로 공개
  );

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update
  using (id = auth.uid() or public.is_admin());

-- ---------- records 정책 ----------
drop policy if exists "records_select" on public.records;
create policy "records_select" on public.records for select
  using (
    user_id = auth.uid()                 -- 본인
    or public.is_admin()                 -- 관리자
    or exists (                          -- 비교 공유 동의자 서로 공개
      select 1 from public.profiles me, public.profiles other
      where me.id = auth.uid() and me.share_compare = true
        and other.id = records.user_id and other.share_compare = true
    )
  );

drop policy if exists "records_write" on public.records;
create policy "records_write" on public.records for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- surveys 정책 ----------
drop policy if exists "surveys_select" on public.surveys;
create policy "surveys_select" on public.surveys for select
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.profiles me, public.profiles other
      where me.id = auth.uid() and me.share_compare = true
        and other.id = surveys.user_id and other.share_compare = true
    )
  );

drop policy if exists "surveys_write" on public.surveys;
create policy "surveys_write" on public.surveys for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- goals 정책 ----------
drop policy if exists "goals_select" on public.goals;
create policy "goals_select" on public.goals for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "goals_write" on public.goals;
create policy "goals_write" on public.goals for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =========================================================
-- 가입 시 profiles 자동 생성 트리거
-- (회원가입 때 넘긴 메타데이터로 프로필 행을 만든다)
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, nickname, injury_level, injury_degree, onset_date)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)),
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

-- =========================================================
-- 끝. (관리자 지정은 아래 주석 참고)
-- 특정 사용자를 관리자로 만들려면, 그 사람이 가입한 뒤:
--   update public.profiles set role='admin' where username='admin@example.com';
-- =========================================================
