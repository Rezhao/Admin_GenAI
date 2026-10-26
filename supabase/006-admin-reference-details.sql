-- Run AFTER 005 in Melon's SQL Editor as database owner. Keep RLS enabled.
-- Adds reference vocabulary, audit metadata, and guarded relational inspectors.
begin;
create table if not exists public.term_types (
 id uuid primary key default gen_random_uuid(), name text not null unique check(length(btrim(name)) between 1 and 200),
 description text not null default '' check(length(description)<=10000), created_at timestamptz not null default now()
);
alter table public.term_types enable row level security;
revoke all on public.term_types from public,anon,authenticated;
alter table public.terms add column if not exists term_type_id uuid references public.term_types(id);
alter table public.terms add column if not exists usage_example text check(length(usage_example)<=10000);
alter table public.terms add column if not exists priority integer not null default 0 check(priority between 0 and 100);
alter table public.llm_models add column if not exists temperature_supported boolean not null default true;
alter table public.llm_responses add column if not exists submitted_prompt text check(length(submitted_prompt)<=100000);
-- Definitions are reference data, not fabricated generation history.
insert into public.term_types(id,name,description) values
 ('d6500000-0000-4000-8000-000000000001','Noun','Names a person, place, thing, or concept.'),
 ('d6500000-0000-4000-8000-000000000002','Verb','Describes an action or state.'),
 ('d6500000-0000-4000-8000-000000000003','Adjective','Describes a quality.'),
 ('d6500000-0000-4000-8000-000000000004','Expression','A phrase used in conversation.') on conflict do nothing;
insert into public.terms(id,term,definition,term_type_id,usage_example,priority,category) values
 ('d6600000-0000-4000-8000-000000000001','study break','A short pause from studying to rest or do something enjoyable.','d6500000-0000-4000-8000-000000000001','My five-minute study break somehow became a campus food tour.',50,'Campus life'),
 ('d6600000-0000-4000-8000-000000000002','main character energy','Acting with the confidence of the central character in a story.','d6500000-0000-4000-8000-000000000004','Walking into an empty lecture hall with main character energy.',40,'Caption vocabulary') on conflict(id) do nothing;
-- An optional real three-step workflow, initially excluded from selection.
-- Enabling its mix entry makes Melon run all three steps and log actual outputs.
do $$ declare inserted uuid; begin
insert into public.prompt_chains(id,name,description) values
 ('d6300000-0000-4000-8000-000000000002','Melon campus storyteller','Observe visible image details, develop a caption angle, then write a concise caption. Initially disabled in the mix; enable when ready to use it.') on conflict(id) do nothing returning id into inserted;
if inserted is not null then update public.prompt_chain_mix set enabled=false,weight=0 where prompt_chain_id=inserted; end if;
end $$;
insert into public.prompt_chain_steps(id,prompt_chain_id,step_order,name,system_prompt,user_prompt,llm_model_id,temperature) values
 ('d6400000-0000-4000-8000-000000000002','d6300000-0000-4000-8000-000000000002',1,'Observe image','Describe only visible details. Do not identify people or invent personal information. Return three short factual observations.','Image observations relevant to this caption direction: {{prompt}}','d6200000-0000-4000-8000-000000000001',0.3),
 ('d6400000-0000-4000-8000-000000000003','d6300000-0000-4000-8000-000000000002',2,'Develop caption angle','Create one playful, friendly caption angle grounded in the supplied observations. Avoid harassment and invented facts. Keep the brief under 60 words.','Caption direction: {{prompt}}. Image observations: {{previous_response}}','d6200000-0000-4000-8000-000000000001',0.7),
 ('d6400000-0000-4000-8000-000000000004','d6300000-0000-4000-8000-000000000002',3,'Write final caption','Return only one complete sentence between 8 and 20 words. Do not use bullets, labels, quotation marks, emojis, or markdown. Finish the sentence before stopping.','Write the caption using this brief: {{previous_response}}. Original direction: {{prompt}}','d6200000-0000-4000-8000-000000000001',0.7) on conflict(id) do nothing;
