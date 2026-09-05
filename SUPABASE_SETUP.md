# Supabase setup

The application now uses Supabase Auth for the administrator identity. The
remaining resident, appointment, inventory, announcement, and request models
still use Mongoose and must be migrated to Supabase Postgres separately.

## Create or update the administrator

1. Put your project URL and keys in `.env`.
2. Replace `SUPABASE_ADMIN_EMAIL`, `SUPABASE_ADMIN_USERNAME`, and
   `SUPABASE_ADMIN_PASSWORD` with the credentials you want.
3. Run:

   ```powershell
   npm run supabase:create-admin
   ```

The command creates the user in **Supabase Dashboard > Authentication > Users**,
confirms the email, and stores `role: admin` in both app and user metadata. If
the email already exists, it updates that user instead.

Start the application with `npm start`. The existing admin login form accepts
either the configured username or email and authenticates the password through
Supabase Auth.

## Suggested prompts for the remaining migration

Migrate one feature at a time so each schema and route can be verified.

1. `Create Supabase SQL migrations with RLS policies for resident profiles, then replace the Mongoose User model and resident registration/login routes with Supabase Auth and Postgres.`
2. `Migrate appointments, appointment types, and schedule requests from Mongoose to Supabase Postgres, preserving current API responses and admin screens.`
3. `Migrate announcements and announcement requests to Supabase Postgres and move announcement images to Supabase Storage with admin-only write policies.`
4. `Migrate inventory and notifications to Supabase, add appropriate indexes and RLS policies, and remove the remaining MongoDB/Mongoose dependencies and files.`

After each phase, test registration, login, authorization, CRUD operations, and
RLS using both an admin and resident account before removing MongoDB code.
