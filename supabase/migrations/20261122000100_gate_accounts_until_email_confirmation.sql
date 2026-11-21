-- Keep pending email signups inactive until Supabase confirms their address.
-- The profile sync trigger runs first (its name starts with zzz_); these triggers
-- then apply Auth's email confirmation state to the corresponding profile.

create or replace function public.sync_profile_email_confirmation_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    update public.users
    set is_active = (new.email_confirmed_at is not null)
    where user_id = new.id;
  elsif old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.users
    set is_active = true
    where user_id = new.id;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_profile_email_confirmation_status() from public, anon, authenticated;

drop trigger if exists zzzz_sync_auth_user_email_confirmation_signup on auth.users;
create trigger zzzz_sync_auth_user_email_confirmation_signup
  after insert on auth.users
  for each row execute function public.sync_profile_email_confirmation_status();

drop trigger if exists zzzz_sync_auth_user_email_confirmation_verified on auth.users;
create trigger zzzz_sync_auth_user_email_confirmation_verified
  after update of email_confirmed_at on auth.users
  for each row execute function public.sync_profile_email_confirmation_status();

-- Correct profiles created before this migration for accounts still awaiting verification.
update public.users as profile
set is_active = false
from auth.users as auth_user
where profile.user_id = auth_user.id
  and auth_user.email_confirmed_at is null
  and profile.is_active is distinct from false;

-- Do not let an administrator bypass the email confirmation requirement.
create or replace function public.admin_set_user_active(p_user_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;

  if p_user_id is null or p_is_active is null then
    raise exception using errcode = '22023', message = 'User ID and active status are required.';
  end if;

  if p_is_active and exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = p_user_id
      and auth_user.email_confirmed_at is null
  ) then
    raise exception using errcode = '42501', message = 'Email confirmation is required before activating this account.';
  end if;

  update public.users as target
  set is_active = p_is_active
  where target.user_id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'User not found.';
  end if;
end;
$function$;

revoke all on function public.admin_set_user_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
