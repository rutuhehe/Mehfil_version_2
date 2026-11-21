-- Persist in-app notices for event and registration activity.

create or replace function public.notify_on_event_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'PUBLISHED' then
    insert into public.notifications (user_id, event_id, title, message, notification_type, is_read)
    values (
      new.organizer_id,
      new.event_id,
      'Event published',
      'Your event, ' || new.title || ', is now on MEHFIL.',
      'event_created',
      false
    );

    insert into public.notifications (user_id, event_id, title, message, notification_type, is_read)
    select
      student.user_id,
      new.event_id,
      'New campus event',
      new.title || ' was added to the MEHFIL calendar.',
      'event_created',
      false
    from public.users as student
    where student.role = 'STUDENT'
      and student.is_active is true
      and student.user_id <> new.organizer_id;
  end if;
  return new;
end;
$function$;

create or replace function public.notify_on_event_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  notice_type text;
  notice_title text;
  notice_message text;
begin
  -- Some deployments publish an event by inserting it as a draft and then
  -- changing its status. Treat that transition like an initial publication.
  if new.status = 'PUBLISHED' and old.status is distinct from 'PUBLISHED' then
    insert into public.notifications (user_id, event_id, title, message, notification_type, is_read)
    values (
      new.organizer_id,
      new.event_id,
      'Event published',
      'Your event, ' || new.title || ', is now on MEHFIL.',
      'event_created',
      false
    );

    insert into public.notifications (user_id, event_id, title, message, notification_type, is_read)
    select
      student.user_id,
      new.event_id,
      'New campus event',
      new.title || ' was added to the MEHFIL calendar.',
      'event_created',
      false
    from public.users as student
    where student.role = 'STUDENT'
      and student.is_active is true
      and student.user_id <> new.organizer_id;
    return new;
  end if;

  if new.status = 'CANCELLED' then
    notice_type := 'event_cancelled';
    notice_title := 'Event cancelled';
    notice_message := new.title || ' has been cancelled.';
  else
    notice_type := 'event_updated';
    notice_title := 'Event updated';
    notice_message := new.title || ' has updated details. Review the event page for the latest information.';
  end if;

  insert into public.notifications (user_id, event_id, title, message, notification_type, is_read)
  values (new.organizer_id, new.event_id, notice_title, 'Your event, ' || notice_message, notice_type, false);

  insert into public.notifications (user_id, event_id, title, message, notification_type, is_read)
  select
    registration.student_id,
    new.event_id,
    notice_title,
    notice_message,
    notice_type,
    false
  from public.registrations as registration
  where registration.event_id = new.event_id
    and registration.registration_status = 'CONFIRMED';

  return new;
end;
$function$;

create or replace function public.notify_on_registration_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  event_title text;
  organizer_user_id uuid;
  student_name text;
  action_type text;
begin
  if tg_op = 'INSERT' and new.registration_status = 'CONFIRMED' then
    action_type := 'CONFIRMED';
  elsif tg_op = 'UPDATE' and old.registration_status is distinct from new.registration_status then
    if new.registration_status = 'CONFIRMED' then
      action_type := 'CONFIRMED';
    elsif new.registration_status = 'CANCELLED' then
      action_type := 'CANCELLED';
    end if;
  elsif tg_op = 'DELETE' and old.registration_status = 'CONFIRMED' then
    -- Also cover cancel_registration implementations that delete the row.
    action_type := 'CANCELLED';
  end if;

  if action_type is not null then
    if tg_op = 'DELETE' then
      select event.title, event.organizer_id into event_title, organizer_user_id
      from public.events as event where event.event_id = old.event_id;
      select profile.full_name into student_name
      from public.users as profile where profile.user_id = old.student_id;
    else
      select event.title, event.organizer_id into event_title, organizer_user_id
      from public.events as event where event.event_id = new.event_id;
      select profile.full_name into student_name
      from public.users as profile where profile.user_id = new.student_id;
    end if;

    if action_type = 'CONFIRMED' then
      insert into public.notifications (user_id, event_id, title, message, notification_type, is_read)
      values (
        new.student_id,
        new.event_id,
        'Registration confirmed',
        'Your place at ' || coalesce(event_title, 'this event') || ' is confirmed.',
        'registration_confirmed',
        false
      );

      if organizer_user_id is not null then
        insert into public.notifications (user_id, event_id, title, message, notification_type, is_read)
        values (
          organizer_user_id,
          new.event_id,
          'New participant',
          coalesce(student_name, 'A student') || ' registered for ' || coalesce(event_title, 'your event') || '.',
          'registration_confirmed',
          false
        );
      end if;
    else
      insert into public.notifications (user_id, event_id, title, message, notification_type, is_read)
      values (
        old.student_id,
        old.event_id,
        'Registration cancelled',
        'Your registration for ' || coalesce(event_title, 'this event') || ' has been cancelled.',
        'registration_cancelled',
        false
      );

      if organizer_user_id is not null then
        insert into public.notifications (user_id, event_id, title, message, notification_type, is_read)
        values (
          organizer_user_id,
          old.event_id,
          'Registration cancelled',
          coalesce(student_name, 'A student') || ' cancelled their registration for ' || coalesce(event_title, 'your event') || '.',
          'registration_cancelled',
          false
        );
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists zzz_notify_event_created on public.events;
drop trigger if exists zzz_notify_event_updated on public.events;
drop trigger if exists zzz_notify_registration_created on public.registrations;
drop trigger if exists zzz_notify_registration_status_changed on public.registrations;
drop trigger if exists zzz_notify_registration_deleted on public.registrations;

create trigger zzz_notify_event_created
  after insert on public.events
  for each row execute function public.notify_on_event_created();

create trigger zzz_notify_event_updated
  after update on public.events
  for each row
  when (
    old.status is distinct from new.status
    or old.title is distinct from new.title
    or old.description is distinct from new.description
    or old.category_name is distinct from new.category_name
    or old.department_name is distinct from new.department_name
    or old.venue is distinct from new.venue
    or old.start_at is distinct from new.start_at
    or old.end_at is distinct from new.end_at
    or old.registration_deadline is distinct from new.registration_deadline
    or old.capacity is distinct from new.capacity
  )
  execute function public.notify_on_event_updated();

create trigger zzz_notify_registration_created
  after insert on public.registrations
  for each row execute function public.notify_on_registration_change();

create trigger zzz_notify_registration_status_changed
  after update on public.registrations
  for each row
  when (old.registration_status is distinct from new.registration_status)
  execute function public.notify_on_registration_change();

create trigger zzz_notify_registration_deleted
  after delete on public.registrations
  for each row execute function public.notify_on_registration_change();

revoke all on function public.notify_on_event_created() from public, anon, authenticated;
revoke all on function public.notify_on_event_updated() from public, anon, authenticated;
revoke all on function public.notify_on_registration_change() from public, anon, authenticated;

drop policy if exists "Members can read their own notifications" on public.notifications;
create policy "Members can read their own notifications"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Members can update their own notifications" on public.notifications;
create policy "Members can update their own notifications"
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
