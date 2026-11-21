# Lanier Leash

Static homepage for lanierleash.com. No build step: `index.html`, `favicon.svg` and `img/` are served as they are.

Deploy: hosted on Vercel (no build command, publish directory `/`). Pushing to `main` deploys.

Data lives in Supabase (subscribers, submissions, events, places, settings). The CSVs in `data/` are the fallback and the import source.

## Weekly email

Runs on Vercel: serverless functions in `/api`, subscribers in Supabase, sending through Resend.

- `POST /api/subscribe`: sign-up form. Saves the address as pending and sends a confirm email.
- `GET /api/confirm?t=`: confirms the address, sends the welcome email, then goes to `/confirmed/`.
- `/api/manage`: backs the `/manage/` page (change ZIP or radius, unsubscribe, resubscribe).
- `/api/unsubscribe?t=`: one-click unsubscribe. Handles the Gmail/Yahoo button (POST) and the footer link (GET).
- `/api/cron/weekly`: the Thursday email. Runs at 11:00 and 12:00 UTC; whichever lands at 7 AM ET or later sends, once per week.
- `/api/preview?key=ADMIN_KEY`: see the weekly email in the browser. Add `&to=you@example.com` to send yourself a test, or `&type=confirm|welcome` to see those emails.
- Table setup: `api/_lib/schema.sql`.

Environment variables (Vercel → Settings → Environment Variables): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `MAILING_ADDRESS`, `SITE_URL`, `CRON_SECRET`, `ADMIN_KEY`.

## Places directory

- Live places are in the Supabase `places` table, edited in **/admin/ → Places**. Until that table has rows, the site reads `data/places.csv`.
- Categories: restaurant, brewery, winery, coffee, trail, park, dogpark, lake, shop, stay. The "badge" is how we know the rule (official, venue, readers, unconfirmed, nodogs).
- Every place has its own page at `/places/<id>/` (built by `api/place.js`), and `/sitemap.xml` lists them all.
- To add researched places in bulk: `python tools/merge_places.py new.csv` (geocodes, skips duplicates and anything over 35 miles), push, then click **Import places** in the admin. Import only adds ids that aren't in the table yet, so your admin edits are never overwritten.

## Content pages

`/adopt/`, `/vet-care/`, `/tips/`, `/pack/`, `/about/` and `/advertise/` are built by `python tools/build_pages.py` from `data/rescues.csv`, `data/vetcare.csv` and `data/tips.json`. Edit the data, run it, push. It also keeps the footer the same on every page.

## Weekly email extras

- **Sponsor:** one labeled sponsor block, set in /admin/ → Emails (stored in the `settings` table). Inquiries come in through `/submit/?type=sponsor`.
- **Pack birthdays:** pups sent with a birthday get a shout-out in the email that week, and on `/pack/`.
- **Web version:** `/issue/` shows this week's email for any ZIP (`/issue/?zip=30518&radius=25`).

## Weekly event research

A scheduled Claude task (Mondays, 6 AM, on the computer running the Claude app) researches upcoming dog events and posts them to `/api/suggest`. That endpoint only adds drafts to Events → Suggested, using the `SUGGEST_KEY` environment variable in Vercel.

## Reader feedback on places

Every place page has a "Been here with your dog?" box: thumbs up ("Good for dogs") or down ("Heads-up"), then tags picked from a fixed list (`api/_lib/feedback.js`). There's no free text, so nothing needs moderating. One vote per visitor per place, identified by a salted hash of the IP (never the IP itself), capped at 30 places an hour. Votes are stored in `place_feedback` (see `schema.sql`).

In `/admin/` → Places, each place shows its reader counts. Flags like "Dogs not allowed anymore", "Rule is different than listed" and "Closed or moved" show in red, and the "Reader flags only" box filters to those. Unconfirmed places with 3+ thumbs up and no flags get a hint to switch them to the Readers say yes badge.

## Event pages and shareable filters

Every event has its own page at `/events/<date>-<title-slug>/` (`api/event.js`): the dog rule, map, directions, add to calendar (`?format=ics`), Google Calendar, share, the venue's place page when we list it, more events at the same venue, and dog-friendly spots nearby. The homepage, the web email and the weekly email all link here. Old `/events/#<id>` links forward to the new page.

`/events/` and `/places/` keep their filters in the address, so any view can be linked: `/events/?when=weekend&type=adopt&q=santa&r=25`, `/places/?cat=lake&status=official&q=cumming`.

## Lost & found
`/lost-found/` is a free board for lost and found pets. Anyone can post. A post goes live when the poster taps the link in their confirmation email, and it stays up 30 days. The same link lets them mark the pet home, renew the post or take it down. A reminder goes out 3 days before a post ends (from the daily `/api/cron/events` job).
- Each post gets a page at `/lost-found/<id>/` with a map, share buttons, a printable flyer and a message form. Messages are emailed to the poster with Reply-To set to the sender, so the poster's email is never shown. Only a record that a message was sent is kept, for spam limits.
- Photos are stored in the private `submissions` bucket and served through `/lost-found/<id>/photo`.
- You get an email for each new post. Hide or delete posts in Admin → Lost & found.
- Lost pets posted in the last 14 days show in the weekly email for readers within range, and on the homepage.
- Needs the "Lost & found" SQL block in `api/_lib/schema.sql`.
