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

-- ---------- Submissions (added later; safe to run again) ----------
-- Pup photos, event and place suggestions, listing fixes, business claims. Reviewed by hand.
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('pup', 'event', 'place', 'fix', 'claim')),
  status text not null default 'new' check (status in ('new', 'approved', 'rejected', 'done')),
  email text,
  data jsonb not null default '{}'::jsonb,
  photo_path text,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists submissions_created_idx on public.submissions (created_at desc);
alter table public.submissions enable row level security;

-- Private bucket for pup photos (only the server can read or write).
insert into storage.buckets (id, name, public) values ('submissions', 'submissions', false)
on conflict (id) do nothing;

-- ---------- Admin page columns (added later; safe to run again) ----------
alter table public.submissions add column if not exists admin_note text;
alter table public.submissions add column if not exists reviewed_at timestamptz;
alter table public.submissions add column if not exists featured_at timestamptz;

-- ---------- Events (added later; safe to run again) ----------
-- The events calendar. "published" shows on the site and in the email; "draft" waits in the
-- admin's Suggested list (from calendar feeds or submissions); "hidden" is kept but not shown.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'published' check (status in ('published', 'draft', 'hidden')),
  date date not null,
  end_date date,
  start_time text,
  end_time text,
  title text not null,
  type text not null default 'dog' check (type in ('dog', 'adopt', 'foster')),
  venue text, town text, address text,
  lat double precision, lng double precision,
  cost text, dog_rule text, url text, source_name text, notes text,
  checked date,
  origin text not null default 'manual',      -- manual | starter | submission | feed
  source_key text unique,                      -- feed item id, so the importer never adds a duplicate
  feed_raw text,                               -- what the feed said, for review
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_date_idx on public.events (date);
alter table public.events enable row level security;
