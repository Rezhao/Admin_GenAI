-- Disposable local database only, after migrations 001, 004, and 005.
begin;
create function pg_temp.check_true(value boolean, message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'FAIL: %',message; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate=expected then return; end if; raise exception 'Unexpected SQLSTATE %: %',sqlstate,sqlerrm; end; raise exception 'FAIL: unexpectedly succeeded: %',statement; end $$;
create temporary table pipeline_state(key text primary key,value uuid);
grant all on pipeline_state to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
('71000000-0000-4000-8000-000000000001','creator@example.test',now(),'{"provider":"google"}'),
('71000000-0000-4000-8000-000000000002','other@example.test',now(),'{"provider":"google"}'),
('71000000-0000-4000-8000-000000000003','admin@example.test',now(),'{"provider":"google"}');
insert into auth.identities(user_id,provider) select id,'google' from auth.users where id::text like '71000000-%';
insert into public.profiles(id,email,is_superadmin) select id,email,id='71000000-0000-4000-8000-000000000003' from auth.users where id::text like '71000000-%';
insert into public.communities(id,name,visibility,created_by) values
('72000000-0000-4000-8000-000000000001','Creators private','private','71000000-0000-4000-8000-000000000001'),
('72000000-0000-4000-8000-000000000002','Others private','private','71000000-0000-4000-8000-000000000002');
insert into public.prompt_chain_steps(id,prompt_chain_id,step_order,name,user_prompt,llm_model_id)
values('73000000-0000-4000-8000-000000000001','d6300000-0000-4000-8000-000000000001',2,'Refine','Refine {{previous_response}}','d6200000-0000-4000-8000-000000000001');
set local role anon;
select pg_temp.expect_error($q$select public.begin_caption_request('Valid prompt','72000000-0000-4000-8000-000000000001')$q$,'42501');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}',true);
select pg_temp.expect_error($q$select * from public.generation_requests$q$,'42501');
select pg_temp.expect_error($q$select public.admin_catalog_list('llm-responses')$q$,'42501');
select pg_temp.expect_error($q$select public.begin_caption_request('Valid prompt','72000000-0000-4000-8000-000000000002')$q$,'42501');
select pg_temp.expect_error($q$select public.begin_caption_request('Valid prompt',null)$q$,'42501');
do $$ declare plan jsonb; request uuid; post uuid; again uuid;
begin
  plan:=public.begin_caption_request('A tracked caption','72000000-0000-4000-8000-000000000001');
  request:=(plan->>'request_id')::uuid;
  insert into pipeline_state values('request',request);
  perform pg_temp.check_true(jsonb_array_length(plan->'steps')=2,'both chain steps are snapshotted');
  perform pg_temp.expect_error(format('select public.finish_caption_request(%L,''bad'')',request),'P0001');
  perform pg_temp.expect_error(format('select public.record_caption_response(%L,''73000000-0000-4000-8000-000000000001'',''Out of order'',1,1,1)',request),'P0001');
  perform public.record_caption_response(request,'d6400000-0000-4000-8000-000000000001','First caption.',10,20,30);
  perform pg_temp.expect_error(format('select public.record_caption_response(%L,''d6400000-0000-4000-8000-000000000001'',''Repeat'',1,1,1)',request),'P0001');
  perform public.record_caption_response(request,'73000000-0000-4000-8000-000000000001','Final caption.',11,21,31);
  insert into storage.objects(bucket_id,name) values('generated-media','71000000-0000-4000-8000-000000000001/tracked.png');
  post:=public.finish_caption_request(request,'71000000-0000-4000-8000-000000000001/tracked.png');
  again:=public.finish_caption_request(request,'71000000-0000-4000-8000-000000000001/tracked.png');
  perform pg_temp.check_true(post=again,'publish retries return the original post');
  perform pg_temp.check_true(exists(select 1 from public.ai_generations where id=post and caption='Final caption.' and generation_request_id=request),'post and final caption saved');
  perform pg_temp.check_true(public.caption_request_state(request)->>'status'='completed','request completed atomically');
  insert into pipeline_state values('post',post);
end $$;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}',true);
select pg_temp.expect_error(format('select public.caption_request_state(%L)',(select value from pipeline_state where key='request')),'42501');
select pg_temp.expect_error(format('select public.finish_caption_request(%L,''71000000-0000-4000-8000-000000000002/bad.png'')',(select value from pipeline_state where key='request')),'42501');
select pg_temp.expect_error(format('select public.fail_caption_request(%L,''Forged failure'')',(select value from pipeline_state where key='request')),'42501');
insert into pipeline_state values('other_request',(public.begin_caption_request('Other private caption','72000000-0000-4000-8000-000000000002')->>'request_id')::uuid);
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}',true);
select pg_temp.expect_error(format('update public.ai_generations set generation_request_id=%L where id=%L',(select value from pipeline_state where key='other_request'),(select value from pipeline_state where key='post')),'42501');
do $$ declare request uuid; plan jsonb; i integer; active uuid[]:=array[]::uuid[];
begin
  request:=(public.begin_caption_request('A failed caption','72000000-0000-4000-8000-000000000001')->>'request_id')::uuid;
  perform public.fail_caption_request(request,'Provider timeout');
  perform pg_temp.check_true(public.caption_request_state(request)->>'status'='failed','provider failures are visible');
  for i in 1..5 loop active:=array_append(active,(public.begin_caption_request('Concurrent request '||i,'72000000-0000-4000-8000-000000000001')->>'request_id')::uuid); end loop;
  perform pg_temp.expect_error($q$select public.begin_caption_request('Sixth concurrent request','72000000-0000-4000-8000-000000000001')$q$,'P0001');
  foreach request in array active loop perform public.fail_caption_request(request,'Test cleanup'); end loop;
  -- Older deployed clients still get saved-post records from the insert trigger.
  insert into public.ai_generations(user_id,community_id,image_path,prompt,caption)
    values(auth.uid(),'72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001/legacy.png','Legacy prompt','Legacy saved caption.');
end $$;
reset role;
insert into public.prompt_chains(id,name) values('74000000-0000-4000-8000-000000000001','Weighted alternative');
insert into public.prompt_chain_steps(prompt_chain_id,step_order,name,user_prompt,llm_model_id) values('74000000-0000-4000-8000-000000000001',1,'Caption','{{prompt}}','d6200000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}',true);
select pg_temp.check_true((public.admin_catalog_get('generation-requests',(select value from pipeline_state where key='request'))->>'source')='live','admin reads live request');
select pg_temp.check_true((public.admin_catalog_list('llm-responses','Legacy saved caption.')->'items'->0->>'source')='saved_caption','legacy output is honestly labeled');
select pg_temp.check_true((public.admin_catalog_list('llm-responses','Legacy saved caption.')->'items'->0->'input_tokens')='null'::jsonb,'legacy token usage is unknown');
select public.admin_catalog_save('prompt-chain-mix',(public.admin_catalog_list('prompt-chain-mix','d6300000-0000-4000-8000-000000000001')->'items'->0->>'id')::uuid,'{"weight":0}');
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}',true);
select pg_temp.check_true(public.begin_caption_request('Weighted caption','72000000-0000-4000-8000-000000000001')->>'chain_id'='74000000-0000-4000-8000-000000000001','admin mix weights affect real selection');
reset role;
update public.llm_providers set enabled=false where id='d6100000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.expect_error($q$select public.begin_caption_request('Disabled provider','72000000-0000-4000-8000-000000000001')$q$,'P0001');
rollback;
