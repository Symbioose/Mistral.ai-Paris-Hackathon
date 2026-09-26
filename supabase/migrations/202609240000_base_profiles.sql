-- Baseline for the auth profile table that predates versioned migrations.
-- Idempotent so it is a no-op on the existing hosted project.
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'student' check (role in ('manager','student')),
 full_name text,
 avatar_url text,
 created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
do $$ begin
 if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_read_own') then
  create policy profiles_read_own on public.profiles for select to authenticated using (id = auth.uid());
 end if;
end $$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,role,full_name)
 values (new.id, case when new.raw_app_meta_data->>'role'='manager' then 'manager' else 'student' end, new.raw_user_meta_data->>'full_name')
 on conflict (id) do nothing;
 return new;
end; $$;
do $$ begin
 if not exists (select 1 from pg_trigger where tgname='on_auth_user_created') then
  create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
 end if;
end $$;