-- Replace only a just-created default entry. A marker keeps reruns from resetting admin edits.

insert into public.ai_generation_examples(id,prompt,caption,prompt_chain_id,term_id) values
 ('d6700000-0000-4000-8000-000000000001','A friendly caption about taking a study break with friends on campus.','Our five-minute study break has officially become the best part of the afternoon.','d6300000-0000-4000-8000-000000000002','d6600000-0000-4000-8000-000000000001') on conflict(id) do nothing;

-- Older rows keep unknown actor IDs. Never attribute historic edits to a new admin.
do $$ declare t text; begin
 foreach t in array array['term_types','terms','ai_generation_examples','llm_models','llm_providers','images','allowed_signup_domains','whitelisted_emails','prompt_chains','prompt_chain_steps','prompt_chain_mix'] loop
  execute format('alter table public.%I add column if not exists created_by uuid references auth.users(id) on delete set null',t);
  execute format('alter table public.%I add column if not exists updated_by uuid references auth.users(id) on delete set null',t);
  execute format('alter table public.%I add column if not exists updated_at timestamptz',t);
 end loop;
end $$;
create or replace function public.admin_audit_record() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.created_by:=auth.uid();
 else new.created_by:=old.created_by; new.created_at:=old.created_at; new.updated_by:=auth.uid(); new.updated_at:=now(); end if;
 return new;
end $$;
revoke all on function public.admin_audit_record() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['term_types','terms','ai_generation_examples','llm_models','llm_providers','images','allowed_signup_domains','whitelisted_emails','prompt_chains','prompt_chain_steps','prompt_chain_mix'] loop
  execute format('drop trigger if exists admin_audit on public.%I',t);
  execute format('create trigger admin_audit before insert or update on public.%I for each row execute function public.admin_audit_record()',t);
 end loop;
end $$;
create or replace function public.admin_resource_spec(resource text)
returns jsonb language plpgsql immutable set search_path = '' as $$
begin
  return case resource
    when 'prompt-chains' then '{"table":"prompt_chains","mode":"read","fields":[]}'::jsonb
    when 'prompt-chain-steps' then '{"table":"prompt_chain_steps","mode":"read","fields":[]}'::jsonb
    when 'prompt-chain-mix' then '{"table":"prompt_chain_mix","mode":"update","fields":["weight","enabled"]}'::jsonb
    when 'term-types' then '{"table":"term_types","mode":"crud","fields":["name","description"]}'::jsonb
    when 'chain-runs' then '{"table":"generation_requests","mode":"read","fields":[]}'::jsonb
    when 'terms' then '{"table":"terms","mode":"crud","fields":["term","definition","category","term_type_id","usage_example","priority","enabled"]}'::jsonb
    when 'examples' then '{"table":"ai_generation_examples","mode":"crud","fields":["prompt","caption","image_id","prompt_chain_id","term_id"]}'::jsonb
    when 'models' then '{"table":"llm_models","mode":"crud","fields":["provider_id","name","model_key","context_window","temperature_supported","enabled"]}'::jsonb
    when 'providers' then '{"table":"llm_providers","mode":"crud","fields":["name","base_url","enabled"]}'::jsonb
    when 'signup-domains' then '{"table":"allowed_signup_domains","mode":"crud","fields":["domain","enabled","notes"]}'::jsonb
    when 'whitelisted-emails' then '{"table":"whitelisted_emails","mode":"crud","fields":["email","enabled","notes"]}'::jsonb
    when 'generation-requests' then '{"table":"generation_requests","mode":"read","fields":[]}'::jsonb
    when 'llm-responses' then '{"table":"llm_responses","mode":"read","fields":[]}'::jsonb
    when 'images' then '{"table":"images","mode":"crud","fields":["name","alt_text","storage_path","mime_type"]}'::jsonb
    else null end;
end;
$$;

