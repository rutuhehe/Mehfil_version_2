-- Expose only an aggregate active-member count on the public landing page.

create or replace function public.public_community_member_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $function$
  select count(*)::bigint
  from public.users as campus_member
  where campus_member.is_active is true
    and campus_member.role in ('STUDENT', 'ORGANIZER');
$function$;

revoke all on function public.public_community_member_count() from public, anon, authenticated;
grant execute on function public.public_community_member_count() to anon, authenticated;

notify pgrst, 'reload schema';
