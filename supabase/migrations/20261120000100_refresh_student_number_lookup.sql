-- Recreate the signup lookup and refresh PostgREST's schema cache so the
-- browser can call it through supabase.rpc().
create or replace function public.student_number_exists(p_student_number text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.users as existing_user
    where nullif(btrim(p_student_number), '') is not null
      and lower(btrim(existing_user.student_number)) = lower(btrim(p_student_number))
  );
$function$;

revoke all on function public.student_number_exists(text) from public;
grant execute on function public.student_number_exists(text) to anon, authenticated;

notify pgrst, 'reload schema';
