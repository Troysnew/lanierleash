-- Lanier Leash newsletter tables. Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  zip text not null check (zip ~ '^\d{5}$'),
  radius int not null default 15 check (radius in (5, 10, 15, 25)),
  lat double precision not null,
  lng double precision not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
  token text not null unique,
  source text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  last_confirm_sent_at timestamptz
);
create index if not exists subscribers_status_idx on public.subscribers (status);

create table if not exists public.sends (
  week date primary key,            -- the Thursday the issue went out (Eastern time)
  status text not null,             -- sending | sent | failed | skipped
  subject text,
  count int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  sent_at timestamptz
);

-- Only the server (service-role key) can read or write. No public policies on purpose.
alter table public.subscribers enable row level security;
alter table public.sends enable row level security;