create or replace function public.admin_catalog_list(resource text, search_text text default '', page_number integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare spec jsonb; records jsonb; total bigint; predicate text;
begin
  perform public.admin_assert_access();
  spec := public.admin_resource_spec(resource);
  if spec is null then raise exception 'Unknown resource'; end if;
  predicate := case when resource='chain-runs' then ' and t.execution_plan is not null' else '' end;
  if page_number is null or page_number not between 1 and 100000 or search_text is null or length(search_text) > 200 then raise exception 'Invalid search or page'; end if;
  execute format('select count(*) from public.%I t where strpos(lower(to_jsonb(t)::text), lower($1)) > 0%s', spec->>'table',predicate) into total using search_text;
  execute format('select coalesce(jsonb_agg(r), ''[]''::jsonb) from (select t.*, public.admin_reference_labels(to_jsonb(t)) as reference_labels from public.%I t where strpos(lower(to_jsonb(t)::text), lower($1)) > 0%s order by created_at desc, id limit 25 offset $2) r', spec->>'table',predicate)
    into records using search_text, (page_number - 1)*25;
  return jsonb_build_object('items',records,'total',total,'page',page_number,'page_size',25);
end;
$$;
create or replace function public.admin_catalog_get(resource text, target uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare spec jsonb; result jsonb;
begin
  perform public.admin_assert_access();
  spec := public.admin_resource_spec(resource);
  if spec is null then raise exception 'Unknown resource'; end if;
  execute format('select to_jsonb(t) from public.%I t where id = $1%s', spec->>'table',case when resource='chain-runs' then ' and execution_plan is not null' else '' end) into result using target;
  return result;
end;
$$;
create or replace function public.admin_catalog_options(resource text, search_text text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare spec jsonb; result jsonb; label_col text;
begin
  perform public.admin_assert_access();
  spec := public.admin_resource_spec(resource);
  label_col := case resource when 'term-types' then 'name' when 'providers' then 'name' when 'models' then 'name' when 'prompt-chains' then 'name' when 'terms' then 'term' when 'images' then 'name' else null end;
  if label_col is null or search_text is null or length(search_text) > 200 then raise exception 'Invalid relation lookup'; end if;
  execute format('select coalesce(jsonb_agg(r), ''[]''::jsonb) from (select id, %I as label from public.%I t where strpos(lower(to_jsonb(t)::text),lower($1)) > 0 order by %I, id limit 50) r', label_col,spec->>'table',label_col) into result using search_text;
  return result;
end;
$$;

-- A separate endpoint logs exactly the combined text sent by the server. The old
-- response endpoint remains available during rollout; snapshots cover older runs.
create or replace function public.record_caption_response_details(target_request uuid,target_step uuid,output_text text,input_token_count integer,output_token_count integer,elapsed_ms integer,sent_prompt text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if sent_prompt is null or length(sent_prompt) not between 1 and 100000 then raise exception 'Invalid submitted prompt'; end if;
 perform public.record_caption_response(target_request,target_step,output_text,input_token_count,output_token_count,elapsed_ms);
 update public.llm_responses set submitted_prompt=sent_prompt where generation_request_id=target_request and prompt_chain_step_id=target_step;
end $$;
revoke all on function public.record_caption_response_details(uuid,uuid,text,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function public.record_caption_response_details(uuid,uuid,text,integer,integer,integer,text) to authenticated;

-- Compact human labels. All helpers are internal and run only after access checks.
create or replace function public.admin_reference_labels(row_data jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='{}'; key text; label text; identifier uuid;
begin
 foreach key in array array['user_id','created_by','updated_by','provider_id','llm_model_id','prompt_chain_id','term_type_id','term_id','image_id','community_id'] loop
  if row_data->>key is null then continue; end if;
  identifier:=(row_data->>key)::uuid; label:=null;
  case key
   when 'provider_id' then select name into label from public.llm_providers where id=identifier;
   when 'llm_model_id' then select name into label from public.llm_models where id=identifier;
   when 'prompt_chain_id' then select name into label from public.prompt_chains where id=identifier;
   when 'term_type_id' then select name into label from public.term_types where id=identifier;
   when 'term_id' then select term into label from public.terms where id=identifier;
   when 'image_id' then select name into label from public.images where id=identifier;
   when 'community_id' then select name into label from public.communities where id=identifier;
   else select coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),p.email) into label from public.profiles p where p.id=identifier limit 1;
  end case;
  if label is not null then result:=result||jsonb_build_object(key,label); end if;
 end loop;
 return result;
end $$;
revoke all on function public.admin_reference_labels(jsonb) from public,anon,authenticated;

create or replace function public.admin_record_context(resource text,target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare record jsonb; result jsonb; request public.generation_requests; chain_id uuid; response_request uuid;
begin
 perform public.admin_assert_access();
 record:=public.admin_catalog_get(resource,target);
 if record is null then return null; end if;
 result:=jsonb_build_object('labels',public.admin_reference_labels(record));
 if resource='prompt-chains' then chain_id:=target;
 elsif resource in ('prompt-chain-steps','prompt-chain-mix') then chain_id:=(record->>'prompt_chain_id')::uuid;
 end if;
 if chain_id is not null then
  result:=result||jsonb_build_object('chain',(select to_jsonb(c) from public.prompt_chains c where id=chain_id),
   'steps',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('model_name',m.name,'model_key',m.model_key,'temperature_supported',m.temperature_supported,'input_type','image and text','output_type','text','step_type','caption generation') order by s.step_order)
    from public.prompt_chain_steps s left join public.llm_models m on m.id=s.llm_model_id where s.prompt_chain_id=chain_id),'[]'),
   'runs',coalesce((select jsonb_agg(r) from (select id,status,created_at,generation_id from public.generation_requests where prompt_chain_id=chain_id and execution_plan is not null order by created_at desc,id limit 25) r),'[]'),
   'run_count',(select count(*) from public.generation_requests where prompt_chain_id=chain_id and execution_plan is not null),
   'mix',(select to_jsonb(m) from public.prompt_chain_mix m where prompt_chain_id=chain_id));
 end if;
 if resource in ('generation-requests','chain-runs','llm-responses') then
  response_request:=case when resource='llm-responses' then (record->>'generation_request_id')::uuid else target end;
  select * into request from public.generation_requests where id=response_request;
  result:=result||jsonb_build_object('request',to_jsonb(request),'request_labels',public.admin_reference_labels(to_jsonb(request)),
   'profile',(select jsonb_build_object('id',p.id,'email',p.email,'name',btrim(concat_ws(' ',p.first_name,p.last_name))) from public.profiles p where id=request.user_id limit 1),
   'media',(select to_jsonb(g) from public.ai_generations g where id=request.generation_id),
   'responses',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('model_name',m.name,'model_key',m.model_key,'step_snapshot',
     (select s from jsonb_array_elements(request.execution_plan) s where s->>'id'=r.prompt_chain_step_id::text limit 1)) order by r.created_at,r.id)
    from public.llm_responses r left join public.llm_models m on m.id=r.llm_model_id where r.generation_request_id=response_request),'[]'));
 end if;
 return result;
