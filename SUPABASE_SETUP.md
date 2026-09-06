# Supabase setup

The application uses Supabase for authentication, Postgres data, and uploaded
images. MongoDB and Mongoose are no longer runtime dependencies.

## 1. Create the database

1. Open the Supabase project.
2. Go to **SQL Editor** and create a new query.
3. Copy all of `supabase/schema.sql` into the editor.
4. Select **Run**.

Then verify the installation:

```powershell
npm run supabase:check
```

The script creates the profile, appointment, scheduling, announcement,
inventory, notification, and settings tables. It also creates indexes, the Auth
profile trigger, Row Level Security policies, and the `portal-media` Storage
bucket.

The script is idempotent and can be run again when no incompatible manual schema
changes have been made.

## 2. Synchronize the administrator

Set the desired administrator credentials in `.env`, then run:

```powershell
npm run supabase:create-admin
```

This creates or updates the Supabase Auth user and stores `role: admin` in its
trusted app metadata. The database SQL backfills a matching `profiles` record.

## 3. Start and verify

```powershell
npm install
npm start
```

Verify these workflows:

1. Admin login and dashboard statistics.
2. Resident registration, pending approval, approval, and login.
3. Schedule request approval and appointment management.
4. Announcement CRUD and image upload.
5. Inventory CRUD and status changes.
6. Resident notifications, settings, avatar upload, and account deletion.

## Security

- Keep `SUPABASE_SECRET_KEY` only in the server's `.env` or hosting provider's
  encrypted environment variables.
- Never put the secret key in EJS, browser JavaScript, or `.env.example`.
- Use the publishable key for browser clients and enforce RLS for direct browser
  access.
- Change the default admin and session passwords before deployment.
