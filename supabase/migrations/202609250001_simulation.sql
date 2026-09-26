-- Additive migration; apply with your Supabase migration workflow.
create table public.simulation_scenarios (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 draft_config jsonb not null, published_version_id uuid, created_at timestamptz not null default now()
);
create table public.simulation_versions (
 id uuid primary key default gen_random_uuid(), scenario_id uuid not null references public.simulation_scenarios(id),
 config jsonb not null, created_at timestamptz not null default now()
);
alter table public.simulation_scenarios add constraint simulation_published_version_fk foreign key (published_version_id) references public.simulation_versions(id);
create table public.simulation_sessions (
 id uuid primary key default gen_random_uuid(), learner_id uuid not null references auth.users(id),
 scenario_version_id uuid not null references public.simulation_versions(id), conversation_model text not null, module_number integer not null check(module_number>0),
 status text not null default 'active' check(status in ('active','evaluating','completed','evaluation_failed')),
 lease_token uuid, lease_until timestamptz, created_at timestamptz not null default now(), completed_at timestamptz
);
create table public.simulation_turns (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.simulation_sessions(id),
 role text not null check(role in ('user','assistant')), content text not null, model text, request_id uuid not null,
 created_at timestamptz not null default clock_timestamp(), unique(session_id,request_id,role)
);
create table public.simulation_evaluations (
 session_id uuid primary key references public.simulation_sessions(id), report jsonb not null, model text not null,
 prompt_version text not null default 'unversioned',
 created_at timestamptz not null default now()
);
create index simulation_sessions_learner on public.simulation_sessions(learner_id,created_at desc);
create index simulation_turns_session on public.simulation_turns(session_id,created_at);
-- Configurations contain hidden persona facts and are never readable through authenticated REST.
alter table public.simulation_scenarios enable row level security;
alter table public.simulation_versions enable row level security;
alter table public.simulation_sessions enable row level security;
alter table public.simulation_turns enable row level security;
alter table public.simulation_evaluations enable row level security;
create function public.simulation_can_read(sid uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from simulation_sessions s join simulation_versions v on v.id=s.scenario_version_id join simulation_scenarios c on c.id=v.scenario_id where s.id=sid and (s.learner_id=auth.uid() or (c.owner_id=auth.uid() and exists(select 1 from profiles p where p.id=auth.uid() and p.role='manager'))));
$$;
create policy simulation_sessions_read on public.simulation_sessions for select to authenticated using(public.simulation_can_read(id));
create policy simulation_turns_read on public.simulation_turns for select to authenticated using(public.simulation_can_read(session_id));
create policy simulation_evaluations_read on public.simulation_evaluations for select to authenticated using(public.simulation_can_read(session_id));
-- All mutations use the server service role. No student writes, including scores.
revoke all on public.simulation_scenarios,public.simulation_versions,public.simulation_sessions,public.simulation_turns,public.simulation_evaluations from anon,authenticated;
grant select on public.simulation_sessions,public.simulation_turns,public.simulation_evaluations to authenticated;
grant all on public.simulation_scenarios,public.simulation_versions,public.simulation_sessions,public.simulation_turns,public.simulation_evaluations to service_role;
create function public.simulation_immutable_version() returns trigger language plpgsql as $$ begin raise exception 'Published scenario versions are immutable'; end; $$;
create trigger simulation_version_immutable before update or delete on public.simulation_versions for each row execute function public.simulation_immutable_version();
-- Publication is transactional, so a learner always gets a complete snapshot.
create function public.simulation_publish(scenario uuid, manager uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare config_data jsonb; version_id uuid;
begin
 select draft_config into config_data from simulation_scenarios where id=scenario and owner_id=manager for update;
 if config_data is null or not exists(select 1 from profiles where id=manager and role='manager') then raise exception 'Forbidden'; end if;
 insert into simulation_versions(scenario_id,config) values(scenario,config_data) returning id into version_id;
 update simulation_scenarios set published_version_id=version_id where id=scenario;
 return version_id;
end; $$;
-- Lease token fences old workers after expiry; history/evaluation commit atomically.
create function public.simulation_claim(sid uuid, token uuid, evaluating boolean) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update simulation_sessions set lease_token=token,lease_until=now()+interval '180 seconds',status=case when evaluating then 'evaluating' else 'active' end
 where id=sid and status<>'completed' and (lease_until is null or lease_until<now()) and (evaluating or status='active');
 return found;
end; $$;
create function public.simulation_commit_turn(sid uuid, token uuid, rid uuid, user_text text, assistant_text text, assistant_model text) returns uuid language plpgsql security definer set search_path=public as $$
declare turn_id uuid;
begin
 perform 1 from simulation_sessions where id=sid and lease_token=token and lease_until>now() and status='active' for update;
 if not found then raise exception 'Lease expired'; end if;
 insert into simulation_turns(session_id,role,content,request_id) values(sid,'user',user_text,rid);
 insert into simulation_turns(session_id,role,content,request_id,model) values(sid,'assistant',assistant_text,rid,assistant_model) returning id into turn_id;
 update simulation_sessions set lease_token=null,lease_until=null where id=sid;
 return turn_id;
end; $$;
create function public.simulation_commit_evaluation(sid uuid, token uuid, result jsonb, judge_model text, judge_prompt_version text) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from simulation_sessions where id=sid and lease_token=token and lease_until>now() and status='evaluating' for update;
 if not found then raise exception 'Lease expired'; end if;
 insert into simulation_evaluations(session_id,report,model,prompt_version) values(sid,result,judge_model,judge_prompt_version);
 update simulation_sessions set status='completed',completed_at=now(),lease_token=null,lease_until=null where id=sid;
end; $$;
revoke all on function public.simulation_publish(uuid,uuid),public.simulation_claim(uuid,uuid,boolean),public.simulation_commit_turn(uuid,uuid,uuid,text,text,text),public.simulation_commit_evaluation(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.simulation_publish(uuid,uuid),public.simulation_claim(uuid,uuid,boolean),public.simulation_commit_turn(uuid,uuid,uuid,text,text,text),public.simulation_commit_evaluation(uuid,uuid,jsonb,text,text) to service_role;
revoke all on function public.simulation_can_read(uuid) from public,anon;
grant execute on function public.simulation_can_read(uuid) to authenticated;
