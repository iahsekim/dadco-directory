# Dad & Co directory

- `site/index.html`: the public page. Netlify deploys it automatically on every push to `main`.
- `backend/Code.gs`: the Google Apps Script backend. Paste it into Apps Script and deploy a new version when it changes.

## Setup (about 10 minutes)

**How it works**
- Profiles are opt-in. Until a dad claims his, the page shows only his name and a **Claim profile** button.
- Tapping it asks for his RSVP email (no password, no code), then opens a form pre-filled with what you already know. He edits and publishes; it's live right away.
- Every claim and edit is logged in the Pending tab (status `published`) with the version before it. In `#admin` → **Recent claims and edits**, you can see what changed and **Undo** it.
- Only the **current event's guest list** is shown. Everyone ever imported stays in the Directory tab (profiles included) and reappears when they're on a future guest list. At setup, the 27 seeded names are the current list.
- To switch events: open `#admin` → **Import a new Luma guest list** → upload the guest CSV exported from Luma → preview the matches → import. Guests are matched by email, then by name; new guests are added as unclaimed names. Only guests marked going (approved) are imported.
- **Adding people outside Luma**: in `#admin`, **Add someone** puts a name (and optional email) on the current guest list right away. Guests can also tap **Ask to be added** on the page; those requests land in your review queue. People added either way stay on the list through Luma syncs (RSVPs rows marked `manual`).
- Hide and clear take effect right away. Clearing puts a backup of the old profile in the Pending tab (`cleared-backup`) in case you need to restore it.

## 1. Backend (Google Sheet + Apps Script)
1. Create a new Google Sheet → **Extensions → Apps Script**. Replace the default code with `Code.gs`.
2. Optional: set `ADMIN_EMAIL` at the top to get notified of new claims and edits.
3. Run `setup()` once and approve the permissions. It creates the **Directory** and **Pending** tabs, seeds all 27 names and draft details, and logs your **admin key** (View → Logs).
4. In the **Directory** tab, paste each person's RSVP email into the `email` column (more than one per cell is fine, comma-separated).
   - With an email on file, only that email can claim or edit that profile.
   - With no email on file, anyone can submit a claim for that name, so check it before approving. The email he used is saved when you approve.
5. **Deploy → New deployment → Web app**. Execute as: *Me*. Who has access: *Anyone*. Copy the web app URL.

If you already set up an earlier version, delete the Directory, Pending, Events and RSVPs tabs and run `setup()` again.

## 1b. Connect Luma (optional, needs Luma Plus)
1. In Luma, open your calendar's settings → **API** and create an API key.
2. In Apps Script → **Project Settings → Script properties**, add `LUMA_API_KEY` with that key. It stays server-side and never reaches the page.
3. On the page, open `#admin` → **Pull a guest list from Luma** → pick the event → preview → import.
4. Turn on **Hourly auto-sync** so new RSVPs (and cancellations) show up on their own, or tap **Sync now** before the meetup. The first time, Google asks you to approve the trigger permission.

Without a key, the CSV import still works.

## 2. Frontend (Netlify)
1. Open `index.html`, paste the web app URL into `const API_URL = ""`.
2. Drag `index.html` into Netlify (or any static host).

With `API_URL` blank the page runs a self-contained demo: a few profiles are pre-claimed, the rest can be claimed with the dad's first name `@example.com` (e.g. `cody@example.com`), admin key `demo`.

## Sheet tabs
- **Events**: every Luma import. **RSVPs**: who was on each guest list. The current event is whichever you imported last.

## Directory columns
- `kids`: `7 girl, 11 girl` — `?` for an unknown age, girl/boy optional.
- `links`: one per line, `instagram: @handle`, `website: site.com`, `phone: …`, `email: …`, `twitter: …`, `other: …`.
- `claimed`: `TRUE` = public profile. Blank = name only.
- `hidden`: `TRUE` = not shown at all.

## Notes
- After changing `Code.gs`, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

_Deploys automatically from `main` via Netlify._
