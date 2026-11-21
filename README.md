# MEHFIL

A responsive campus event discovery and management app built with React, Vite, Tailwind CSS, Supabase, and Lucide.

## Run locally

1. Install Node.js 20+ and Java 17+.
2. Copy .env.example to .env.local and set the existing Supabase project URL and publishable/anon key.
3. Run npm.cmd install, then npm.cmd run dev on Windows (or npm install && npm run dev elsewhere).

The app uses the existing users, events, registrations, attendance, and notifications tables and existing registration/admin RPCs. Apply the SQL migrations in `supabase/migrations` in order. The signup profile migration syncs signup details into `public.users`, backfills existing profiles, and grants organizers scoped reads of registered student profiles. Student and organizer signups both begin with the STUDENT role. Organizer signups create a pending access request; an active admin must approve it before organizer tools become available. A confirmed organizer request creates an in-app notification for active admins. Admin is never offered publicly. College, year of study, organization type, and designation remain in Supabase Auth metadata because those fields are not part of the public profile.

Apply SQL migrations in order in the Supabase SQL Editor. `20261115000200_persist_notifications.sql` creates in-app notifications for published events, event updates/cancellations, and student registrations/cancellations. These notices are stored independently of email delivery.

The light/dark appearance choice persists on this device. Saved event bookmarks are also stored per user on this device because the supplied schema has no saved-events table.

Deploy the retired `register-organizer` function to replace any older auto-promotion implementation, and deploy account removal:

```sh
supabase functions deploy register-organizer
supabase functions deploy delete-account
```

Account removal uses the existing foreign-key behavior and will return an error if campus records prevent deletion.


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


