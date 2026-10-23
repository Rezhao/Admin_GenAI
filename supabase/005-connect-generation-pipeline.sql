-- Run as database owner in the existing Melon project AFTER 004-generation-admin.sql.
-- RLS stays enabled. Imports existing saved posts; never invents historic token/latency data.
begin;
alter table public.generation_requests add column if not exists community_id uuid references public.communities(id) on delete set null;
alter table public.generation_requests add column if not exists source text not null default 'live' check(source in ('live','saved_post','media_backfill'));
alter table public.generation_requests add column if not exists execution_plan jsonb;
alter table public.llm_responses add column if not exists source text not null default 'live' check(source in ('live','saved_caption'));
alter table public.ai_generations add column if not exists generation_request_id uuid references public.generation_requests(id) on delete set null;
create unique index if not exists post_request_unique on public.ai_generations(generation_request_id) where generation_request_id is not null;
create unique index if not exists response_step_unique on public.llm_responses(generation_request_id,prompt_chain_step_id) where prompt_chain_step_id is not null;

-- Real configuration matching Melon's existing caption generator, not demonstration data.
-- Stable IDs make reruns preserve any subsequent admin edits.
insert into public.llm_providers(id,name,base_url) values('d6100000-0000-4000-8000-000000000001','Google Gemini','https://generativelanguage.googleapis.com/v1beta') on conflict(id) do nothing;
insert into public.llm_models(id,provider_id,name,model_key) values('d6200000-0000-4000-8000-000000000001','d6100000-0000-4000-8000-000000000001','Gemini Flash Lite','gemini-flash-lite-latest') on conflict(id) do nothing;
insert into public.prompt_chains(id,name,description) values('d6300000-0000-4000-8000-000000000001','Melon image captions','The production image-caption pipeline. The user supplies an image and caption direction.') on conflict(id) do nothing;
insert into public.prompt_chain_steps(id,prompt_chain_id,step_order,name,system_prompt,user_prompt,llm_model_id,temperature)
values('d6400000-0000-4000-8000-000000000001','d6300000-0000-4000-8000-000000000001',1,'Generate caption',
'Return only one complete sentence between 8 and 20 words. Do not use bullets, labels, quotation marks, emojis, or markdown. Finish the sentence before stopping.',
'{{prompt}}','d6200000-0000-4000-8000-000000000001',0.7) on conflict(id) do nothing;
insert into public.prompt_chain_mix(prompt_chain_id) values('d6300000-0000-4000-8000-000000000001') on conflict(prompt_chain_id) do nothing;

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
      'model_id',model.id,'model_key',model.model_key,'temperature',s.temperature) order by s.step_order,s.id)
    into plan from public.prompt_chain_steps s join public.llm_models model on model.id=s.llm_model_id where s.prompt_chain_id=chain;
  insert into public.generation_requests(user_id,community_id,prompt_chain_id,prompt,status,source,execution_plan)
    values(auth.uid(),target_community,chain,btrim(caption_prompt),'processing','live',plan) returning id into request_id;
  return jsonb_build_object('request_id',request_id,'chain_id',chain,'steps',plan);
end;
$$;
create or replace function public.record_caption_response(target_request uuid, target_step uuid, output_text text, input_token_count integer, output_token_count integer, elapsed_ms integer)
returns void language plpgsql security definer set search_path='' as $$
declare request public.generation_requests; step jsonb; position integer;
begin
  select * into request from public.generation_requests where id=target_request and user_id=auth.uid() and source='live' for update;
  if not found or request.status <> 'processing' then raise exception 'Active request not found' using errcode='42501'; end if;
  if output_text is null or length(btrim(output_text)) not between 1 and 20000
    or input_token_count < 0 or output_token_count < 0 or elapsed_ms is null or elapsed_ms not between 0 and 3600000 then raise exception 'Invalid generation response'; end if;
  select count(*) into position from public.llm_responses where generation_request_id=target_request;
  step := request.execution_plan->position;
  if step is null or (step->>'id')::uuid is distinct from target_step then raise exception 'Unexpected or repeated chain step'; end if;
  insert into public.llm_responses(generation_request_id,prompt_chain_step_id,llm_model_id,response_text,input_tokens,output_tokens,latency_ms,source)
    values(target_request,target_step,(step->>'model_id')::uuid,btrim(output_text),input_token_count,output_token_count,elapsed_ms,'live');
