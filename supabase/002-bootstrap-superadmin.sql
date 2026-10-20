-- Run ONCE in the Supabase SQL editor as the database owner, AFTER 001-admin.sql.
-- First sign into Melon using this Google account so the verified identity exists.
-- This is the answer to the bootstrap/lockout question: use owner-level SQL
-- access to grant the initial database flag, outside the login-protected app.
do $$
declare target uuid;
begin
  select u.id into target from auth.users u
  where lower(u.email) = 'rz2763@columbia.edu' and u.email_confirmed_at is not null
    and exists(select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google');
  if target is null then raise exception 'Sign in to Melon with rz2763@columbia.edu using Google first, then rerun this script.'; end if;
  insert into public.profiles(id, email, first_name, last_name, is_superadmin)
    values(target, 'rz2763@columbia.edu', 'Rebecca', null, true)
    on conflict(id) do update set is_superadmin = true;
end;
$$;
