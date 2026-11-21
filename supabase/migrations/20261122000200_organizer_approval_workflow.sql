-- Organizer signup creates a student account and a separate request for access.
-- Only an active administrator can approve or decline that request.

alter table public.users
  add column if not exists organizer_request_status text;

-- Some notifications relate to account activity rather than an event.
alter table public.notifications alter column event_id drop not null;

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_organizer_request_status_check'
  ) then
    alter table public.users
      add constraint users_organizer_request_status_check
      check (organizer_request_status is null or organizer_request_status in ('PENDING', 'APPROVED', 'REJECTED'));
  end if;
end;
$block$;

-- Users promoted by the old signup flow have already been granted access; mark
-- them approved. Other existing organizer signups become reviewable requests.
update public.users as profile
set organizer_request_status = case
  when profile.role = 'ORGANIZER' then 'APPROVED'
  else 'PENDING'
end
from auth.users as auth_user
where profile.user_id = auth_user.id
  and auth_user.raw_user_meta_data ->> 'register_as' = 'ORGANIZER'
  and profile.organizer_request_status is null;

create or replace function public.sync_organizer_request_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.raw_user_meta_data ->> 'register_as' = 'ORGANIZER' then
    update public.users as profile
    set organizer_request_status = coalesce(profile.organizer_request_status, 'PENDING')
    where profile.user_id = new.id;
  end if;
  return new;
end;
$function$;

create or replace function public.notify_admins_of_organizer_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  should_notify boolean := false;
begin
  if new.raw_user_meta_data ->> 'register_as' is distinct from 'ORGANIZER' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    update public.users as profile
    set organizer_request_status = coalesce(profile.organizer_request_status, 'PENDING')
    where profile.user_id = new.id;
    should_notify := new.email_confirmed_at is not null;
  elsif old.email_confirmed_at is null and new.email_confirmed_at is not null then
    should_notify := true;
  end if;

  if should_notify and exists (
    select 1
    from public.users as requester
    where requester.user_id = new.id
      and requester.organizer_request_status = 'PENDING'
  ) then
    insert into public.notifications (user_id, event_id, title, message, notification_type, is_read)
    select
      admin_user.user_id,
      null,
      'Organizer access request',
      coalesce(nullif(btrim(requester.full_name), ''), 'A MEHFIL member')
        || ' requested organizer access for '
        || coalesce(nullif(btrim(requester.organization_name), ''), 'their organization')
        || '. Review the request in People & access.',
      'organizer_request',
      false
    from public.users as admin_user
    cross join public.users as requester
    where admin_user.role = 'ADMIN'
      and admin_user.is_active is true
      and requester.user_id = new.id;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_organizer_request_status() from public, anon, authenticated;
revoke all on function public.notify_admins_of_organizer_request() from public, anon, authenticated;

drop trigger if exists zzzzz_sync_organizer_request_status on auth.users;
create trigger zzzzz_sync_organizer_request_status
  after insert on auth.users
  for each row execute function public.sync_organizer_request_status();

drop trigger if exists zzzzzz_notify_admins_of_organizer_signup on auth.users;
drop trigger if exists zzzzzz_notify_admins_of_organizer_confirmation on auth.users;
create trigger zzzzzz_notify_admins_of_organizer_signup
  after insert on auth.users
  for each row execute function public.notify_admins_of_organizer_request();
create trigger zzzzzz_notify_admins_of_organizer_confirmation
  after update of email_confirmed_at on auth.users
  for each row execute function public.notify_admins_of_organizer_request();

-- Notify admins about any already verified requests that predate this migration.
insert into public.notifications (user_id, event_id, title, message, notification_type, is_read)
select
  admin_user.user_id,
  null,
  'Organizer access request',
  coalesce(nullif(btrim(requester.full_name), ''), 'A MEHFIL member')
    || ' requested organizer access for '
    || coalesce(nullif(btrim(requester.organization_name), ''), 'their organization')
    || '. Review the request in People & access.',
  'organizer_request',
  false