end;
$$;
create or replace function public.fail_caption_request(target_request uuid, failure_message text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  update public.generation_requests set status='failed',error_message=left(coalesce(failure_message,'Generation failed.'),2000),completed_at=now()
    where id=target_request and user_id=auth.uid() and source='live' and status='processing';
  if not found then raise exception 'Active request not found' using errcode='42501'; end if;
end;
$$;

-- Older clients and manual admin uploads still receive honest saved-post history.
-- They do not receive fabricated model IDs, token counts, latency, or chain assignments.
create or replace function public.track_caption_post()
returns trigger language plpgsql security definer set search_path='' as $$
declare request public.generation_requests; saved_caption text; response_count integer;
begin
  if new.generation_request_id is null then
    insert into public.generation_requests(user_id,community_id,prompt,status,source,created_at,completed_at)
      values(new.user_id,new.community_id,new.prompt,'completed','saved_post',coalesce(new.created_at,now()),coalesce(new.created_at,now())) returning * into request;
    insert into public.llm_responses(generation_request_id,response_text,source,created_at)
      values(request.id,new.caption,'saved_caption',coalesce(new.created_at,now()));
    new.generation_request_id := request.id;
  else
    select * into request from public.generation_requests where id=new.generation_request_id for update;
    if not found or request.user_id is distinct from new.user_id or request.source <> 'live' or request.status <> 'processing'
      or request.community_id is distinct from new.community_id or request.prompt is distinct from new.prompt then raise exception 'Invalid generation request' using errcode='42501'; end if;
    select count(*) into response_count from public.llm_responses where generation_request_id=request.id;
    select response_text into saved_caption from public.llm_responses where generation_request_id=request.id
      and prompt_chain_step_id=(request.execution_plan->-1->>'id')::uuid;
    if response_count <> jsonb_array_length(request.execution_plan) or saved_caption is null or saved_caption is distinct from new.caption then raise exception 'Chain has not completed'; end if;
  end if;
  return new;
end;
$$;
create or replace function public.link_caption_post()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.generation_requests set generation_id=new.id,status='completed',completed_at=now() where id=new.generation_request_id;
  return new;
end;
$$;
drop trigger if exists track_caption_post on public.ai_generations;
create trigger track_caption_post before insert on public.ai_generations for each row execute function public.track_caption_post();
drop trigger if exists link_caption_post on public.ai_generations;
create trigger link_caption_post after insert on public.ai_generations for each row execute function public.link_caption_post();

create or replace function public.finish_caption_request(target_request uuid, uploaded_path text)
returns uuid language plpgsql security definer set search_path='' as $$
declare request public.generation_requests; output_text text; new_post uuid;
begin
  select * into request from public.generation_requests where id=target_request and user_id=auth.uid() and source='live' for update;
  if not found then raise exception 'Request not found' using errcode='42501'; end if;
  if request.status='completed' and request.generation_id is not null then return request.generation_id; end if;
  if request.status <> 'processing' then raise exception 'Request is no longer active'; end if;
  if request.community_id is null then
    if not public.admin_is_authorized() then raise exception 'Community required' using errcode='42501'; end if;
  elsif not public.belongs_to_community(request.community_id) and not public.admin_is_authorized() then raise exception 'Community membership required' using errcode='42501'; end if;
  if uploaded_path is null or uploaded_path not like auth.uid()::text || '/%' or uploaded_path like '%..%'
    or not exists(select 1 from storage.objects where bucket_id='generated-media' and name=uploaded_path) then raise exception 'Invalid uploaded image'; end if;
  select response_text into output_text from public.llm_responses where generation_request_id=target_request and prompt_chain_step_id=(request.execution_plan->-1->>'id')::uuid;
  if output_text is null then raise exception 'Caption has not completed'; end if;
  insert into public.ai_generations(user_id,community_id,image_path,prompt,caption,generation_request_id)
    values(auth.uid(),request.community_id,uploaded_path,request.prompt,output_text,request.id) returning id into new_post;
  return new_post;
end;
$$;
-- This locks the same row as finalization, so recovery waits for a possibly committed RPC.
create or replace function public.caption_request_state(target_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare request public.generation_requests;
begin
  select * into request from public.generation_requests where id=target_request and user_id=auth.uid() for update;
  if not found then raise exception 'Request not found' using errcode='42501'; end if;
  return jsonb_build_object('status',request.status,'generation_id',request.generation_id);
end;
$$;

-- Ordinary profile/post editors cannot relink a post to another user's request.
create or replace function public.guard_caption_request_link()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.generation_request_id is distinct from old.generation_request_id and current_user not in ('postgres','supabase_admin','service_role') then
    raise exception 'Generation request links are immutable' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_caption_request_link on public.ai_generations;
create trigger guard_caption_request_link before update on public.ai_generations for each row execute function public.guard_caption_request_link();
revoke all on function public.guard_caption_request_link() from public,anon,authenticated;

-- Backfill the two recent posts and every older saved post without duplicating records.
insert into public.generation_requests(user_id,community_id,generation_id,prompt,status,source,created_at,completed_at)
select g.user_id,g.community_id,g.id,g.prompt,'completed','media_backfill',g.created_at,g.created_at from public.ai_generations g
where not exists(select 1 from public.generation_requests r where r.generation_id=g.id);
insert into public.llm_responses(generation_request_id,response_text,source,created_at)
select r.id,g.caption,'saved_caption',g.created_at from public.generation_requests r join public.ai_generations g on g.id=r.generation_id
where r.source='media_backfill' and not exists(select 1 from public.llm_responses l where l.generation_request_id=r.id);
update public.ai_generations g set generation_request_id=r.id from public.generation_requests r where r.generation_id=g.id and g.generation_request_id is null;

revoke all on function public.begin_caption_request(text,uuid),public.record_caption_response(uuid,uuid,text,integer,integer,integer),public.fail_caption_request(uuid,text),public.finish_caption_request(uuid,text),public.caption_request_state(uuid),public.track_caption_post(),public.link_caption_post() from public,anon,authenticated;
grant execute on function public.begin_caption_request(text,uuid),public.record_caption_response(uuid,uuid,text,integer,integer,integer),public.fail_caption_request(uuid,text),public.finish_caption_request(uuid,text),public.caption_request_state(uuid) to authenticated;
create or replace function public.admin_catalog_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_assert_access();
  return jsonb_build_object('chains',(select count(*) from public.prompt_chains),'terms',(select count(*) from public.terms),
    'examples',(select count(*) from public.ai_generation_examples),'images',(select count(*) from public.images),'post_images',(select count(distinct image_path) from public.ai_generations),
    'live_requests',(select count(*) from public.generation_requests where source='live'),'imported_requests',(select count(*) from public.generation_requests where source<>'live'),
    'requests',(select count(*) from public.generation_requests),'failed',(select count(*) from public.generation_requests where status='failed'),
    'responses',(select count(*) from public.llm_responses),'tokens',(select coalesce(sum(coalesce(input_tokens,0)::bigint+coalesce(output_tokens,0)),0) from public.llm_responses),
    'mean_latency_ms',(select round(avg(latency_ms)) from public.llm_responses),
    'mix',(select coalesce(jsonb_agg(r),'[]') from (select c.name,m.weight,m.enabled from public.prompt_chain_mix m join public.prompt_chains c on c.id=m.prompt_chain_id order by c.name) r));
end;
$$;

notify pgrst,'reload schema';
commit;
