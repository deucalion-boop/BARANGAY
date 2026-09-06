-- Barangay Community Portal - Supabase schema
-- Run this entire file once in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  "firstName" text not null default '',
  "lastName" text not null default '',
  email text not null unique,
  phone text not null default '',
  address text not null default '',
  "avatarUrl" text not null default '',
  "unitNumber" text unique,
  role text not null default 'resident' check (role in ('resident', 'admin')),
  "isActive" boolean not null default false,
  "lastLogin" timestamptz,
  "lastLogout" timestamptz,
  "loginCount" integer not null default 0 check ("loginCount" >= 0),
  "profileCompleted" boolean not null default false,
  "emailVerified" boolean not null default false,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.appointment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  duration integer not null default 30 check (duration between 5 and 480),
  color text not null default '#4299e1',
  icon text not null default 'fas fa-calendar-check',
  "isActive" boolean not null default true,
  "requiresApproval" boolean not null default false,
  "allowedRoles" text[] not null default array['resident','admin'],
  "maxParticipants" integer not null default 1 check ("maxParticipants" >= 1),
  "preparationTime" integer not null default 0,
  "bufferTime" integer not null default 0,
  instructions text not null default '',
  requirements text[] not null default '{}',
  "hasFee" boolean not null default false,
  "feeAmount" numeric(12,2) not null default 0,
  "feeCurrency" text not null default 'PHP',
  "advanceBookingDays" integer not null default 30,
  "minCancellationHours" integer not null default 24,
  "availableDays" integer[] not null default array[1,2,3,4,5],
  "startTime" text not null default '09:00',
  "endTime" text not null default '17:00',
  "createdBy" uuid references public.profiles(id) on delete set null,
  "updatedBy" uuid references public.profiles(id) on delete set null,
  "lastModifiedBy" uuid references public.profiles(id) on delete set null,
  "usageCount" integer not null default 0,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  "patientId" uuid not null references public.profiles(id) on delete cascade,
  "doctorId" uuid references public.profiles(id) on delete set null,
  "appointmentDate" text not null,
  "appointmentTime" text not null,
  "appointmentType" text not null,
  status text not null default 'pending' check (status in ('pending','scheduled','completed','cancelled','no-show')),
  notes text not null default '',
  "declineReason" text,
  recommendation text,
  "createdBy" uuid not null references public.profiles(id) on delete cascade,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  "imageUrl" text,
  type text not null default 'general' check (type in ('general','emergency','maintenance','event','urgent')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  "isArchived" boolean not null default false,
  "isActive" boolean not null default true,
  "expiryDate" timestamptz,
  "scheduleDate" timestamptz,
  "createdBy" uuid not null references public.profiles(id) on delete restrict,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.announcement_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  type text not null default 'general' check (type in ('general','emergency','maintenance','event','community')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  "requestedBy" uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','published')),
  "reviewedBy" uuid references public.profiles(id) on delete set null,
  "reviewedAt" timestamptz,
  "rejectionReason" text,
  "adminNotes" text,
  "announcementId" uuid references public.announcements(id) on delete set null,
  "requestReason" text,
  "targetAudience" text[] not null default array['all'],
  "specificUnits" text[] not null default '{}',
  "proposedExpiryDate" timestamptz,
  "isUrgent" boolean not null default false,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.resident_requests (
  id uuid primary key default gen_random_uuid(),
  "firstName" text not null,
  "lastName" text,
  email text not null,
  phone text,
  "unitNumber" text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  "createdBy" uuid references public.profiles(id) on delete cascade,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.schedule_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start text not null,
  "end" text,
  "appointmentType" text,
  requester uuid references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','reschedule_requested','expired')),
  "declineReason" text,
  recommendation text,
  "adminId" uuid references public.profiles(id) on delete set null,
  "approvedAt" timestamptz,
  "rescheduleReason" text,
  "rescheduleNotes" text,
  "rescheduleRequestedAt" timestamptz,
  "newStart" text,
  "newEnd" text,
  "rescheduleStatus" text default 'pending' check ("rescheduleStatus" in ('pending','approved','rejected')),
  "rescheduleApprovedAt" timestamptz,
  "expiredAt" timestamptz,
  "adminNotes" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  "itemId" text not null unique,
  "itemName" text not null,
  category text not null check (category in ('medication','medical-supplies','fluids','equipment','other')),
  location text not null check (location in ('pharmacy','pediatrics','surgery','emergency','storage')),
  "currentStock" numeric not null default 0 check ("currentStock" >= 0),
  "reorderPoint" numeric not null default 0 check ("reorderPoint" >= 0),
  "expirationDate" timestamptz,
  supplier text not null default '',
  "unitPrice" numeric(12,2) not null default 0,
  description text not null default '',
  status text not null default 'in-stock' check (status in ('in-stock','low-stock','critical-stock','out-of-stock','expired')),
  "lastUpdated" timestamptz not null default now(),
  "createdBy" uuid not null references public.profiles(id) on delete restrict,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'general' check (type in ('reschedule_request','appointment_approved','appointment_rejected','general')),
  "relatedId" uuid,
  "isRead" boolean not null default false,
  "readAt" timestamptz,
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  "actionUrl" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  "updatedAt" timestamptz not null default now()
);

create index if not exists appointments_patient_idx on public.appointments("patientId");
create index if not exists appointments_date_idx on public.appointments("appointmentDate", "appointmentTime");
create index if not exists appointments_status_idx on public.appointments(status);
create index if not exists announcements_active_idx on public.announcements("isActive", "isArchived", "createdAt" desc);
create index if not exists schedule_requests_requester_idx on public.schedule_requests(requester, "createdAt" desc);
create index if not exists schedule_requests_status_idx on public.schedule_requests(status);
create index if not exists resident_requests_status_idx on public.resident_requests(status);
create index if not exists notifications_user_idx on public.notifications("userId", "isRead", "createdAt" desc);
create index if not exists inventory_status_idx on public.inventory(status, "isActive");
create index if not exists inventory_expiration_idx on public.inventory("expirationDate");

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','appointment_types','appointments','announcements','announcement_requests','resident_requests','schedule_requests','inventory','notifications','app_settings']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name);
  end loop;
end $$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id, email, "firstName", "lastName", phone, "unitNumber", role, "isActive", "emailVerified"
  ) values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'firstName', new.raw_user_meta_data ->> 'username', ''),
    coalesce(new.raw_user_meta_data ->> 'lastName', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'unitNumber', ''),
    coalesce(new.raw_app_meta_data ->> 'role', 'resident'),
    coalesce(new.raw_app_meta_data ->> 'role', 'resident') = 'admin',
    new.email_confirmed_at is not null
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    "updatedAt" = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data, raw_app_meta_data on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill Auth users that existed before this schema was installed.
insert into public.profiles (id, email, "firstName", "lastName", role, "isActive", "emailVerified")
select
  id,
  coalesce(email, ''),
  coalesce(raw_user_meta_data ->> 'firstName', raw_user_meta_data ->> 'username', ''),
  coalesce(raw_user_meta_data ->> 'lastName', ''),
  coalesce(raw_app_meta_data ->> 'role', 'resident'),
  case when coalesce(raw_app_meta_data ->> 'role', 'resident') = 'admin' then true else false end,
  email_confirmed_at is not null
