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

## Email delivery with Gmail

Event email uses the `event-email-notify` Supabase Edge Function and a Google Apps Script relay. This lets a Gmail account send event confirmations without owning a domain. Copy `supabase/apps-script-mail-relay/Code.gs` into a new Apps Script project while signed in as the sender account. In Project Settings, add a Script Property named `MEHFIL_MAIL_RELAY_TOKEN` with a long random value. Deploy the script as a Web app that executes as you and is accessible to anyone; the token protects the endpoint. Copy its `/exec` URL.

In Supabase Edge Function Secrets, set `GMAIL_RELAY_URL` to that `/exec` URL and `GMAIL_RELAY_SECRET` to the same token. Then deploy with `supabase functions deploy event-email-notify`. The function verifies the signed-in user and matching registration before calling the relay. A personal Gmail account has an Apps Script email quota of 100 recipients per day; quotas can change.

## Java ticket validator

Organizers can use the Java CLI to validate tickets and record check-ins when the venue has no internet. In **Participants**, choose an event and export its ticket CSV. The file contains only registration ID, event ID, and registration status. Copy it to a laptop at the check-in desk.

From PowerShell:

```powershell
cd D:\path\to\Mehfil_version_2\ticket-validator
javac TicketValidator.java
java TicketValidator D:\path\to\mehfil-tickets.csv
```

The CLI prompts for an event if the file contains more than one, then accepts scanned or typed registration UUIDs until you enter `q`. It accepts only `CONFIRMED` registrations for the selected event and prevents duplicate check-ins across sessions. Each accepted scan is appended to `checked-in.csv` beside the ticket export. The ticket list is a snapshot from the time of export, so export it close to the event; status changes made after export are not visible until the check-ins are imported and verified online.

When the connection is available again, open the organizer **Check-in desk**, choose the same event, and import `checked-in.csv`. MEHFIL verifies each row against that event’s confirmed registrations and records valid arrivals in Supabase. Rows for another event, cancelled or unknown registrations, duplicate rows, and attendees already marked present are skipped.

To specify the event directly, pass `--event <event-uuid>`. For a single ticket, use `--check <registration-uuid>`. The ticket export header is `registration_id,event_id,registration_status`; the check-in file header is `registration_id,event_id,checked_in_at,attendance_status`. Online organizers can continue to use the web check-in desk, which records attendance immediately.


