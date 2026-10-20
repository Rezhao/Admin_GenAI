-- Run as the database owner in the SAME Supabase project as HelloWorld_GenAI.
-- No service-role key is needed by the app. Existing Melon RLS remains intact.
begin;
alter table public.profiles add column if not exists is_superadmin boolean not null default false;

-- SECURITY INVOKER is intentional: the caller, not the function owner, determines
-- whether a privilege change is allowed. This also protects table-wide grants.
create or replace function public.guard_superadmin_flag()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (case when tg_op = 'INSERT' then new.is_superadmin else new.is_superadmin is distinct from old.is_superadmin end)
    and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Only the database owner can change superadmin access' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_superadmin_flag on public.profiles;
create trigger protect_superadmin_flag before insert or update on public.profiles
for each row execute function public.guard_superadmin_flag();

create or replace function public.admin_is_authorized()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce(auth.jwt()->'app_metadata'->>'provider', '') = 'google'
    and exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) method where method->>'method' = 'oauth')
    and exists(select 1 from auth.identities i where i.user_id = auth.uid() and i.provider = 'google')
    and exists(select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
    and exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_superadmin is true);
$$;

create or replace function public.admin_assert_access()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.admin_is_authorized() then
    raise exception 'Google superadmin access required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.admin_assert_access();
  select jsonb_build_object(
    'profiles', (select count(*) from public.profiles),
    'media', (select count(*) from public.ai_generations),
    'votes', (select count(*) from public.generation_votes),
    'upvotes', (select count(*) from public.generation_votes where vote = 1),
    'downvotes', (select count(*) from public.generation_votes where vote = -1),
    'communities', (select count(*) from public.communities),
    'new_media', (select count(*) from public.ai_generations where created_at >= now() - interval '7 days'),
    'new_profiles', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'unrated', (select count(*) from public.ai_generations g where not exists(select 1 from public.generation_votes v where v.generation_id = g.id)),
    'unassigned', (select count(*) from public.ai_generations where community_id is null),
    'activity', (select coalesce(jsonb_agg(d order by day), '[]') from (
      select series::date as day, (select count(*) from public.ai_generations where (created_at at time zone 'UTC')::date = series::date) as posts,
        (select count(*) from public.generation_votes where (created_at at time zone 'UTC')::date = series::date) as votes
      from generate_series((now() at time zone 'UTC')::date - 13, (now() at time zone 'UTC')::date, interval '1 day') series
    ) d),
    'community_activity', (select coalesce(jsonb_agg(c), '[]') from (
      select c.id, c.name, c.visibility, count(g.id) as posts from public.communities c
      left join public.ai_generations g on g.community_id = c.id group by c.id order by count(g.id) desc, c.name limit 5
    ) c),
    'top_posts', (select coalesce(jsonb_agg(p), '[]') from (
      select g.id, g.caption, count(v.generation_id) filter(where v.vote = 1) as upvotes,
        count(v.generation_id) filter(where v.vote = -1) as downvotes, coalesce(sum(v.vote), 0) as score,
        coalesce(c.name, 'Unassigned') as community
      from public.ai_generations g left join public.generation_votes v on v.generation_id = g.id
      left join public.communities c on c.id = g.community_id
      group by g.id, c.name order by coalesce(sum(v.vote), 0) desc, g.created_at desc limit 5
    ) p)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_list(resource text, search_text text default '', page_number integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare records jsonb; total bigint; skip integer; term text;
begin
  perform public.admin_assert_access();
  if page_number < 1 or page_number > 100000 then raise exception 'Invalid page'; end if;
  if length(search_text) > 200 then raise exception 'Search is too long'; end if;
  skip := (page_number - 1) * 25;
  -- Treat user search as literal text, not SQL wildcard patterns.
  term := '%' || replace(replace(replace(search_text, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  if resource = 'profiles' then
    select count(*) into total from public.profiles p left join auth.users u on u.id = p.id
      where concat_ws(' ', p.first_name, p.last_name, p.email, u.email, p.id::text) ilike term;
    select coalesce(jsonb_agg(r), '[]') into records from (
      select p.id, coalesce(p.email, u.email) as email, p.first_name, p.last_name, p.avatar_url, p.is_superadmin,
        u.created_at, u.last_sign_in_at, coalesce(u.raw_app_meta_data->>'provider', 'unknown') as provider,
        (select count(*) from public.ai_generations where user_id = p.id) as media_count,
        (select count(*) from public.generation_votes where user_id = p.id) as vote_count
      from public.profiles p left join auth.users u on u.id = p.id
      where concat_ws(' ', p.first_name, p.last_name, p.email, u.email, p.id::text) ilike term
      order by u.created_at desc nulls last, p.id limit 25 offset skip
    ) r;
  elsif resource = 'media' then
    select count(*) into total from public.ai_generations g left join public.communities c on c.id = g.community_id
      where concat_ws(' ', g.caption, g.prompt, c.name, g.id::text) ilike term;
    select coalesce(jsonb_agg(r), '[]') into records from (
      select g.id, g.user_id, g.community_id, g.image_path, g.caption, g.prompt, g.created_at, c.name as community,
        concat_ws(' ', p.first_name, p.last_name) as author, p.email,
        (select count(*) from public.generation_votes where generation_id = g.id and vote = 1) as upvotes,
        (select count(*) from public.generation_votes where generation_id = g.id and vote = -1) as downvotes
      from public.ai_generations g left join public.communities c on c.id = g.community_id
      left join public.profiles p on p.id = g.user_id
      where concat_ws(' ', g.caption, g.prompt, c.name, g.id::text) ilike term
      order by g.created_at desc, g.id limit 25 offset skip
    ) r;
  elsif resource = 'ratings' then
    select count(*) into total from public.generation_votes v left join public.ai_generations g on g.id = v.generation_id
      left join public.profiles p on p.id = v.user_id
      where concat_ws(' ', g.caption, p.email, p.first_name, p.last_name, v.user_id::text) ilike term;
    select coalesce(jsonb_agg(r), '[]') into records from (
      select v.generation_id, v.user_id, v.vote, v.created_at, g.caption, p.email,
        concat_ws(' ', p.first_name, p.last_name) as voter, c.name as community
      from public.generation_votes v left join public.ai_generations g on g.id = v.generation_id
      left join public.profiles p on p.id = v.user_id left join public.communities c on c.id = g.community_id
      where concat_ws(' ', g.caption, p.email, p.first_name, p.last_name, v.user_id::text) ilike term
      order by v.created_at desc, v.generation_id, v.user_id limit 25 offset skip
    ) r;
  else raise exception 'Unknown resource';
  end if;
  return jsonb_build_object('items', records, 'total', total, 'page', page_number, 'page_size', 25);
end;
$$;

create or replace function public.admin_communities()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_assert_access();
  return (select coalesce(jsonb_agg(c order by name), '[]') from (select id, name, visibility from public.communities) c);
end;
$$;

create or replace function public.admin_get_media(target uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_assert_access();
  return (select jsonb_build_object('id', g.id, 'user_id', g.user_id, 'community_id', g.community_id,
    'image_path', g.image_path, 'caption', g.caption, 'prompt', g.prompt, 'created_at', g.created_at) from public.ai_generations g where g.id = target);
end;
$$;

create or replace function public.admin_media_path_in_use(target_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_assert_access();
  return exists(select 1 from public.ai_generations where image_path = target_path);
end;
$$;

-- All mutations are narrow functions. Callers cannot write arbitrary tables,
-- change authors, change privilege flags, or edit vote records.
create or replace function public.admin_save_media(target uuid, caption_text text, prompt_text text, target_community uuid, new_image_path text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid; previous_path text;
begin
  perform public.admin_assert_access();
  if char_length(btrim(caption_text)) not between 1 and 2000 or char_length(btrim(prompt_text)) not between 5 and 2000
    or caption_text is null or prompt_text is null then raise exception 'Invalid caption or prompt'; end if;
  if target_community is not null and not exists(select 1 from public.communities where id = target_community) then raise exception 'Community not found'; end if;
  if new_image_path is not null and (
    new_image_path not like auth.uid()::text || '/admin/%' or new_image_path like '%..%'
    or not exists(select 1 from storage.objects where bucket_id = 'generated-media' and name = new_image_path)
  ) then raise exception 'Invalid uploaded image'; end if;
  if target is null then
    if new_image_path is null then raise exception 'An image is required'; end if;
    insert into public.ai_generations(user_id, community_id, image_path, prompt, caption)
      values(auth.uid(), target_community, new_image_path, btrim(prompt_text), btrim(caption_text)) returning id into saved_id;
  else
    select image_path into previous_path from public.ai_generations where id = target for update;
    if not found then raise exception 'Media not found'; end if;
    update public.ai_generations set caption = btrim(caption_text), prompt = btrim(prompt_text),
      community_id = target_community, image_path = coalesce(new_image_path, previous_path) where id = target returning id into saved_id;
  end if;
  return saved_id;
end;
$$;

create or replace function public.admin_delete_media(target uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare deleted_path text;
begin
  perform public.admin_assert_access();
  select image_path into deleted_path from public.ai_generations where id = target for update;
  if not found then raise exception 'Media not found'; end if;
  -- Explicitly remove dependent rows even if an older deployment lacks cascades.
  delete from public.generation_comments where generation_id = target;
  delete from public.generation_votes where generation_id = target;
  delete from public.ai_generations where id = target;
  return deleted_path;
end;
$$;

-- Superadmins can preview private media and clean up generated-media files.
-- All non-admin storage restrictions are preserved.
drop policy if exists "Admin media read" on storage.objects;
create policy "Admin media read" on storage.objects for select to authenticated
using (bucket_id = 'generated-media' and public.admin_is_authorized());
drop policy if exists "Admin media upload" on storage.objects;
create policy "Admin media upload" on storage.objects for insert to authenticated
with check (bucket_id = 'generated-media' and public.admin_is_authorized() and name like auth.uid()::text || '/admin/%');
drop policy if exists "Admin media delete" on storage.objects;
create policy "Admin media delete" on storage.objects for delete to authenticated
using (bucket_id = 'generated-media' and public.admin_is_authorized());
drop policy if exists "Community media visibility" on storage.objects;
create policy "Community media visibility" on storage.objects as restrictive for select to authenticated using (
  bucket_id <> 'generated-media' or public.admin_is_authorized() or (storage.foldername(name))[1] = auth.uid()::text
  or exists(select 1 from public.ai_generations where image_path = name and public.can_read_generation(id))
);

revoke all on function public.guard_superadmin_flag() from public, anon, authenticated;
revoke all on function public.admin_is_authorized(), public.admin_assert_access(), public.admin_overview(),
  public.admin_list(text,text,integer), public.admin_communities(), public.admin_get_media(uuid),
  public.admin_save_media(uuid,text,text,uuid,text), public.admin_delete_media(uuid), public.admin_media_path_in_use(text) from public, anon, authenticated;
grant execute on function public.admin_is_authorized(), public.admin_overview(), public.admin_list(text,text,integer),
  public.admin_communities(), public.admin_get_media(uuid), public.admin_save_media(uuid,text,text,uuid,text),
  public.admin_delete_media(uuid), public.admin_media_path_in_use(text) to authenticated;
commit;
