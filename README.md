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

## Expanded generation administration

Run `supabase/004-generation-admin.sql` as the database owner in the same Melon
project after `001-admin.sql`. It adds the missing supporting tables, private
`admin-images` bucket, fixed resource allowlists, and guarded RPCs. It preserves
`ai_generations`, existing admins, existing media, and Melon's login behavior.
The migration is transactional and safe to rerun. If any of these supporting tables
already exist with a different schema, inspect/align their definitions before applying.

Open **Generation console** (`/manage`) for counts, recorded failures, token usage,
mean latency, configured chain allocation, and links to all twelve sections.

| Section | Table | Allowed operations |
| --- | --- | --- |
| People | profiles | Read |
| Prompt chains | prompt_chains | Read |
| Prompt chain steps | prompt_chain_steps | Read |
| Prompt chain mix | prompt_chain_mix | Read, update weight/enabled |
| Terms | terms | Create, read, update, delete |
| AI generation examples | ai_generation_examples | Create, read, update, delete |
| LLM models | llm_models | Create, read, update, delete |
| LLM providers | llm_providers | Create, read, update, delete |
| Generation requests | generation_requests | Read |
| LLM responses | llm_responses | Read |
| Allowed signup domains | allowed_signup_domains | Create, read, update, delete |
| Whitelisted emails | whitelisted_emails | Create, read, update, delete |
| Images | images / admin-images bucket | Upload, create, read, update, delete |
| AI generated media | ai_generations | View existing posts; previous management tools retained |

Lists support literal search and 25-record pagination. Records have detail views;
editable references have searchable selectors. Deletes require typing DELETE, and
foreign keys block deletion of referenced terms, providers, models, or images.
Images accept PNG/JPEG/WebP signatures, up to 3 MB (below Vercel's request limit),
use immutable storage paths, and display five-minute signed previews. Image bytes
are replaced by uploading a new object and changing the record reference. Cleanup
failures are surfaced without misreporting a committed database save as failed.

Migration 004 creates empty supporting tables; migration 005 connects them to the
real posting flow and imports existing saved posts with explicit source labels. Chain definitions and steps come from the generation pipeline or the
database owner. A new chain automatically receives one editable mix entry.
After migration 005 and the corresponding Melon deployment, caption generation uses
active chain weights, ordered steps, and enabled Gemini model/provider settings.
Signup lists remain manageable configuration, not a new signup enforcement policy.
Terms and examples are curated manually and are not auto-created by posting.
No existing users are blocked or promoted by changing these lists.

New tables revoke direct anon/authenticated access and enable RLS. All catalog RPCs
check the verified Google OAuth superadmin flag on each request. Table and writable
field names are fixed allowlists, so these endpoints cannot edit profiles or roles,
write read-only logs, or execute caller-supplied SQL. Restrictive storage policies
protect the new bucket even when legacy permissive storage policies exist.
Provider records store no credentials; API keys stay in server environment variables.

Additional validation:

```sh
npm test
npm run lint
npm run build
# Disposable local database only, after the existing fixtures/migrations + 004:
psql ... -v ON_ERROR_STOP=1 -f tests/catalog-access.sql
```

The rollback-only SQL suite covers CRUD, reference integrity, literal searching,
read-only enforcement, invalid payload fields, anonymous/non-admin/password-session
denial, private uploads, and immediate role revocation. Existing admin SQL tests
continue to verify media and rating privacy.

## Connecting real posts and generation activity (migration 005)

Run `supabase/005-connect-generation-pipeline.sql` in the same Melon Supabase SQL
Editor after 004. Keep RLS enabled. The script preserves existing posts and:

- Adds the actual Google Gemini provider/model and Melon caption chain/step/mix
  matching the previous production behavior. Reruns preserve admin edits.
- Imports existing posts as `media_backfill` requests and `saved_caption` outputs.
  Original model/chain assignment, latency, and token counts stay null because those
  values were not recorded. Counts and imported captions reflect real saved posts.
- Adds live request/response RPCs scoped to the signed-in creator and permitted
  community. Ordinary users cannot read admin tables or anyone else's requests.
- Snapshots each execution plan, applies weighted selection, excludes disabled
  providers/models, limits chains to five steps, and bounds active requests.
- Records real provider text, token usage (when supplied), and elapsed time for new
  Melon generations. Post creation and request completion commit together. Retried
  finalization returns the same post; it cannot publish duplicates.
- Uses insert triggers to capture manual admin posts and older deployed clients as
  `saved_post` history without claiming real provider telemetry.

The Images page also reads `generated-media` through the existing protected media
RPC. Post images appear immediately and link to the post's existing replacement and
delete controls. Separately uploaded reference images retain their private bucket,
reference integrity checks, and independent pagination.

Melon's server sends the Gemini key only to Google's fixed API endpoint. Provider
records cannot redirect credentials. Other provider protocols are not implemented.
If 005 is missing during rollout, Melon retains its previous caption behavior; only
that specific missing-RPC condition permits fallback. Permission or configuration
errors do not silently bypass tracking or enabled states.

Additional disposable SQL regression: `tests/generation-tracking.sql` (after 005).
It covers chain order, true usage fields, foreign-request denial, private membership,
immutable links, manual post imports, mix selection, disabled providers, request
limits, failure states, and publication idempotency. Historical backfill and migration
reruns were also checked against two saved-post fixtures with unknown usage left null.
