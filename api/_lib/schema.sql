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

-- ---------- Places, settings, sponsor form, 35-mile radius (added later; safe to run again) ----------
-- The places directory. "badge" is how we know the dog rule (official, venue, readers, unconfirmed,
-- nodogs). "published" shows on the site; "draft" waits for review; "hidden" is kept but not shown.
create table if not exists public.places (
  id text primary key,                         -- used in the page address: /places/<id>/
  status text not null default 'published' check (status in ('published', 'draft', 'hidden')),
  name text not null,
  category text not null check (category in ('restaurant', 'brewery', 'winery', 'coffee', 'trail', 'park', 'dogpark', 'lake', 'shop', 'stay')),
  badge text not null default 'unconfirmed' check (badge in ('venue', 'official', 'readers', 'unconfirmed', 'nodogs')),
  town text, address text,
  lat double precision, lng double precision,
  dog_rule text, source_url text, source_name text, website text, phone text, notes text, description text,
  checked date,
  origin text not null default 'manual',       -- manual | starter | submission | research
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists places_status_idx on public.places (status);
alter table public.places enable row level security;

create table if not exists public.settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;

-- Sponsor inquiries come through the same form system.
alter table public.submissions drop constraint if exists submissions_type_check;
alter table public.submissions add constraint submissions_type_check check (type in ('pup', 'event', 'place', 'fix', 'claim', 'sponsor'));

-- Readers can pick 35 miles.
alter table public.subscribers drop constraint if exists subscribers_radius_check;
alter table public.subscribers add constraint subscribers_radius_check check (radius in (5, 10, 15, 25, 35));

-- ---------- Place feedback (added later; safe to run again) ----------
-- Thumbs up/down plus preset tags on each place page. One row per visitor per place.
-- "voter" is a salted hash of the visitor's IP, never the IP itself.
create table if not exists public.place_feedback (
  id uuid primary key default gen_random_uuid(),
  place_id text not null,
  vote smallint not null check (vote in (1, -1)),
  tags text[] not null default '{}',
  voter text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, voter)
);
create index if not exists place_feedback_place_idx on public.place_feedback (place_id);
alter table public.place_feedback enable row level security;

-- ---------- Place hours (added later; safe to run again) ----------
-- "hours" is machine-readable (Mo-Th 11:00-21:00; Fr-Sa 11:00-22:00) for the Open now label; "hours_text" is for people.
alter table public.places add column if not exists hours text;
alter table public.places add column if not exists hours_text text;

-- ---------- Lost & found (added later; safe to run again) ----------
-- Posts go live when the poster confirms their email (status pending -> active) and come down after
-- 30 days unless renewed. "token" is the poster's private manage link. Email is never shown publicly.
create table if not exists public.lost_found (
  id text primary key,                          -- used in the page address: /lost-found/<id>/
  status text not null default 'pending' check (status in ('pending', 'active', 'reunited', 'hidden', 'removed')),
  kind text not null check (kind in ('lost', 'found')),
  species text not null default 'dog' check (species in ('dog', 'cat', 'other')),
  pet_name text, breed text, color text, sex text, size text, description text,
  last_seen text not null, town text not null,
  lat double precision, lng double precision, approx boolean not null default false,
  date_seen date not null,
  photo_path text,
  contact_name text not null, phone text, show_phone boolean not null default false,
  email text not null,
  token text not null unique,
  ip_hash text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz, expires_at timestamptz, reunited_at timestamptz, reminded_at timestamptz
);
create index if not exists lost_found_status_idx on public.lost_found (status, created_at desc);
alter table public.lost_found enable row level security;

-- Who messaged a post and when (for spam limits). The message itself is emailed, never stored.
create table if not exists public.lost_found_msgs (
  id uuid primary key default gen_random_uuid(),
  post_id text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists lost_found_msgs_ip_idx on public.lost_found_msgs (ip_hash, created_at);
alter table public.lost_found_msgs enable row level security;

-- ---------- Featured partners (added later; safe to run again) ----------
-- Paid monthly listings: a labeled "Sponsored" card on the matching page plus the partner's own page.
-- Running = status 'active' and today between starts_on and ends_on (ends_on blank = no end date).
create table if not exists public.partners (
  id text primary key,                          -- used in the page address: /partners/<id>/
  status text not null default 'active' check (status in ('active', 'paused')),
  name text not null,
  category text not null,
  tagline text, about text, services text,
  address text, town text, lat double precision, lng double precision,
  phone text, website text, booking_url text, hours_text text, offer text,
  photos text[] not null default '{}',          -- private storage paths, served through /partners/<id>/photo/<n>
  place_id text,                                -- their listing in the places directory, if any
  email_mention boolean not null default true,  -- featured in the first Thursday email of each month
  starts_on date not null, ends_on date,
  contact_email text, notes text,               -- private: for the monthly report and your billing notes
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.partners enable row level security;

-- Page views and taps for the monthly report. "visitor" is a scrambled code that changes every day,
-- so one person counts once per day and can't be followed from day to day.
create table if not exists public.partner_events (
  id uuid primary key default gen_random_uuid(),
  partner_id text not null,
  kind text not null,
  day date not null,
  visitor text not null,
  created_at timestamptz not null default now(),
  unique (partner_id, kind, day, visitor)
);
create index if not exists partner_events_day_idx on public.partner_events (day);
alter table public.partner_events enable row level security;

-- ---------- Dog of the Month (added later; safe to run again) ----------
-- Pups are entered by putting the contest month ("2027-01") in submissions.data->>'dotm'.
-- One vote per email per contest; it counts once the voter taps the link we email them (status confirmed).
create table if not exists public.dotm_votes (
  id uuid primary key default gen_random_uuid(),
  contest text not null check (contest ~ '^\d{4}-\d{2}$'),
  pup_id uuid not null,
  email text not null check (email = lower(email)),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  join_email boolean not null default false,
  ip_hash text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (contest, email)
);
create index if not exists dotm_votes_contest_idx on public.dotm_votes (contest, status);
create index if not exists dotm_votes_ip_idx on public.dotm_votes (ip_hash, created_at);
alter table public.dotm_votes enable row level security;
