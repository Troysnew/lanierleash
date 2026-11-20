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
