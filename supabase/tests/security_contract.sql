begin;

select plan(17);

select has_table('public', 'users', 'users table exists');
select has_table('public', 'events', 'events table exists');
select has_table('public', 'registrations', 'registrations table exists');
select has_table('public', 'attendance', 'attendance table exists');
select has_table('public', 'notifications', 'notifications table exists');

select fk_ok('public', 'events', 'organizer_id', 'public', 'users', 'user_id', 'events belong to users');
select fk_ok('public', 'registrations', 'student_id', 'public', 'users', 'user_id', 'registrations belong to students');
select fk_ok('public', 'registrations', 'event_id', 'public', 'events', 'event_id', 'registrations refer to events');
select fk_ok('public', 'attendance', 'registration_id', 'public', 'registrations', 'registration_id', 'attendance refers to registrations');
select fk_ok('public', 'attendance', 'marked_by', 'public', 'users', 'user_id', 'attendance markers refer to users');
select fk_ok('public', 'notifications', 'user_id', 'public', 'users', 'user_id', 'notifications belong to users');
select fk_ok('public', 'notifications', 'event_id', 'public', 'events', 'event_id', 'notifications refer to events');
select ok(to_regprocedure('public.admin_set_user_role(uuid,text)') is not null, 'authorized role change RPC exists');
select ok(to_regprocedure('public.is_admin()') is not null, 'admin policy helper exists');
select ok(has_function_privilege('authenticated', 'public.admin_set_user_role(uuid,text)', 'EXECUTE'), 'authenticated sessions can call the role RPC for server-side authorization');

select ok(
  (select bool_and(c.relrowsecurity)
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('users','events','registrations','attendance','notifications')),
  'all MEHFIL tables have row-level security enabled'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and (coalesce(qual, '') ~* E'from[[:space:]]+(public\\.)?users'
        or coalesce(with_check, '') ~* E'from[[:space:]]+(public\\.)?users')
  ),
  'users policies do not query public.users directly and recurse'
);

select * from finish();
rollback;

