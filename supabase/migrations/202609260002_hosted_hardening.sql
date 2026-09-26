-- Keep the original quiz schema compatible while removing editable-metadata authorization.
-- Conditional blocks also support a fresh installation containing only the simulator.
do $$ begin
 if to_regclass('public.trainings') is not null then
  alter policy trainings_manager_insert on public.trainings to authenticated with check
   (manager_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='manager'));
  alter policy trainings_student_read_published on public.trainings to authenticated using
   (status='published' and exists(select 1 from public.profiles where id=(select auth.uid()) and role='student'));
 end if;
 if to_regclass('public.enrollments') is not null then
  alter policy enrollments_student_insert on public.enrollments to authenticated with check
   (student_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='student'));
  alter policy enrollments_manager_select on public.enrollments to authenticated using
   (exists(select 1 from public.profiles where id=(select auth.uid()) and role='manager')
    and exists(select 1 from public.trainings t where t.id=enrollments.training_id and t.manager_id=(select auth.uid())));
 end if;
end $$;
create index if not exists simulation_scenarios_owner on public.simulation_scenarios(owner_id);
create index if not exists simulation_scenarios_published on public.simulation_scenarios(published_version_id);
create index if not exists simulation_versions_scenario on public.simulation_versions(scenario_id);
create index if not exists simulation_sessions_version on public.simulation_sessions(scenario_version_id,created_at desc,id desc);
alter function public.simulation_immutable_version() set search_path=public;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
-- Internal triggers are not public RPCs. Fix lookup paths for existing legacy functions.
do $$ declare f record; t text; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('handle_updated_at','generate_join_code','auto_assign_join_code','handle_enrollment_status_change','match_chunks')
 loop
  execute format('alter function %s set search_path=public,extensions',f.signature);
  execute format('revoke execute on function %s from public,anon',f.signature);
 end loop;
 foreach t in array array['profiles','trainings','enrollments','manager_invites','document_chunks','copilot_queries'] loop
  if to_regclass('public.'||t) is not null then execute format('revoke all on public.%I from anon',t);end if;
 end loop;
 if to_regclass('public.manager_invites') is not null then revoke all on public.manager_invites from authenticated;end if;
end $$;
