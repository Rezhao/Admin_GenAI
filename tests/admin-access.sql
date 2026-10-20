-- Run after fixture.sql, Melon's migrations and 001-admin.sql, in a disposable DB.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
 ('10000000-0000-0000-0000-000000000001','rz2763@columbia.edu',now(),'{"provider":"google"}'),
 ('10000000-0000-0000-0000-000000000002','ordinary@example.com',now(),'{"provider":"google"}'),
 ('10000000-0000-0000-0000-000000000003','email@example.com',now(),'{"provider":"email"}');
insert into auth.identities(user_id,provider) values
 ('10000000-0000-0000-0000-000000000001','google'),('10000000-0000-0000-0000-000000000002','google');
insert into public.profiles(id,email,is_superadmin) select id,email,id='10000000-0000-0000-0000-000000000001' from auth.users;
insert into public.communities(id,name,visibility,created_by) values('20000000-0000-0000-0000-000000000001','Private fixture','private','10000000-0000-0000-0000-000000000002');
insert into public.ai_generations(id,user_id,community_id,image_path,prompt,caption) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002/private.png','Private prompt','Private caption');
insert into public.generation_votes(generation_id,user_id,vote) values('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',1);
insert into public.generation_comments(generation_id,user_id,body) values('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','Comment fixture');
insert into storage.objects(bucket_id,name) values('generated-media','10000000-0000-0000-0000-000000000002/private.png');
create function pg_temp.check_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',message; end if; end $$;
set local role anon;
do $$ begin begin perform public.admin_overview(); raise exception 'FAIL: anon RPC access'; exception when insufficient_privilege then null; end; end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}',true);
select pg_temp.check_true(not public.admin_is_authorized(),'ordinary Google user is denied');
do $$ begin
  begin perform public.admin_overview(); raise exception 'FAIL: ordinary user reads dashboard'; exception when insufficient_privilege then null; end;
  begin perform public.admin_list('profiles'); raise exception 'FAIL: ordinary user reads profiles'; exception when insufficient_privilege then null; end;
  begin perform public.admin_get_media('30000000-0000-0000-0000-000000000001'); raise exception 'FAIL: ordinary user calls media RPC'; exception when insufficient_privilege then null; end;
  begin perform public.admin_communities(); raise exception 'FAIL: ordinary user calls communities RPC'; exception when insufficient_privilege then null; end;
  begin perform public.admin_media_path_in_use('any'); raise exception 'FAIL: ordinary user inspects storage paths'; exception when insufficient_privilege then null; end;
  begin perform public.admin_save_media(null,'Caption','Prompt here',null,'bad'); raise exception 'FAIL: ordinary user writes media'; exception when insufficient_privilege then null; end;
  begin perform public.admin_delete_media('30000000-0000-0000-0000-000000000001'); raise exception 'FAIL: ordinary user deletes media'; exception when insufficient_privilege then null; end;
  begin update public.profiles set is_superadmin=true where id=auth.uid(); raise exception 'FAIL: self promotion'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","app_metadata":{"provider":"google"},"amr":[{"method":"password"}]}',true);
select pg_temp.check_true(not public.admin_is_authorized(),'superadmin password session is denied');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000003","app_metadata":{"provider":"email"},"user_metadata":{"is_superadmin":true,"provider":"google"},"amr":[{"method":"oauth"}]}',true);
select pg_temp.check_true(not public.admin_is_authorized(),'user metadata cannot spoof Google or admin access');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}',true);
select pg_temp.check_true(public.admin_is_authorized(),'Google superadmin is authorized');
select pg_temp.check_true((public.admin_overview()->>'profiles')::int=3,'full profile statistics');
select pg_temp.check_true((public.admin_overview()->>'votes')::int=1,'full vote statistics');
select pg_temp.check_true((public.admin_list('media')->>'total')::int=1,'admin can inspect private media');
select pg_temp.check_true((public.admin_list('profiles')->>'total')::int=3,'admin reads all profiles');
select pg_temp.check_true((public.admin_list('ratings')->>'total')::int=1,'admin reads private ratings');
select pg_temp.check_true((public.admin_list('media','%')->>'total')::int=0,'search treats wildcards literally');
select pg_temp.check_true((select count(*)=1 from storage.objects),'admin previews another user private media');
insert into storage.objects(bucket_id,name) values('generated-media',auth.uid()::text||'/admin/new.png');
select public.admin_save_media(null,'New caption','New prompt',null,auth.uid()::text||'/admin/new.png');
select pg_temp.check_true((public.admin_list('media')->>'total')::int=2,'admin creates media');
select public.admin_save_media('30000000-0000-0000-0000-000000000001','Updated caption','Updated prompt',null,null);
select pg_temp.check_true(public.admin_get_media('30000000-0000-0000-0000-000000000001')->>'caption'='Updated caption','admin edits another author post');
select pg_temp.check_true(public.admin_get_media('30000000-0000-0000-0000-000000000001')->>'user_id'='10000000-0000-0000-0000-000000000002','update preserves author');
select public.admin_delete_media('30000000-0000-0000-0000-000000000001');
select pg_temp.check_true(not public.admin_media_path_in_use('10000000-0000-0000-0000-000000000002/private.png'),'deleted path safe to clean');
delete from storage.objects where name='10000000-0000-0000-0000-000000000002/private.png';
select pg_temp.check_true((public.admin_overview()->>'votes')::int=0,'delete cleans vote references');
reset role;
select pg_temp.check_true((select count(*)=0 from public.generation_comments),'delete cleans comments');
update public.profiles set is_superadmin=false where id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.check_true(not public.admin_is_authorized(),'revocation takes effect without waiting for JWT expiry');
do $$ begin begin perform public.admin_overview(); raise exception 'FAIL: revoked admin access'; exception when insufficient_privilege then null; end; end $$;
rollback;
