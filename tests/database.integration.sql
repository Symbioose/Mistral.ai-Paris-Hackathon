\set ON_ERROR_STOP on
-- Run only against an empty disposable PostgreSQL database. Auth identity emulates
-- Supabase's request JWT claim; table policies/functions are the real migrations.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to anon,authenticated,service_role;
grant execute on function auth.uid() to authenticated,service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant select on tables to authenticated;
\ir ../supabase/migrations/202609240000_base_profiles.sql
\ir ../supabase/migrations/202609250001_simulation.sql
\ir ../supabase/migrations/202609260001_trusted_profile_roles.sql
insert into auth.users(id,raw_user_meta_data,raw_app_meta_data) values
('00000000-0000-4000-8000-000000000001','{"role":"manager"}','{}'),
('00000000-0000-4000-8000-000000000002','{}','{}'),
('00000000-0000-4000-8000-000000000003','{}','{"role":"manager"}'),
('00000000-0000-4000-8000-000000000004','{}','{"role":"manager"}');
do $$ begin
 if (select role from profiles where id='00000000-0000-4000-8000-000000000001')<>'student' then raise exception 'Metadata role escalation';end if;
end $$;
insert into simulation_scenarios(id,owner_id,draft_config) values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','{"title":"private"}');
select simulation_publish('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003') as version_id \gset
insert into simulation_sessions(id,learner_id,scenario_version_id,conversation_model,module_number) values
('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',:'version_id','test',1);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$ begin
 if(select count(*) from simulation_sessions)<>1 then raise exception 'Owner cannot read session';end if;
 begin perform * from simulation_versions;raise exception 'Private configs exposed';exception when insufficient_privilege then null;end;
 begin update simulation_sessions set status='completed';raise exception 'Student can mutate session';exception when insufficient_privilege then null;end;
 begin perform simulation_claim('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',false);raise exception 'Student can claim lease';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$ begin if(select count(*) from simulation_sessions)<>0 then raise exception 'Other learner can read';end if;end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $$ begin if(select count(*) from simulation_sessions)<>1 then raise exception 'Owning manager cannot read';end if;end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
do $$ begin if(select count(*) from simulation_sessions)<>0 then raise exception 'Unrelated manager can read';end if;end $$;
reset role;
set role service_role;
do $$ begin
 if not simulation_claim('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',false) then raise exception 'Cannot claim';end if;
 if simulation_claim('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',false) then raise exception 'Double claim';end if;
 perform simulation_commit_turn('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Question','Réponse','test');
 if(select count(*) from simulation_turns)<>2 then raise exception 'Paired turns lost';end if;
 if not simulation_claim('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003',true) then raise exception 'Cannot evaluate';end if;
 perform simulation_commit_evaluation('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','{"skills":[]}','test','test-v1');
 if simulation_claim('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004',true) then raise exception 'Completed evaluation can be claimed again';end if;
 begin update simulation_versions set config='{}';raise exception 'Versions mutable';exception when raise_exception then if sqlerrm='Versions mutable' then raise;end if;end;
end $$;
reset role;
select 'PASS: role escalation, private configs, read isolation, mutation grants, paired commit, exclusive lease, final evaluation, immutable versions' as result;