from auth.users
on conflict (id) do update set role = excluded.role, "isActive" = excluded."isActive";

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and "isActive" = true
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and "isActive" = true
  );
$$;

grant usage on schema public to anon, authenticated, service_role;
revoke all on all tables in schema public from anon, authenticated;
grant select on public.announcements, public.appointment_types to anon;
grant select on public.profiles to authenticated;
grant update ("firstName", "lastName", phone, address, "avatarUrl", "profileCompleted", "updatedAt") on public.profiles to authenticated;
grant select, insert, update, delete on
  public.appointment_types,
  public.appointments,
  public.announcements,
  public.announcement_requests,
  public.resident_requests,
  public.schedule_requests,
  public.inventory,
  public.notifications,
  public.app_settings
to authenticated;
grant all on all tables in schema public to service_role;
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_active_user() to anon, authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.appointment_types enable row level security;
alter table public.appointments enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_requests enable row level security;
alter table public.resident_requests enable row level security;
alter table public.schedule_requests enable row level security;
alter table public.inventory enable row level security;
alter table public.notifications enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using ((id = auth.uid() and public.is_active_user()) or public.is_admin()) with check ((id = auth.uid() and public.is_active_user()) or public.is_admin());

drop policy if exists appointment_types_read on public.appointment_types;
create policy appointment_types_read on public.appointment_types for select to anon, authenticated using ("isActive" or public.is_admin());
drop policy if exists appointment_types_admin on public.appointment_types;
create policy appointment_types_admin on public.appointment_types for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to anon, authenticated using (("isActive" and not "isArchived") or public.is_admin());
drop policy if exists announcements_admin on public.announcements;
create policy announcements_admin on public.announcements for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists appointments_own on public.appointments;
create policy appointments_own on public.appointments for select to authenticated using ((public.is_active_user() and ("patientId" = auth.uid() or "doctorId" = auth.uid())) or public.is_admin());
drop policy if exists appointments_insert on public.appointments;
create policy appointments_insert on public.appointments for insert to authenticated with check ((public.is_active_user() and "patientId" = auth.uid()) or public.is_admin());
drop policy if exists appointments_admin_write on public.appointments;
create policy appointments_admin_write on public.appointments for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists appointments_admin_delete on public.appointments;
create policy appointments_admin_delete on public.appointments for delete to authenticated using (public.is_admin());

