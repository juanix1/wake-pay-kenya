-- Wake & Pay Kenya starter database
-- Apply in Supabase SQL Editor. Review policies before production deployment.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  device_label text not null,
  device_fingerprint_hash text,
  consented_at timestamptz,
  consent_version text,
  activation_status text not null default 'pending'
    check (activation_status in ('pending','active','inactive','revoked')),
  activated_by uuid references public.profiles(id),
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.fee_settings (
  id uuid primary key default gen_random_uuid(),
  snooze_fee_kes integer not null default 10 check (snooze_fee_kes > 0),
  stop_fee_kes integer not null default 50 check (stop_fee_kes > 0),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.alarms (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  label text not null default 'Wake up',
  scheduled_at timestamptz not null,
  timezone text not null default 'Africa/Nairobi',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  device_id uuid not null references public.devices(id),
  alarm_id uuid references public.alarms(id),
  action_type text not null check (action_type in ('snooze','stop')),
  amount_kes integer not null check (amount_kes > 0),
  phone_number text,
  merchant_request_id text unique,
  checkout_request_id text unique,
  mpesa_receipt_number text unique,
  status text not null default 'pending'
    check (status in ('pending','paid','failed','cancelled')),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.device_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.fee_settings enable row level security;
alter table public.alarms enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.device_events enable row level security;

-- Users may read/update only their own basic profile.
create policy "profile read own" on public.profiles
for select to authenticated using (id = auth.uid());
create policy "profile update own" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Owners can view their own devices. Activation changes must be server-side.
create policy "owner read devices" on public.devices
for select to authenticated using (owner_id = auth.uid());

-- Owners can view their alarms and transactions.
create policy "owner read alarms" on public.alarms
for select to authenticated using (
  exists (select 1 from public.devices d where d.id = device_id and d.owner_id = auth.uid())
);
create policy "owner read payments" on public.payment_transactions
for select to authenticated using (owner_id = auth.uid());

-- Owners can view device events belonging to their devices.
create policy "owner read device events" on public.device_events
for select to authenticated using (
  exists (select 1 from public.devices d where d.id = device_id and d.owner_id = auth.uid())
);

-- No client-side insert/update policies are granted for devices, fee settings,
-- payment transactions, or device events. Trusted server functions using the
-- service role must validate admin permissions and owner consent before writes.
-- Never expose the Supabase service-role key in the browser or Android app.

insert into public.fee_settings (snooze_fee_kes, stop_fee_kes)
select 10, 50
where not exists (select 1 from public.fee_settings);
