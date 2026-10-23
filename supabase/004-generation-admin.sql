-- Run as database owner in the SAME Melon Supabase project, after 001-admin.sql.
-- Adds supporting data without changing ai_generations or existing login rules.
begin;
create table if not exists public.llm_providers (
  id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 200),
  base_url text check(base_url is null or (length(base_url) <= 2000 and base_url ~ '^https://[^/@[:space:]]+(/[^[:space:]]*)?$')), enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.llm_models (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.llm_providers(id),
  name text not null check(length(btrim(name)) between 1 and 200), model_key text not null check(length(btrim(model_key)) between 1 and 200),
  context_window integer check(context_window > 0), enabled boolean not null default true, created_at timestamptz not null default now(),
  unique(provider_id, model_key)
);
create table if not exists public.prompt_chains (
  id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 200),
  description text not null default '' check(length(description) <= 10000), created_at timestamptz not null default now()
);
create table if not exists public.prompt_chain_steps (
  id uuid primary key default gen_random_uuid(), prompt_chain_id uuid not null references public.prompt_chains(id),
  step_order integer not null check(step_order >= 1), name text not null check(length(btrim(name)) between 1 and 200),
  system_prompt text not null default '', user_prompt text not null, llm_model_id uuid references public.llm_models(id),
  temperature numeric not null default 0.7 check(temperature between 0 and 2), created_at timestamptz not null default now(),
  unique(prompt_chain_id, step_order)
);
create table if not exists public.prompt_chain_mix (
  id uuid primary key default gen_random_uuid(), prompt_chain_id uuid not null unique references public.prompt_chains(id),
  weight numeric not null default 1 check(weight >= 0 and weight <= 1000000), enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create or replace function public.initialize_prompt_chain_mix()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.prompt_chain_mix(prompt_chain_id) values(new.id) on conflict(prompt_chain_id) do nothing;
  return new;
end;
$$;
revoke all on function public.initialize_prompt_chain_mix() from public,anon,authenticated;
drop trigger if exists initialize_prompt_chain_mix on public.prompt_chains;
create trigger initialize_prompt_chain_mix after insert on public.prompt_chains
for each row execute function public.initialize_prompt_chain_mix();
insert into public.prompt_chain_mix(prompt_chain_id) select id from public.prompt_chains on conflict(prompt_chain_id) do nothing;
create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(), term text not null check(length(btrim(term)) between 1 and 200),
  definition text not null check(length(btrim(definition)) between 1 and 10000), category text check(length(category) <= 200),
  enabled boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.images (
  id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 200),
  alt_text text not null default '' check(length(alt_text) <= 2000), storage_path text not null unique,
  mime_type text not null check(mime_type in ('image/png','image/jpeg','image/webp')),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.ai_generation_examples (
  id uuid primary key default gen_random_uuid(), prompt text not null check(length(btrim(prompt)) between 1 and 10000),
  caption text not null check(length(btrim(caption)) between 1 and 10000),
  image_id uuid references public.images(id), prompt_chain_id uuid references public.prompt_chains(id), term_id uuid references public.terms(id),
  created_at timestamptz not null default now()
);
create table if not exists public.generation_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id),
  generation_id uuid unique references public.ai_generations(id) on delete set null,
  prompt_chain_id uuid references public.prompt_chains(id), image_id uuid references public.images(id),
  prompt text not null, status text not null check(status in ('pending','processing','completed','failed')),
  error_message text, created_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists public.llm_responses (
  id uuid primary key default gen_random_uuid(), generation_request_id uuid not null references public.generation_requests(id),
  llm_model_id uuid references public.llm_models(id), prompt_chain_step_id uuid references public.prompt_chain_steps(id),
  response_text text not null, input_tokens integer check(input_tokens >= 0), output_tokens integer check(output_tokens >= 0),
  latency_ms integer check(latency_ms >= 0), created_at timestamptz not null default now()
);
create table if not exists public.allowed_signup_domains (
  id uuid primary key default gen_random_uuid(), domain text not null unique check(domain = lower(domain) and length(domain) <= 253 and domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$'),
  enabled boolean not null default true, notes text check(length(notes) <= 2000), created_at timestamptz not null default now()
);
create table if not exists public.whitelisted_emails (
  id uuid primary key default gen_random_uuid(), email text not null unique check(email = lower(email) and length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  enabled boolean not null default true, notes text check(length(notes) <= 2000), created_at timestamptz not null default now()
);
create index if not exists prompt_steps_model_idx on public.prompt_chain_steps(llm_model_id);
create index if not exists examples_chain_idx on public.ai_generation_examples(prompt_chain_id);
create index if not exists examples_term_idx on public.ai_generation_examples(term_id);
create index if not exists examples_image_idx on public.ai_generation_examples(image_id);
create index if not exists requests_created_idx on public.generation_requests(created_at desc);
create index if not exists responses_request_idx on public.llm_responses(generation_request_id);

-- Internal fixed allowlist. Never accept a caller-supplied table or column name.
create or replace function public.admin_resource_spec(resource text)
returns jsonb language plpgsql immutable set search_path = '' as $$
begin
  return case resource
    when 'prompt-chains' then '{"table":"prompt_chains","mode":"read","fields":[]}'::jsonb
    when 'prompt-chain-steps' then '{"table":"prompt_chain_steps","mode":"read","fields":[]}'::jsonb
    when 'prompt-chain-mix' then '{"table":"prompt_chain_mix","mode":"update","fields":["weight","enabled"]}'::jsonb
    when 'terms' then '{"table":"terms","mode":"crud","fields":["term","definition","category","enabled"]}'::jsonb
    when 'examples' then '{"table":"ai_generation_examples","mode":"crud","fields":["prompt","caption","image_id","prompt_chain_id","term_id"]}'::jsonb
    when 'models' then '{"table":"llm_models","mode":"crud","fields":["provider_id","name","model_key","context_window","enabled"]}'::jsonb
    when 'providers' then '{"table":"llm_providers","mode":"crud","fields":["name","base_url","enabled"]}'::jsonb
    when 'signup-domains' then '{"table":"allowed_signup_domains","mode":"crud","fields":["domain","enabled","notes"]}'::jsonb
    when 'whitelisted-emails' then '{"table":"whitelisted_emails","mode":"crud","fields":["email","enabled","notes"]}'::jsonb
    when 'generation-requests' then '{"table":"generation_requests","mode":"read","fields":[]}'::jsonb
    when 'llm-responses' then '{"table":"llm_responses","mode":"read","fields":[]}'::jsonb
    when 'images' then '{"table":"images","mode":"crud","fields":["name","alt_text","storage_path","mime_type"]}'::jsonb
    else null end;
end;
$$;

-- New tables have no direct browser grants or permissive RLS policies.
do $$ declare t text; begin
  foreach t in array array['prompt_chains','prompt_chain_steps','prompt_chain_mix','terms','ai_generation_examples','llm_models','llm_providers','allowed_signup_domains','whitelisted_emails','generation_requests','llm_responses','images'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

create or replace function public.admin_catalog_list(resource text, search_text text default '', page_number integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare spec jsonb; records jsonb; total bigint;
begin
  perform public.admin_assert_access();
  spec := public.admin_resource_spec(resource);
  if spec is null then raise exception 'Unknown resource'; end if;
  if page_number is null or page_number not between 1 and 100000 or search_text is null or length(search_text) > 200 then raise exception 'Invalid search or page'; end if;
  execute format('select count(*) from public.%I t where strpos(lower(to_jsonb(t)::text), lower($1)) > 0', spec->>'table') into total using search_text;
  execute format('select coalesce(jsonb_agg(r), ''[]''::jsonb) from (select t.* from public.%I t where strpos(lower(to_jsonb(t)::text), lower($1)) > 0 order by created_at desc, id limit 25 offset $2) r', spec->>'table')
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
  execute format('select to_jsonb(t) from public.%I t where id = $1', spec->>'table') into result using target;
  return result;
end;
$$;
create or replace function public.admin_catalog_options(resource text, search_text text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare spec jsonb; result jsonb; label_col text;
begin
  perform public.admin_assert_access();
  spec := public.admin_resource_spec(resource);
  label_col := case resource when 'providers' then 'name' when 'models' then 'name' when 'prompt-chains' then 'name' when 'terms' then 'term' when 'images' then 'name' else null end;
  if label_col is null or search_text is null or length(search_text) > 200 then raise exception 'Invalid relation lookup'; end if;
  execute format('select coalesce(jsonb_agg(r), ''[]''::jsonb) from (select id, %I as label from public.%I t where strpos(lower(to_jsonb(t)::text),lower($1)) > 0 order by %I, id limit 50) r', label_col,spec->>'table',label_col) into result using search_text;
  return result;
end;
$$;
create or replace function public.admin_catalog_save(resource text, target uuid, payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare spec jsonb; columns_sql text; values_sql text; assignments text; saved uuid; k text;
begin
  perform public.admin_assert_access();
  spec := public.admin_resource_spec(resource);
  if spec is null or spec->>'mode' = 'read' or (target is null and spec->>'mode' <> 'crud') then raise exception 'Operation not permitted' using errcode='42501'; end if;
  if payload is null or jsonb_typeof(payload) <> 'object' or payload = '{}'::jsonb or octet_length(payload::text) > 100000 then raise exception 'Invalid fields'; end if;
  for k in select jsonb_object_keys(payload) loop
    if not (spec->'fields' ? k) then raise exception 'Field is not editable: %',k; end if;
  end loop;
  if resource = 'images' then
    if target is null and not (payload ? 'storage_path') then raise exception 'Upload an image'; end if;
    if payload ? 'storage_path' and (payload->>'storage_path' is null
      or payload->>'storage_path' not like auth.uid()::text || '/%'
      or payload->>'storage_path' like '%..%'
      or not exists(select 1 from storage.objects where bucket_id='admin-images' and name=payload->>'storage_path')) then raise exception 'Invalid uploaded image'; end if;
    if target is null then payload := payload || jsonb_build_object('created_by',auth.uid()); end if;
  end if;
  select string_agg(format('%I',key), ', ' order by key),
    string_agg(format('(jsonb_populate_record(null::public.%I,$1)).%I',spec->>'table',key), ', ' order by key),
    string_agg(format('%I = (jsonb_populate_record(null::public.%I,$1)).%I',key,spec->>'table',key), ', ' order by key)
    into columns_sql,values_sql,assignments from jsonb_object_keys(payload) key;
  if target is null then
    execute format('insert into public.%I (%s) select %s returning id',spec->>'table',columns_sql,values_sql) into saved using payload;
  else
    execute format('update public.%I set %s where id=$2 returning id',spec->>'table',assignments) into saved using payload,target;
    if saved is null then raise exception 'Record not found'; end if;
  end if;
  return saved;
end;
$$;
create or replace function public.admin_catalog_delete(resource text, target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare spec jsonb; deleted jsonb;
begin
  perform public.admin_assert_access();
  spec := public.admin_resource_spec(resource);
  if spec is null or spec->>'mode' <> 'crud' then raise exception 'Operation not permitted' using errcode='42501'; end if;
  execute format('delete from public.%I t where id=$1 returning to_jsonb(t)',spec->>'table') into deleted using target;
  if deleted is null then raise exception 'Record not found'; end if;
  return deleted;
end;
$$;
create or replace function public.admin_catalog_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_assert_access();
  return jsonb_build_object('chains',(select count(*) from public.prompt_chains),'terms',(select count(*) from public.terms),
    'examples',(select count(*) from public.ai_generation_examples),'images',(select count(*) from public.images),
    'requests',(select count(*) from public.generation_requests),'failed',(select count(*) from public.generation_requests where status='failed'),
    'responses',(select count(*) from public.llm_responses),'tokens',(select coalesce(sum(coalesce(input_tokens,0)::bigint+coalesce(output_tokens,0)),0) from public.llm_responses),
    'mean_latency_ms',(select round(avg(latency_ms)) from public.llm_responses),
    'mix',(select coalesce(jsonb_agg(r),'[]') from (select c.name,m.weight,m.enabled from public.prompt_chain_mix m join public.prompt_chains c on c.id=m.prompt_chain_id order by c.name) r));
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('admin-images','admin-images',false,3145728,array['image/png','image/jpeg','image/webp']) on conflict(id) do update set public=false, file_size_limit=3145728, allowed_mime_types=array['image/png','image/jpeg','image/webp'];
drop policy if exists "Admin image library read" on storage.objects;
create policy "Admin image library read" on storage.objects for select to authenticated
using(bucket_id='admin-images' and public.admin_is_authorized());
drop policy if exists "Admin image library upload" on storage.objects;
create policy "Admin image library upload" on storage.objects for insert to authenticated
with check(bucket_id='admin-images' and public.admin_is_authorized() and name like auth.uid()::text || '/%');
create or replace function public.admin_library_image_in_use(target_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_assert_access();
  return exists(select 1 from public.images where storage_path=target_path);
end;
$$;
drop policy if exists "Admin image library cleanup" on storage.objects;
create policy "Admin image library cleanup" on storage.objects for delete to authenticated
using(case when bucket_id='admin-images' and public.admin_is_authorized() then not public.admin_library_image_in_use(name) else false end);

-- Restrictive policies prevent older broad storage policies from exposing this bucket.
drop policy if exists "Admin library read boundary" on storage.objects;
create policy "Admin library read boundary" on storage.objects as restrictive for select to authenticated
using(bucket_id <> 'admin-images' or public.admin_is_authorized());
drop policy if exists "Admin library insert boundary" on storage.objects;
create policy "Admin library insert boundary" on storage.objects as restrictive for insert to authenticated
with check(bucket_id <> 'admin-images' or (public.admin_is_authorized() and name like auth.uid()::text || '/%'));
drop policy if exists "Admin library immutable files" on storage.objects;
create policy "Admin library immutable files" on storage.objects as restrictive for update to authenticated
using(bucket_id <> 'admin-images') with check(bucket_id <> 'admin-images');
drop policy if exists "Admin library delete boundary" on storage.objects;
create policy "Admin library delete boundary" on storage.objects as restrictive for delete to authenticated
using(case when bucket_id='admin-images' then case when public.admin_is_authorized() then not public.admin_library_image_in_use(name) else false end else true end);
drop policy if exists "No anonymous admin library" on storage.objects;
create policy "No anonymous admin library" on storage.objects as restrictive for all to anon
using(bucket_id <> 'admin-images') with check(bucket_id <> 'admin-images');

revoke all on function public.admin_resource_spec(text),public.admin_catalog_list(text,text,integer),public.admin_catalog_get(text,uuid),public.admin_catalog_options(text,text),public.admin_catalog_save(text,uuid,jsonb),public.admin_catalog_delete(text,uuid),public.admin_catalog_stats(),public.admin_library_image_in_use(text) from public,anon,authenticated;
grant execute on function public.admin_catalog_list(text,text,integer),public.admin_catalog_get(text,uuid),public.admin_catalog_options(text,text),public.admin_catalog_save(text,uuid,jsonb),public.admin_catalog_delete(text,uuid),public.admin_catalog_stats(),public.admin_library_image_in_use(text) to authenticated;
commit;
