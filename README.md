# Melon Admin · Admin_GenAI

A standalone Next.js admin app for the **same Supabase database and private
`generated-media` bucket used by HelloWorld_GenAI**. Its source, GitHub repository,
Vercel project, and Google session cookies are separate from the public Melon app.

## What it does

- **Overview:** live profile/media/vote totals, weekly growth, upvote share, daily
  activity for 14 UTC days, busiest communities, top captions by net votes, and
  rating coverage. Counts aggregate the entire database rather than a fetched sample.
- **People:** search and paginate profiles, account providers, superadmin status,
  participation counts, account creation dates, and last sign-ins. Read-only.
- **Media:** create, preview, search, edit captions/prompts/communities, replace
  images, and permanently delete posts with their votes/comments. Original authors
  are preserved on edits. Optional Gemini caption generation is available.
- **Ratings:** search and paginate the upvote/downvote ledger with voters, captions,
  communities, and dates. Read-only. Melon uses ±1 votes, not a separate star scale.

## Database setup (run once)

Use the **existing Melon Supabase project**. Do not create an empty new database.
The existing community, profile-card, community-privacy, and post-comment migrations
from HelloWorld_GenAI must already be applied.

1. In Supabase → SQL Editor, run `supabase/001-admin.sql` as the database owner.
2. Sign into Melon with `rz2763@columbia.edu` using Google, if that account does not
   already exist.
3. Run `supabase/002-bootstrap-superadmin.sql` in the SQL Editor.
4. In Supabase → Authentication → URL Configuration, add the admin app's exact
   `https://<deployment>.vercel.app/auth/callback` URL and
   `http://localhost:3001/auth/callback` to Redirect URLs. Add the production domain
   callback too if using one. Do not change Melon's Site URL or remove its redirects.
5. Keep the existing Google provider enabled. The Google console still points at
   Supabase's `/auth/v1/callback`, not a separate Next.js callback.

### How the initial admin avoids lockout

The first administrator is promoted **outside the protected website** through the
Supabase SQL editor, using the project owner's existing database access. The
bootstrap script looks up the exact confirmed email plus its Google identity and
sets `profiles.is_superadmin = true`. It stops if that verified identity is missing.
It does not grant privileges to whichever account happens to log in first.

To revoke access immediately, the database owner runs:

```sql
update public.profiles set is_superadmin = false
where id in (select id from auth.users where lower(email) = 'rz2763@columbia.edu');
```

## Security boundary

- Every admin page/data loader and every media mutation invokes `requireAdmin()`.
  The layout is an additional guard, not the sole protection.
- Each database RPC independently checks a real confirmed Google identity, a
  Google OAuth JWT (`app_metadata.provider = google` and `amr.method = oauth`), and
  the **current** `profiles.is_superadmin` value. Password sessions, ordinary users,
  revoked admins, anonymous users, and editable user metadata cannot bypass this.
- Only Google is offered as a login method. Use a Google-created account; an
  email-first account with a subsequently linked identity fails closed if its
  provider claim remains `email`.
- A trigger prevents ordinary users from setting the superadmin flag during
  inserts or updates, even if legacy table-wide grants permit profile edits.
- Privileged RPCs use fixed SQL, an empty search path, explicit grants, and narrow
  inputs. There is no unrestricted query/SQL endpoint or client-side role check.
- No service-role key is required or included. The anon/publishable key identifies
  the project; the validated user session authorizes guarded RPCs.
- Private-community RLS remains intact for Melon. Storage adds authorized admin
  preview/upload/delete policies. Previews use signed URLs expiring in five minutes.
- Admin auth uses a separate `melon-admin-auth` cookie namespace. Responses are
  private/no-store, non-embeddable, and excluded from indexing.
- Images require PNG/JPEG/WebP signatures and an 8 MB limit. SVG/HTML uploads are
  rejected. Mutation fields and IDs are validated again in the database.
- Delete requires typing `DELETE`. Storage cleanup happens after the database
  transaction; failures are reported explicitly. Shared image paths are retained.

## Run locally

```sh
npm ci
cp .env.example .env.local
# Set SUPABASE_URL and SUPABASE_ANON_KEY to the SAME project as Melon.
# Add GEMINI_API_KEY if you want Generate & save.
npm run dev
```

Open http://localhost:3001. All data routes redirect signed-out visitors to the
Google sign-in page, including direct links to `/profiles`, `/media`,
`/media/new`, `/media/<uuid>`, and `/ratings`.

## Deployment

Use repository `Rezhao/Admin_GenAI` and Vercel project `admin-gen-ai` (Next.js).
Set the same Supabase URL/key and optional Gemini key in Vercel production and
preview environments. `VERCEL_URL` supplies the exact OAuth callback origin on
Vercel; outside Vercel, set `APP_URL` to a trusted deployment origin.

Disable Vercel Authentication / deployment protection in the Vercel project,
**keeping the application's Google/superadmin login wall enabled**. Incognito
should show the app's sign-in page, and ordinary Google users must be denied.
Copy the latest immutable deployment URL for this app and the Melon app into the
course's Submissions section. A production alias alone is not commit-specific.

## Validation

```sh
npm test
npm run lint
npm run build
```

`tests/admin-access.sql` is a rollback-only test for a disposable PostgreSQL
database, not the live Supabase project. Load `tests/fixture.sql`, the Melon
migrations in their README order, then `supabase/001-admin.sql` and this test.
It exercises anonymous and non-admin RPC denials, password-session denial,
forged metadata, self-promotion, private-media access, CRUD, author preservation,
vote/comment cleanup, immediate revocation, and literal search handling.

For PostgreSQL 14 only, omit `with (security_invoker = false)` from a temporary
copy of Melon's profile-card view migration (the default is equivalent). Hosted
Supabase runs a newer PostgreSQL version. Never load fixture.sql in production.
