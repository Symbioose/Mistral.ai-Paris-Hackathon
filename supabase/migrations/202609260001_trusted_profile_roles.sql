-- Upgrade already-migrated projects: user-editable metadata must never grant manager rights.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare trusted_role public.profiles.role%type;
begin
 trusted_role := case when new.raw_app_meta_data->>'role'='manager' then 'manager' else 'student' end;
 insert into public.profiles(id,role,full_name)
 values(new.id,trusted_role,new.raw_user_meta_data->>'full_name')
 on conflict(id) do nothing;
 return new;
end; $$;
-- Keep any existing profile-edit policy from allowing direct role self-promotion.
create or replace function public.protect_profile_role() returns trigger language plpgsql set search_path=public as $$
begin
 if current_user in ('authenticated','anon') and new.role is distinct from old.role then
  raise exception 'Profile roles can only be changed by the trusted server';
 end if;
 return new;
end; $$;
drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role before update of role on public.profiles for each row execute function public.protect_profile_role();
