# Lanier Leash

Static homepage for lanierleash.com. No build step: `index.html`, `favicon.svg` and `img/` are served as they are.

Deploy: connect this repo to Netlify (or Vercel) with no build command and publish directory `/`.

Note: listings, counts and photos are sample content, and the signup forms do not collect emails yet.

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
