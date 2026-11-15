# MEHFIL

**Where campus comes together.** MEHFIL helps students discover campus events and gives organizers the tools to publish events, manage registrations, and check in attendees.

## What you can do

- Browse and filter published events by category, department, date, and location.
- Register for events, manage registrations, save events, and receive in-app updates.
- Create and manage events as an organizer, review participants, and record attendance.
- Manage users, events, registrations, and attendance with an administrator account.
- Switch between light and dark themes.
- Use a separate Java command-line tool to validate exported event tickets offline.

Theme preference and saved-event bookmarks are stored in the current browser, so they do not sync between devices.

## Built with

- React and Vite
- React Router
- Supabase Auth, Postgres, and Edge Functions
- Lucide icons
- Vitest for unit tests
- Java for the optional ticket validator

## Run the web app locally

### Requirements

- Node.js 20 or newer and npm
- Access to a configured MEHFIL Supabase project

### Setup

1. Clone this repository from GitHub and open its folder in a terminal.
2. Install the dependencies:

   ```sh
   npm ci
   ```

3. Copy `.env.example` to `.env.local` and add your Supabase project URL and publishable/anon key:

   ```text
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
   ```

4. Start the development server:

   ```sh
   npm run dev
   ```

Vite prints a local URL in the terminal when the app is ready. To create and preview a production build, run `npm run build` followed by `npm run preview`.

Keep `.env.local` private. It is excluded by `.gitignore`; never put a Supabase service-role key in browser environment variables.

## Supabase setup

MEHFIL connects to an existing Supabase database. It expects the `public.users`, `public.events`, `public.registrations`, `public.attendance`, and `public.notifications` tables, plus the `register_for_event`, `cancel_registration`, and `admin_set_user_role` RPCs. This repository contains add-on migrations for that schema; it does not include the initial database schema or all of those RPC definitions. Set up those database objects and their row-level security policies before connecting a new Supabase project.

Apply the migrations in `supabase/migrations` in filename order using the Supabase SQL Editor:

1. `20261115000100_sync_signup_profile_data.sql` syncs and backfills signup profile fields in `public.users` and lets organizers read profiles for people registered for their events.
2. `20261115000200_persist_notifications.sql` creates in-app notifications for published or updated events and registration confirmations or cancellations. Notifications are stored in the database and do not depend on email delivery.

The app reads account roles from `public.users`. Public signup is for students and organizers; administrator access must be granted through a trusted admin process. College, year of study, organization type, and designation are stored in Supabase Auth metadata rather than the current `public.users` profile schema.

### Edge Functions

Organizer onboarding and account deletion use Supabase Edge Functions. After installing and configuring the [Supabase CLI](https://supabase.com/docs/guides/cli), link it to your project and deploy:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy register-organizer
supabase functions deploy delete-account
```

Event email delivery is optional. To enable it, deploy `event-email-notify` and configure the Resend sender and API key as Supabase secrets:

```sh
supabase functions deploy event-email-notify
supabase secrets set RESEND_API_KEY=YOUR_RESEND_API_KEY EMAIL_FROM=notifications@example.com
```

Without email configuration, database-backed in-app notifications still work. The database migration for notifications must be applied separately as described above.

## Unit tests and database checks

Run the JavaScript unit tests and production build with:

```sh
npm test
npm run build
```

`supabase/tests/security_contract.sql` contains database contract checks for expected tables, foreign keys, role-management functions, and row-level security. It requires the project schema and the Supabase CLI/pgTAP test setup.

## Offline ticket validator

The optional CLI in `ticket-validator/` checks a registration against a CSV export. It accepts only `CONFIRMED` registrations and records local check-ins in `checked-in.txt`; it does not write attendance to Supabase. The authenticated organizer check-in page is the web workflow that records attendance in the database.

The CSV must contain these columns:

```csv
registration_id,event_id,registration_status
```

With Java 17 or newer, run the sample from the project root:

```sh
cd ticket-validator
javac TicketValidator.java
java TicketValidator tickets.example.csv 00000000-0000-0000-0000-000000000001
```

Replace the sample UUID with a registration UUID from your own export.