from public.users as requester
join auth.users as auth_user on auth_user.id = requester.user_id
cross join public.users as admin_user
where requester.organizer_request_status = 'PENDING'
  and auth_user.email_confirmed_at is not null
  and admin_user.role = 'ADMIN'
  and admin_user.is_active is true;

-- Protect role and request state from direct self-service profile updates.
create or replace function public.guard_organizer_role_updates()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user in ('anon', 'authenticated')
    and (new.role is distinct from old.role
      or new.organizer_request_status is distinct from old.organizer_request_status)
    and not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only an administrator can change account roles or organizer request status.';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_organizer_role_updates on public.users;
create trigger guard_organizer_role_updates
  before update of role, organizer_request_status on public.users
  for each row execute function public.guard_organizer_role_updates();

create or replace function public.admin_set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_status text;
  email_confirmed_at timestamptz;
  target_name text;
  target_organization text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'User ID is required.';
  end if;
  if p_role is null or p_role not in ('STUDENT', 'ORGANIZER', 'ADMIN') then
    raise exception using errcode = '22023', message = 'Invalid account role.';
  end if;

  select profile.organizer_request_status, auth_user.email_confirmed_at,
    profile.full_name, profile.organization_name
  into request_status, email_confirmed_at, target_name, target_organization
  from public.users as profile
  left join auth.users as auth_user on auth_user.id = profile.user_id
  where profile.user_id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'User not found.';
  end if;
  if p_role = 'ORGANIZER' and email_confirmed_at is null then
    raise exception using errcode = '42501', message = 'Email confirmation is required before granting organizer access.';
  end if;

  update public.users as target
  set role = p_role,
    organizer_request_status = case
      when p_role = 'ORGANIZER' and target.organizer_request_status is not null then 'APPROVED'
      else target.organizer_request_status
    end
  where target.user_id = p_user_id;

  if p_role = 'ORGANIZER' and request_status = 'PENDING' then
    insert into public.notifications (user_id, event_id, title, message, notification_type, is_read)
    values (
      p_user_id,
      null,
      'Organizer access approved',
      'Your organizer request was approved. Sign in again to refresh your access.',
      'organizer_request',
      false
    );
  end if;
end;
$function$;

revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

create or replace function public.admin_review_organizer_request(p_user_id uuid, p_approved boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_status text;
  target_active boolean;
  email_confirmed_at timestamptz;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;
  if p_user_id is null or p_approved is null then
    raise exception using errcode = '22023', message = 'User ID and review decision are required.';
  end if;

  select profile.organizer_request_status, profile.is_active, auth_user.email_confirmed_at
  into request_status, target_active, email_confirmed_at
  from public.users as profile
  left join auth.users as auth_user on auth_user.id = profile.user_id
  where profile.user_id = p_user_id
  for update of profile;
  if not found then
    raise exception using errcode = 'P0002', message = 'User not found.';
  end if;
  if request_status is distinct from 'PENDING' then
    raise exception using errcode = '22023', message = 'This organizer request is no longer pending.';
  end if;
  if p_approved and (email_confirmed_at is null or target_active is distinct from true) then
    raise exception using errcode = '42501', message = 'The account must have a confirmed email and be active before approval.';
  end if;

  update public.users as target
  set role = case when p_approved then 'ORGANIZER' else 'STUDENT' end,
    organizer_request_status = case when p_approved then 'APPROVED' else 'REJECTED' end
  where target.user_id = p_user_id;

  insert into public.notifications (user_id, event_id, title, message, notification_type, is_read)
  values (
    p_user_id,
    null,
    case when p_approved then 'Organizer access approved' else 'Organizer request declined' end,
    case when p_approved
      then 'Your organizer request was approved. Sign in again to refresh your access.'
      else 'Your organizer request was not approved. Your account remains a student account. Contact a campus administrator if you need more information.'
    end,
    'organizer_request',
    false
  );
end;
$function$;

revoke all on function public.admin_review_organizer_request(uuid, boolean) from public, anon;
grant execute on function public.admin_review_organizer_request(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
