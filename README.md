# MEHFIL

A responsive campus event discovery and management app built with React, Vite, Tailwind CSS, Supabase, and Lucide.

## Run locally

1. Install Node.js 20+ and Java 17+.
2. Copy .env.example to .env.local and set the existing Supabase project URL and publishable/anon key.
3. Run npm.cmd install, then npm.cmd run dev on Windows (or npm install && npm run dev elsewhere).

The app uses the existing users, events, registrations, attendance, and notifications tables and existing registration/admin RPCs. Apply the SQL migration in supabase/migrations before using organizer participant views: it syncs signup name, email, phone, student number, department, and organization name from Supabase Auth into public.users, backfills existing profiles, and grants organizers scoped reads of profiles registered for their events. Student signups receive the database default STUDENT role. Organiser signups use register-organizer, a server-side function that verifies the signed-in user and updates only that user profile; Admin is never offered publicly. The role used by the app is always read back from public.users. College, year of study, organization type, and designation remain in Supabase Auth metadata because those fields are not part of the public profile.

Apply SQL migrations in order in the Supabase SQL Editor. `20261115000200_persist_notifications.sql` creates in-app notifications for published events, event updates/cancellations, and student registrations/cancellations. These notices are stored independently of email delivery.

The light/dark appearance choice persists on this device. Saved event bookmarks are also stored per user on this device because the supplied schema has no saved-events table.

Deploy the organizer onboarding and account removal functions with supabase functions deploy register-organizer and supabase functions deploy delete-account. Organizer activation checks the authenticated user and updates only that profile. Account removal uses the existing foreign-key behavior and will return an error if campus records prevent deletion.


## Checks

- npm.cmd test runs unit tests for event relationships, role access, filtering, and saved-event scoping.
- npm.cmd run build creates the production bundle.
- supabase/tests/security_contract.sql contains read-only database contract checks for foreign keys, role RPC availability, RLS enablement, and direct self-recursive policies. Run it against Supabase with the CLI/pgTAP test runner.

## Email delivery

The app invokes the event-email-notify Supabase Edge Function after confirmed registrations, cancellations, and organizer event changes. Deploy it with supabase functions deploy event-email-notify. Configure RESEND_API_KEY and EMAIL_FROM with supabase secrets set before deployment. The function verifies user ownership and keeps the Supabase service key on the server.

## Java ticket validator

The standalone CLI in ticket-validator/ validates confirmed registration tickets from a CSV export and prevents a second local check-in. It is an offline companion to the organizer web check-in screen, which writes attendance through the existing attendance table.

    cd ticket-validator
    javac TicketValidator.java
    java TicketValidator tickets.csv <registration-uuid>

CSV header: registration_id,event_id,registration_status. The offline CLI is for import/export workflows; use the authenticated web check-in to persist attendance in Supabase.


