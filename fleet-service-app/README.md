# Fleet Ops — Fleet Service Management App

Internal tool for scheduling fleet-wash jobs, checking off units on-site, and
generating a completion PDF to attach to the QuickBooks invoice.

Built with Next.js 14 (App Router), Supabase (auth + Postgres + storage), and
Tailwind. This is a working scaffold covering the four "first build" priorities
in the spec — wire it up to a real Supabase project and it runs end to end.

## What's implemented

1. **Crew flow** — calendar → day → job detail → checklist → close-out
2. **Excel import** — admin uploads a spreadsheet, reviews/edits parsed units before scheduling
3. **Close-out → PDF** — crew check off every unit and mark the work order complete; an admin then
   reviews it (fixing anything needed, since editing preserves which units were already checked)
   and generates the branded completion PDF from the Edit Job screen or the job detail screen. See
   "Two-step close-out" below for why this is split into two steps instead of one.
4. **Admin** — edit job details, reassign crew, add/remove units, reopen a closed job, invite/remove crew logins
5. **Dispatch board** (`/admin/schedule`) — a week-view grid (technicians × days) with an "Unassigned"
   tray on the left. New work orders can be created without a date/crew and sit in the tray; drag a
   card onto a technician's day to set both the assignment and the date in one move. Drag a card back
   to the tray to unassign it. Uses native HTML5 drag-and-drop, so no extra dependency.
6. **Work order numbers** — every job gets a unique, auto-incrementing number the moment it's
   created (`WO-00001`, `WO-00002`, ...), assigned by the database so two work orders can never
   collide. It shows on job cards, the dispatch board, the job detail screen, and the completion PDF
   filename/header — the same number QuickBooks-side staff can reference when matching the PDF
   attachment to an invoice.
7. **Bulk import** (`/admin/bulk-import`) — upload many spreadsheets at once (one per customer).
   Each file's customer name is guessed from its filename (e.g. `Acme_Logistics.xlsx` → "Acme
   Logistics"), editable inline before you create anything. One work order gets created per file,
   with an optional shared date, or they land unscheduled in the dispatch board's Unassigned tray.
8. **Customers** (`/admin/customers`) — a contacts table separate from one-off job names: company
   name, contact name, phone, email, address, notes, and a service frequency (weekly / biweekly /
   monthly). Jobs can optionally link to a customer record (via a picker on New Job / Edit Job, both
   admin-only screens). **Customer data is admin-only end to end** — the `customers` table's Row
   Level Security policy only grants access to admins, so crew accounts can't read it even by calling
   the API directly, and nothing customer-related renders on the crew-facing job detail screen.
9. **Service reminders** — for every customer with a frequency set, the app looks at their most
   recently *completed* job and compares it to their expected interval (weekly = 7 days, biweekly =
   14, monthly = 30). If that window has passed and nothing is currently on the calendar for them,
   they show up as "Overdue" — both in a banner at the top of the Calendar screen (admin only) and
   with a status badge on the Customers screen. A "Schedule Now" button jumps straight to New Job
   with that customer pre-filled.
10. **Text alerts for overdue accounts** — a daily scheduled check (Vercel Cron) texts a digest of
    every overdue account to whoever's set as an alert recipient, via Twilio. There's also a "Send
    Test Alert" button on the Customers screen so you can verify it works without waiting for the
    schedule. See setup below.

## Project structure

```
src/
  app/
    login/                    sign-in screen
    calendar/                 monthly calendar (home screen)
    calendar/[date]/          jobs scheduled on one day
    jobs/[id]/                job detail + checklist (crew close-out here)
    admin/import/             new job: upload Excel, review units, schedule
    admin/jobs/[id]/edit/     admin edit: details, crew, units, reopen, delete
    admin/crew/               invite/remove crew accounts
    admin/schedule/           dispatch board: drag jobs onto technicians' days
    api/                      route handlers backing all of the above
  components/                 client components (forms, checklist, calendar grid)
  lib/
    supabase/                 browser + server + service-role Supabase clients
    excel.ts                  parses uploaded spreadsheets into unit rows
    pdf.ts                    renders the completion PDF
    types.ts                  shared types mirroring the DB schema
  middleware.ts                auth gate + admin route protection
supabase/
  schema.sql                  tables, RLS policies, storage bucket notes
```

## Two-step close-out (crew complete → admin generates PDF)

Earlier versions of this app generated the completion PDF the instant crew
checked off the last unit. That skipped any chance to catch mistakes before
the PDF — which becomes the QuickBooks invoice attachment — got created. The
flow is now split in two:

1. **Crew check off every unit and tap "Mark Work Order Complete."** This
   just flips the job to `completed` status — no PDF yet. `src/app/api/jobs/[id]/close/route.ts`
2. **An admin reviews and generates the PDF.** From the job detail screen or
   the Edit Job screen, an admin can fix a typo'd unit number, uncheck
   something checked by mistake, add/remove a unit, or just leave it as-is —
   then clicks **Generate Completion PDF** (job detail) or **Save & Generate
   PDF** (Edit Job, which saves your edits first). `src/app/api/jobs/[id]/generate-pdf/route.ts`

A few things that fall out of this design:
- **Editing a completed work order no longer wipes out crew's checkmarks.**
  The unit editor now does a proper diff (update/insert/delete by row) instead
  of delete-everything-and-reinsert, so serviced state survives an admin
  correction. See `src/app/api/jobs/[id]/units/route.ts`.
- **Regenerating is safe.** The PDF is stored at a fixed path per job
  (`{job_id}/completion.pdf`) and overwritten on each generate, so admins can
  edit → generate → edit again → regenerate without creating duplicate files
  or stale download links.
