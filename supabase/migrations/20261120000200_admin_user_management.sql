-- Keep administrative user writes behind server-side role checks.
-- The browser's authenticated role should not need direct UPDATE privileges on public.users.

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

drop function if exists public.admin_set_user_role(uuid, text);

create function public.admin_set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
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

  update public.users as target
  set role = p_role
  where target.user_id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'User not found.';
  end if;
end;
$function$;

revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

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
