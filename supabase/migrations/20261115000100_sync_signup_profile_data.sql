-- Keep registration details in the public profile used by organizer views.
-- Auth metadata remains the source for fields that are not part of the current
-- public.users contract (college, year, organization type, and designation).

alter table public.users
  add column if not exists email text,
  add column if not exists student_number text,
  add column if not exists department_name text,
  add column if not exists organization_name text;

alter table public.users alter column role set default 'STUDENT';

create or replace function public.sync_auth_user_profile_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  -- Profile edits in the app write directly to public.users. Keep later email
  -- changes in sync without replaying possibly older Auth metadata over them.
  if tg_op = 'UPDATE' then
    update public.users set email = coalesce(new.email, public.users.email)
    where user_id = new.id;
    return new;
  end if;

  insert into public.users (
    user_id,
    email,
    role,
    full_name,
    phone_number,
    student_number,
    department_name,
    organization_name
  ) values (
    new.id,
    new.email,
    'STUDENT',
    coalesce(nullif(btrim(metadata ->> 'full_name'), ''), 'MEHFIL member'),
    nullif(btrim(metadata ->> 'phone_number'), ''),
    case when metadata ->> 'register_as' = 'ORGANIZER' then null
      else nullif(btrim(metadata ->> 'student_number'), '') end,
    case when metadata ->> 'register_as' = 'ORGANIZER' then null
      else nullif(btrim(metadata ->> 'department_name'), '') end,
    case when metadata ->> 'register_as' = 'ORGANIZER'
      then nullif(btrim(metadata ->> 'organization_name'), '')
      else null end
  )
  on conflict (user_id) do update set
    email = coalesce(excluded.email, public.users.email),
    full_name = coalesce(nullif(btrim(metadata ->> 'full_name'), ''), public.users.full_name),
    phone_number = coalesce(nullif(btrim(metadata ->> 'phone_number'), ''), public.users.phone_number),
    student_number = coalesce(
      case when metadata ->> 'register_as' = 'ORGANIZER' then null
        else nullif(btrim(metadata ->> 'student_number'), '') end,
      public.users.student_number
    ),
    department_name = coalesce(
      case when metadata ->> 'register_as' = 'ORGANIZER' then null
        else nullif(btrim(metadata ->> 'department_name'), '') end,
      public.users.department_name
    ),
    organization_name = coalesce(
      case when metadata ->> 'register_as' = 'ORGANIZER'
        then nullif(btrim(metadata ->> 'organization_name'), '')
        else null end,
      public.users.organization_name
    );

  return new;
end;
$function$;

drop trigger if exists zzz_sync_auth_user_profile_metadata on auth.users;
drop trigger if exists zzz_sync_auth_user_email on auth.users;
create trigger zzz_sync_auth_user_profile_metadata
  after insert on auth.users
  for each row execute function public.sync_auth_user_profile_metadata();
create trigger zzz_sync_auth_user_email
  after update of email on auth.users
  for each row execute function public.sync_auth_user_profile_metadata();

-- Backfill profile rows that were created before the sync trigger existed.
insert into public.users (
  user_id,
  email,
  role,
  full_name,
  phone_number,
  student_number,
  department_name,
  organization_name
)
select
  auth_user.id,
  auth_user.email,
  'STUDENT',
  coalesce(nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''), 'MEHFIL member'),
  nullif(btrim(auth_user.raw_user_meta_data ->> 'phone_number'), ''),
  case when auth_user.raw_user_meta_data ->> 'register_as' = 'ORGANIZER' then null
    else nullif(btrim(auth_user.raw_user_meta_data ->> 'student_number'), '') end,
  case when auth_user.raw_user_meta_data ->> 'register_as' = 'ORGANIZER' then null
    else nullif(btrim(auth_user.raw_user_meta_data ->> 'department_name'), '') end,
  case when auth_user.raw_user_meta_data ->> 'register_as' = 'ORGANIZER'
    then nullif(btrim(auth_user.raw_user_meta_data ->> 'organization_name'), '')
    else null end
from auth.users as auth_user
on conflict (user_id) do update set
  email = coalesce(excluded.email, public.users.email),
  full_name = case when nullif(btrim(public.users.full_name), '') is not null
    then public.users.full_name else excluded.full_name end,
  phone_number = coalesce(nullif(btrim(public.users.phone_number), ''), excluded.phone_number),
  student_number = coalesce(nullif(btrim(public.users.student_number), ''), excluded.student_number),
  department_name = coalesce(nullif(btrim(public.users.department_name), ''), excluded.department_name),
  organization_name = coalesce(nullif(btrim(public.users.organization_name), ''), excluded.organization_name);

-- Organizers can read only profiles belonging to people registered for their events.
create or replace function public.can_view_registered_student_profile(profile_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.users as organizer
    join public.registrations as registration on true
    join public.events as event on event.event_id = registration.event_id
    where organizer.user_id = auth.uid()
      and organizer.role = 'ORGANIZER'
      and organizer.is_active is true
      and event.organizer_id = auth.uid()
      and registration.student_id = profile_user_id
  );
$function$;

revoke all on function public.sync_auth_user_profile_metadata() from public, anon, authenticated;
revoke all on function public.can_view_registered_student_profile(uuid) from public, anon;
grant execute on function public.can_view_registered_student_profile(uuid) to authenticated;

drop policy if exists "Organizers can view registered student profiles" on public.users;
create policy "Organizers can view registered student profiles"
  on public.users
  for select
  to authenticated
  using (public.can_view_registered_student_profile(user_id));