- **"Send Back to Crew"** (the old "Reopen") still exists for when crew
  genuinely need to re-check units, not just fix a text field — that's the
  one case the admin-edit screen can't handle, since a fully re-opened
  checklist needs crew interaction again.

### 1. Create a Supabase project
Create a project at supabase.com, then in the SQL Editor run everything in
`supabase/schema.sql`. This creates the `profiles`, `jobs`, `job_crew`, and
`units` tables, the `admin`/`crew` role split, and Row Level Security
policies (admins see everything; crew see only jobs they're assigned to).

### 2. Create storage buckets
In Supabase → Storage, create two public buckets:
- `completion-pdfs`
- `job-photos` (for the optional per-unit photo field)

### 3. Environment variables
Copy `.env.example` to `.env.local` and fill in your Supabase project URL,
anon key, and service role key (Project Settings → API). The service role
key is used server-side only, for uploading PDFs and inviting crew — never
expose it to the browser.

### 4. Install and run
```bash
npm install
npm run dev
```

### 5. Create your admin account
Sign up a user (via Supabase Auth → Users → Invite, or by temporarily
allowing self-serve signup), then in the `profiles` table set that row's
`role` to `admin`. Every subsequent invite from the Crew screen defaults to
`role = 'crew'`.

### 6. Deploy
Push to Vercel or Railway, set the same environment variables there, and
point `NEXT_PUBLIC_APP_URL` at your production URL (used in crew invite
emails).

### 7. Set up text alerts for overdue accounts (optional)
This only works once deployed to **Vercel** — Vercel Cron is what triggers
the daily check. (Railway doesn't have an equivalent built in; you'd need
an external scheduler like cron-job.org hitting the same route instead.)

1. **Create a Twilio account** at twilio.com. On the console dashboard,
   copy your **Account SID** and **Auth Token**. Buy or use your trial
   phone number as the **From** number.
2. **Set environment variables** in your Vercel project (Settings →
   Environment Variables) — see `.env.example` for the full list:
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`,
   `ALERT_PHONE_NUMBERS` (who receives the texts, comma-separated, E.164
   format like `+15555550123`), and `CRON_SECRET` (any random string —
   `openssl rand -hex 32` works).
3. **Redeploy** so Vercel picks up `vercel.json`, which schedules
   `/api/cron/service-reminders` to run daily. The default is `0 13 * * *`
   (13:00 UTC — adjust for your timezone; Vercel Cron schedules are always
   UTC, there's no per-project timezone setting).
4. **Test it** — go to `/admin/customers` and click **Send Test Alert**. It
   runs the same logic as the scheduled job immediately, so you can confirm
   Twilio is wired up correctly before waiting for the next scheduled run.
5. **Twilio trial account note** — trial accounts can only text phone
   numbers you've manually verified in the Twilio console (Phone Numbers →
   Verified Caller IDs). Upgrade to a paid Twilio account to text anyone.

The daily text is a **digest**, not a running conversation — it lists every
currently-overdue account each time it runs, so if an account stays overdue
for a week, it'll be on the list for a week straight until it's scheduled.
That's intentional (nothing falls through the cracks silently), but if you'd
rather only get notified once per overdue account, that needs a small
addition: track a `last_alerted_at` per customer and skip ones already
alerted within, say, the last 3 days.

## Notes on things you'll want to adjust

- **Excel column matching** (`src/lib/excel.ts`) recognizes common header
  names (`Unit #`, `Unit Number`, `Truck #`, etc.). If your real spreadsheets
  use a different header, add it to the alias list.
- **Filename → customer name guessing** lives in `src/lib/format.ts`
  (`guessClientNameFromFilename`) — it strips the extension, swaps
  `_`/`-` for spaces, drops common trailing noise words ("unit list",
  "roster", "fleet", ...), and title-cases all-lowercase/all-caps names.
  It's a starting point the admin edits inline on the bulk import screen,
  not a source of truth — nothing is created until they confirm.
- **Service reminders now do send real texts** (see setup section above) —
  a daily Vercel Cron job checks every customer's status and texts a digest
  of overdue accounts via Twilio. The in-app banner/badges on Calendar and
  Customers are unaffected and still work with zero setup; the text alert
  is opt-in on top of that once you configure Twilio + Vercel Cron.
- **PDF branding** — set `COMPANY_NAME` and `COMPANY_LOGO_URL` in your env
  vars; the template in `src/lib/pdf.ts` picks them up automatically.
- **Photos per unit** — the DB schema has a `photo_url` column on `units` and
  a `job-photos` bucket is provisioned, but the upload UI isn't wired into
  the checklist yet — that's the natural next slice of work.
- **Crew invites** use Supabase's built-in `inviteUserByEmail`, which sends a
  magic-link email; crew set their own password on first login.
- **`jobs.scheduled_date` is nullable** — a job with no date and no crew sits
  in the dispatch board's Unassigned tray until it's dragged onto a
  technician's day, which sets both fields at once.
- **Dispatch board data fetch** currently pulls every non-completed job (with
  crew ids and a unit count) in one query, then splits it into the tray vs.
  the visible week in JS. Fine at fleet-company scale; if the job backlog
  grows large, push the "unassigned" filter into the query (e.g. a
  `job_crew` left-join `is null` check) instead of filtering client-side.
- **One technician per drag** — dropping a card assigns exactly one
  technician (replacing whoever was there before). Multi-tech jobs still
  work, just assign the extras from the job's Edit screen.
- **Work order number format** lives in `src/lib/format.ts`
  (`formatWorkOrderNumber`) — currently `WO-00001` style, zero-padded to 5
  digits. Change the prefix/padding there if you want something else; the
  underlying `jobs.job_number` column is just a plain auto-incrementing
  integer assigned by Postgres, so numbers are never reused even if a job
  is later deleted.