end $$;
revoke all on function public.admin_record_context(text,uuid) from public,anon,authenticated;
grant execute on function public.admin_record_context(text,uuid) to authenticated;
create or replace function public.begin_caption_request(caption_prompt text, target_community uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare chain uuid; plan jsonb; request_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to generate a caption' using errcode='42501'; end if;
  if caption_prompt is null or length(btrim(caption_prompt)) not between 5 and 2000 then raise exception 'Invalid caption prompt'; end if;
  if target_community is null then
    if not public.admin_is_authorized() then raise exception 'Choose a community' using errcode='42501'; end if;
  elsif not public.belongs_to_community(target_community) and not public.admin_is_authorized() then
    raise exception 'Community membership required' using errcode='42501';
  end if;
  -- Serialize per-user admission; stale operations are visibly marked as timed out.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  update public.generation_requests set status='failed',error_message='Generation timed out before completion.',completed_at=now()
    where user_id=auth.uid() and source='live' and status='processing' and created_at < now()-interval '15 minutes';
  if (select count(*) from public.generation_requests where user_id=auth.uid() and source='live' and status='processing') >= 5 then raise exception 'Too many generations in progress. Try again shortly.'; end if;
  -- A relative-weight draw among active chains whose complete step list is executable.
  select m.prompt_chain_id into chain from public.prompt_chain_mix m
    where m.enabled and m.weight>0 and (select count(*) from public.prompt_chain_steps where prompt_chain_id=m.prompt_chain_id) between 1 and 5
    and not exists(select 1 from public.prompt_chain_steps s left join public.llm_models model on model.id=s.llm_model_id
      left join public.llm_providers provider on provider.id=model.provider_id where s.prompt_chain_id=m.prompt_chain_id
      and (model.id is null or not model.enabled or not provider.enabled
        or provider.base_url is distinct from 'https://generativelanguage.googleapis.com/v1beta'
        or model.model_key !~ '^[a-zA-Z0-9._-]+$'))
    order by -ln(greatest(random(),0.000000000001))/m.weight limit 1;
  if chain is null then raise exception 'No active Gemini caption chain. Ask an admin to check chain weights and enabled models/providers.'; end if;
  select jsonb_agg(jsonb_build_object('id',s.id,'order',s.step_order,'system_prompt',s.system_prompt,'user_prompt',s.user_prompt,
      'model_id',model.id,'model_key',model.model_key,'temperature',s.temperature,'temperature_supported',model.temperature_supported) order by s.step_order,s.id)
    into plan from public.prompt_chain_steps s join public.llm_models model on model.id=s.llm_model_id where s.prompt_chain_id=chain;
  insert into public.generation_requests(user_id,community_id,prompt_chain_id,prompt,status,source,execution_plan)
    values(auth.uid(),target_community,chain,btrim(caption_prompt),'processing','live',plan) returning id into request_id;
  return jsonb_build_object('request_id',request_id,'chain_id',chain,'steps',plan);
end;
$$;

-- Signup policy is enforced by Supabase Auth, not by browser-side checks.
-- After applying this migration: Authentication > Hooks > Before User Created >
-- Postgres function public.melon_before_user_created. Save/enable the hook.
-- This hook never runs for an existing user's sign-in. Empty lists fail closed.
insert into public.allowed_signup_domains(domain,notes) values('columbia.edu','Initial campus signup domain. Admins can add domains or exact email exceptions.') on conflict(domain) do nothing;
create or replace function public.melon_before_user_created(event jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare signup_email text:=lower(btrim(event->'user'->>'email')); signup_domain text;
begin
 signup_domain:=split_part(signup_email,'@',2);
 if signup_email is not null and signup_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' and (
   exists(select 1 from public.allowed_signup_domains d where d.enabled and d.domain=signup_domain)
   or exists(select 1 from public.whitelisted_emails w where w.enabled and w.email=signup_email)
 ) then return '{}'::jsonb; end if;
 return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','New Melon accounts require an approved email domain or email address.'));
end $$;
revoke all on function public.melon_before_user_created(jsonb) from public,anon,authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.melon_before_user_created(jsonb) to supabase_auth_admin;
grant select on public.allowed_signup_domains,public.whitelisted_emails to supabase_auth_admin;
drop policy if exists auth_hook_domains on public.allowed_signup_domains;
create policy auth_hook_domains on public.allowed_signup_domains for select to supabase_auth_admin using(true);
drop policy if exists auth_hook_emails on public.whitelisted_emails;
create policy auth_hook_emails on public.whitelisted_emails for select to supabase_auth_admin using(true);
notify pgrst,'reload schema';
commit;