drop policy if exists announcement_requests_own on public.announcement_requests;
create policy announcement_requests_own on public.announcement_requests for select to authenticated using ((public.is_active_user() and "requestedBy" = auth.uid()) or public.is_admin());
drop policy if exists announcement_requests_insert on public.announcement_requests;
create policy announcement_requests_insert on public.announcement_requests for insert to authenticated with check (public.is_active_user() and "requestedBy" = auth.uid());
drop policy if exists announcement_requests_admin on public.announcement_requests;
create policy announcement_requests_admin on public.announcement_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists resident_requests_own on public.resident_requests;
create policy resident_requests_own on public.resident_requests for select to authenticated using ("createdBy" = auth.uid() or public.is_admin());
drop policy if exists resident_requests_insert on public.resident_requests;
create policy resident_requests_insert on public.resident_requests for insert to authenticated with check ("createdBy" = auth.uid());
drop policy if exists resident_requests_admin on public.resident_requests;
create policy resident_requests_admin on public.resident_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists schedule_requests_own on public.schedule_requests;
create policy schedule_requests_own on public.schedule_requests for select to authenticated using ((public.is_active_user() and requester = auth.uid()) or public.is_admin());
drop policy if exists schedule_requests_insert on public.schedule_requests;
create policy schedule_requests_insert on public.schedule_requests for insert to authenticated with check (public.is_active_user() and requester = auth.uid());
drop policy if exists schedule_requests_admin on public.schedule_requests;
create policy schedule_requests_admin on public.schedule_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for select to authenticated using ((public.is_active_user() and "userId" = auth.uid()) or public.is_admin());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated using ((public.is_active_user() and "userId" = auth.uid()) or public.is_admin()) with check ((public.is_active_user() and "userId" = auth.uid()) or public.is_admin());
drop policy if exists notifications_admin on public.notifications;
create policy notifications_admin on public.notifications for insert to authenticated with check (public.is_admin());

drop policy if exists inventory_admin on public.inventory;
create policy inventory_admin on public.inventory for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists settings_admin on public.app_settings;
create policy settings_admin on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.app_settings (key, value) values
  ('emailNotifications', 'true'::jsonb),
  ('scheduleExpiryDays', '3'::jsonb),
  ('allowUserRegistration', 'true'::jsonb),
  ('siteTagline', '"Serving Our Community"'::jsonb),
  ('siteDescription', '"Welcome to our Barangay Health Center management system."'::jsonb),
  ('language', '"en"'::jsonb)
on conflict (key) do nothing;

-- Public media bucket. Uploads are performed by the trusted Express backend.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-media',
  'portal-media',
  true,
  5242880,
  array['image/jpeg','image/png','image/gif','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists portal_media_public_read on storage.objects;
create policy portal_media_public_read on storage.objects
for select to public using (bucket_id = 'portal-media');

drop policy if exists portal_media_admin_insert on storage.objects;
create policy portal_media_admin_insert on storage.objects
for insert to authenticated with check (bucket_id = 'portal-media' and public.is_admin());

drop policy if exists portal_media_admin_update on storage.objects;
create policy portal_media_admin_update on storage.objects
for update to authenticated using (bucket_id = 'portal-media' and public.is_admin());

drop policy if exists portal_media_admin_delete on storage.objects;
create policy portal_media_admin_delete on storage.objects
for delete to authenticated using (bucket_id = 'portal-media' and public.is_admin());

drop policy if exists portal_media_avatar_insert on storage.objects;
create policy portal_media_avatar_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'portal-media'
  and public.is_active_user()
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists portal_media_avatar_update on storage.objects;
create policy portal_media_avatar_update on storage.objects
for update to authenticated using (
  bucket_id = 'portal-media'
  and public.is_active_user()
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists portal_media_avatar_delete on storage.objects;
create policy portal_media_avatar_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'portal-media'
  and public.is_active_user()
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);
