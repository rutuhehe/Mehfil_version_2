-- Give active administrators secure event creation and management RPCs.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.users as admin_user
    where admin_user.user_id = auth.uid()
      and admin_user.role = 'ADMIN'
      and admin_user.is_active is true
  );
$function$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_create_event(
  p_title text,
  p_description text,
  p_category_name text,
  p_department_name text,
  p_venue text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_registration_deadline timestamptz,
  p_capacity integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  created_event_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;

  if nullif(btrim(p_title), '') is null
    or nullif(btrim(p_description), '') is null
    or nullif(btrim(p_category_name), '') is null
    or nullif(btrim(p_department_name), '') is null
    or nullif(btrim(p_venue), '') is null then
    raise exception using errcode = '22023', message = 'Complete all required event details.';
  end if;

  if p_start_at is null or p_end_at is null or p_start_at <= now() or p_end_at <= p_start_at then
    raise exception using errcode = '22023', message = 'Choose valid future event times.';
  end if;

  if p_registration_deadline is null or p_registration_deadline > p_start_at then
    raise exception using errcode = '22023', message = 'The registration deadline must be before the event starts.';
  end if;

  if p_capacity is not null and p_capacity < 1 then
    raise exception using errcode = '22023', message = 'Capacity must be at least one.';
  end if;

  insert into public.events (
    organizer_id, title, description, category_name, department_name, venue,
    start_at, end_at, registration_deadline, capacity, status
  )
  values (
    auth.uid(), btrim(p_title), btrim(p_description), btrim(p_category_name),
    btrim(p_department_name), btrim(p_venue), p_start_at, p_end_at,
    p_registration_deadline, p_capacity, 'PUBLISHED'
  )
  returning event_id into created_event_id;

  return created_event_id;
end;
$function$;

revoke all on function public.admin_create_event(text, text, text, text, text, timestamptz, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.admin_create_event(text, text, text, text, text, timestamptz, timestamptz, timestamptz, integer) to authenticated;

create or replace function public.admin_update_event(
  p_event_id uuid,
  p_title text,
  p_description text,
  p_category_name text,
  p_department_name text,
  p_venue text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_registration_deadline timestamptz,
  p_capacity integer,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;

  if p_event_id is null then
    raise exception using errcode = '22023', message = 'Event ID is required.';
  end if;

  if nullif(btrim(p_title), '') is null
    or nullif(btrim(p_description), '') is null
    or nullif(btrim(p_category_name), '') is null
    or nullif(btrim(p_department_name), '') is null
    or nullif(btrim(p_venue), '') is null then
    raise exception using errcode = '22023', message = 'Complete all required event details.';
  end if;

  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception using errcode = '22023', message = 'Choose valid event times.';
  end if;

  if p_registration_deadline is not null and p_registration_deadline > p_start_at then
    raise exception using errcode = '22023', message = 'The registration deadline must be before the event starts.';
  end if;

  if p_capacity is not null and p_capacity < 1 then
    raise exception using errcode = '22023', message = 'Capacity must be at least one.';
  end if;

  if p_status is null or p_status not in ('PUBLISHED', 'CANCELLED', 'COMPLETED') then
    raise exception using errcode = '22023', message = 'Invalid event status.';
  end if;

  update public.events as target
  set title = btrim(p_title),
      description = btrim(p_description),
      category_name = btrim(p_category_name),
      department_name = btrim(p_department_name),
      venue = btrim(p_venue),
      start_at = p_start_at,
      end_at = p_end_at,
      registration_deadline = p_registration_deadline,
      capacity = p_capacity,
      status = p_status
  where target.event_id = p_event_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Event not found.';
  end if;
end;
$function$;

revoke all on function public.admin_update_event(uuid, text, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, text) from public, anon;
grant execute on function public.admin_update_event(uuid, text, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, text) to authenticated;

create or replace function public.admin_delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;

  if p_event_id is null then
    raise exception using errcode = '22023', message = 'Event ID is required.';
  end if;

  if not exists (select 1 from public.events where event_id = p_event_id) then
    raise exception using errcode = 'P0002', message = 'Event not found.';
  end if;

  delete from public.attendance as attendance_row
  using public.registrations as registration
  where registration.event_id = p_event_id
    and attendance_row.registration_id = registration.registration_id;

  -- Registration delete triggers may create notices; remove all event notices afterward.
  delete from public.registrations where event_id = p_event_id;
  delete from public.notifications where event_id = p_event_id;
  delete from public.events where event_id = p_event_id;
end;
$function$;

revoke all on function public.admin_delete_event(uuid) from public, anon;
grant execute on function public.admin_delete_event(uuid) to authenticated;

notify pgrst, 'reload schema';
