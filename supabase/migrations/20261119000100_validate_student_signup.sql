-- Prevent duplicate student roll numbers and allow signup to show a useful
-- message before Supabase Auth hides profile-trigger errors.

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

create or replace function public.reject_duplicate_student_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_number text;
begin
  normalized_number := lower(btrim(new.student_number));
  if normalized_number is null or normalized_number = '' then
    return new;
  end if;

  -- Serialize writes for the same normalized roll number so simultaneous
  -- signups cannot both pass the duplicate check.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(normalized_number, 0));

  if exists (
    select 1
    from public.users as existing_user
    where lower(btrim(existing_user.student_number)) = normalized_number
      and existing_user.user_id is distinct from new.user_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'Roll No already exists';
  end if;

  return new;
end;
$function$;

revoke all on function public.reject_duplicate_student_number() from public, anon, authenticated;

drop trigger if exists reject_duplicate_student_number on public.users;
create trigger reject_duplicate_student_number
  before insert or update of student_number on public.users
  for each row execute function public.reject_duplicate_student_number();

-- Existing databases may already contain duplicate values. Keep migration
-- application safe in that case; the trigger above blocks any further ones.
do $migration$
begin
  if exists (
    select lower(btrim(student_number))
    from public.users
    where student_number is not null and btrim(student_number) <> ''
    group by lower(btrim(student_number))
    having count(*) > 1
  ) then
    raise notice 'Skipping the unique roll number index because duplicate values already exist; duplicate checks remain enabled.';
  else
    execute $sql$
      create unique index if not exists users_student_number_normalized_unique_idx
        on public.users (lower(btrim(student_number)))
        where student_number is not null and btrim(student_number) <> ''
    $sql$;
  end if;
end;
$migration$;
