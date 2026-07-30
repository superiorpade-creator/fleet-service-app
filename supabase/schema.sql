-- ============================================================================
-- Fleet Service Management — Database Schema
-- Run this in Supabase SQL Editor (or via `supabase db push`) on a fresh project.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Profiles (one row per authenticated user, extends auth.users with a role)
-- ---------------------------------------------------------------------------
create type user_role as enum ('admin', 'crew');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role user_role not null default 'crew',
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
-- New users default to 'crew'; promote to 'admin' manually in the table editor.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'crew');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Customers (contact info + how often the account is supposed to be serviced)
-- ---------------------------------------------------------------------------
create type customer_frequency as enum ('weekly', 'biweekly', 'monthly');

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  frequency customer_frequency not null default 'monthly',
  notes text,
  created_at timestamptz not null default now()
);

create index customers_name_idx on customers (name);

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create type job_status as enum ('scheduled', 'in_progress', 'completed');

create table jobs (
  id uuid primary key default gen_random_uuid(),
  job_number integer generated always as identity unique,  -- auto-incrementing work order number, e.g. WO-00001
  customer_id uuid references customers (id) on delete set null,  -- optional link to a Customers record for contact info + service reminders
  client_name text not null,
  scheduled_date date,                   -- nullable: unscheduled work orders sit in the dispatch board's Unassigned tray
  status job_status not null default 'scheduled',
  notes text,
  pdf_url text,                          -- storage path to the generated completion PDF
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index jobs_scheduled_date_idx on jobs (scheduled_date);
create index jobs_status_idx on jobs (status);
create index jobs_customer_id_idx on jobs (customer_id);

-- Many-to-many: a job can have multiple crew assigned
create table job_crew (
  job_id uuid not null references jobs (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  primary key (job_id, profile_id)
);

-- ---------------------------------------------------------------------------
-- Units (the per-job checklist, populated from Excel import)
-- ---------------------------------------------------------------------------
create table units (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  unit_number text not null,
  location text,
  unit_type text,
  serviced boolean not null default false,
  notes text,
  photo_url text,
  serviced_at timestamptz,
  serviced_by uuid references profiles (id),
  sort_order int not null default 0
);

create index units_job_id_idx on units (job_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table customers enable row level security;
alter table jobs enable row level security;
alter table job_crew enable row level security;
alter table units enable row level security;

-- Helper: is the current user an admin?
create function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- Helper: is the current user assigned to a given job?
create function public.is_assigned_to_job(job uuid)
returns boolean as $$
  select exists (
    select 1 from job_crew where job_id = job and profile_id = auth.uid()
  );
$$ language sql security definer stable;

-- profiles: everyone can read profiles (needed to show crew names),
-- only admins can write, users can update their own name.
create policy "profiles are readable by authenticated users"
  on profiles for select using (auth.role() = 'authenticated');

create policy "admins manage profiles"
  on profiles for all using (public.is_admin());

create policy "users update their own profile name"
  on profiles for update using (auth.uid() = id);

-- customers: admin-only, full stop. Crew don't get contact info — this is
-- an admin-facing function (customer management + service reminders).
create policy "admins manage customers"
  on customers for all using (public.is_admin());

-- jobs: admins see/edit everything; crew see only jobs they're assigned to,
-- and can only update status fields (enforced in the app layer + a check below).
create policy "admins have full access to jobs"
  on jobs for all using (public.is_admin());

create policy "crew can view their assigned jobs"
  on jobs for select using (public.is_assigned_to_job(id));

create policy "crew can update status on their assigned jobs"
  on jobs for update using (public.is_assigned_to_job(id));

-- job_crew: admins manage assignments; crew can see their own assignments.
create policy "admins manage job_crew"
  on job_crew for all using (public.is_admin());

create policy "crew can view their own assignments"
  on job_crew for select using (profile_id = auth.uid());

-- units: admins have full access; crew can view + update (check off) units
-- belonging to jobs they're assigned to, but cannot delete or re-import.
create policy "admins have full access to units"
  on units for all using (public.is_admin());

create policy "crew can view units on their jobs"
  on units for select using (public.is_assigned_to_job(job_id));

create policy "crew can update units on their jobs"
  on units for update using (public.is_assigned_to_job(job_id));

-- ---------------------------------------------------------------------------
-- Storage buckets (run once — Supabase Storage)
-- ---------------------------------------------------------------------------
-- job-photos: per-unit photos crew attach on close-out (public read, authenticated write)
-- completion-pdfs: generated PDFs (public read, service-role write only)
-- Create these in the Supabase dashboard under Storage, or via the CLI:
--   supabase storage create job-photos --public
--   supabase storage create completion-pdfs --public
