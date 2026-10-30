# PathBuilder Sync social metadata

Source changes only; deployment is intentionally not performed. The final page, Open Graph, and Twitter title is **PathBuilder Sync | Plan. Build. Succeed.** The existing sharing image still carries its original Plan. Build. Grow. tagline, as the image asset is preserved.

## Scope

- `packages/constants/src/metadata.ts`: requested site name, title, and description. Existing production site URL retained.
- `apps/web/app/root.tsx`: initial HTML title/description, Open Graph title/description/site name/type/URL/image, and explicit Twitter title/description/image. Uses the existing public 1200 x 630 PathBuilder Sync PNG with an absolute HTTPS URL.
- `apps/web/components/core/page-title.tsx`: replaces the remaining old default title with the shared title; preserves existing page-specific title behavior.
- `tools/pathbuilder/check_social_metadata.mjs`: checks actual built or HTTP-served HTML, duplicate tags, upstream descriptions, sharing image, and existing favicons without executing application scripts.

No logo, favicon, authentication, routing, application UI, production configuration, or environment variables are changed. Publish/Space is a separate application and its board-specific metadata is outside this homepage change.

## Build and verify

The web application uses React Router SPA mode. Its build prerenders the root into `build/client/index.html`; crawlers receive the metadata in that initial static HTML, without JavaScript. Keep the existing SPA configuration.

Build `@plane/constants` before `web` (or use the repository build pipeline, which builds dependencies). Building web directly against stale constants output can retain old copy.

```powershell
pnpm --filter @plane/constants build
pnpm --filter web build
node tools/pathbuilder/check_social_metadata.mjs apps/web/build/client/index.html
```

For a local preview, serve `apps/web/build/client`, then run:

```powershell
node tools/pathbuilder/check_social_metadata.mjs http://localhost:3187/
```

After a separately authorized deployment, run:

```powershell
node tools/pathbuilder/check_social_metadata.mjs https://sync.pathbuilderedu.com/
```

The HTTP check uses Facebook/Messenger, Facebot, Twitterbot, and MicrosoftPreview user agents. This checks anonymous retrieval compatibility; it does not prove that the platforms' own caches have refreshed or their actual crawlers have visited.

## Refresh cached previews after deployment

1. Open [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/), sign in if requested, enter `https://sync.pathbuilderedu.com/`, and select Debug. Use Scrape Again after the new HTML is live; inspect the fetched title, description, image, and scrape time. Facebook/Messenger previews can remain cached until Meta refreshes them.
2. In Messenger and Facebook, compose a new message/post using the same URL and inspect the preview before sending. Existing messages/posts may retain old preview cards.
3. In Teams, remove and paste the same URL into a new draft after the platform refetches it. Browser cache clearing does not force Teams' server cache to refresh. If it remains stale, allow time and retry; there is no cache-refresh action supplied by this change.
4. Other platforms maintain their own caches. Use their supported reinspection tools when available, or wait and retry a fresh draft. No fixed cache-expiry time is guaranteed here.

Do not add query parameters or change the production URL to force a refresh. The configured sharing image already exists publicly and is preserved byte-for-byte.

## Verification record

- Shared constants and final web production builds passed. The generated initial HTML contains the final Succeed title and exact requested description, Open Graph and Twitter metadata; the checker rejects missing or duplicate tags and old upstream descriptions.
- Built-file validation and local HTTP checks passed for facebookexternalhit, Facebot, Twitterbot, and MicrosoftPreview user agents, including the 1200 x 630 sharing image and favicon retrieval. No application JavaScript was executed.
- The existing public production sharing image returned HTTP 200 and matches the preserved local image SHA-256: `68672a7960fb8565e931e072d0ea21602a5ea555b6b87864d4ed75a3e49e01ec`. The live homepage returned HTTP 200 with its prior metadata; no deployment was performed.
- Formatting and whitespace checks passed. Targeted OxLint: zero errors and three existing font side-effect import warnings. Final React Router type generation and TypeScript check passed. A direct tsc attempt after building initially reported missing generated route types; running the prescribed typegen step resolved those errors.
- React Doctor latest failed npm dependency resolution (`@opentelemetry/sdk-trace-base@^2.9.0`); the installed version also failed its baseline comparison and could not reach its score API. No usable score was obtained; no dependency declarations or lockfile changes were made for this task.
- The initial concurrent test/build attempt had 13 web test timeouts and a resource-related build crash; final build validation passed when retried. The completed lower-concurrency full rerun passed 74/75 tests; one Bulk Update test timed out at five seconds. Re-running that file with a 20-second timeout passed all 11 tests, including the previously timed-out test. Every test therefore passed across the full run and focused retry, rather than in one clean full-suite run.
- Actual platform cache refresh and new production metadata verification remain pending an authorized deployment.

## Authorized production release, 2026-10-27

The user subsequently authorized deployment after testing. The clean pre-release web run passed all 75 tests in 16 files with a 20-second per-test timeout and two workers. Candidate pathbuilder-sync/web:social-metadata-20261027-01 is being built on the exact live web image pathbuilder-dev-web:bulk-update-20261027-06, copying only the three metadata source files. Production release records: /opt/plane-selfhost/releases/social-metadata-20261027-01. Cutover is pending candidate build and HTTP validation.

## Production deployment completed, 2026-10-27

Production now serves `pathbuilder-sync/web:social-metadata-20261027-01`. Refreshed verification passed: all 75 web tests in 16 files, React Router type generation and TypeScript, formatting, and lint with zero errors (six warnings in existing font imports and sequential verification requests). The staged source fingerprints matched all three local metadata files, and the candidate production build and initial HTML checks passed.

The rollout saved compose and a PostgreSQL custom-format backup under `/opt/plane-selfhost/releases/social-metadata-20261027-01`. The first attempt automatically rolled back because its health check expected GET `/auth/sign-in/` to return 200; the previous production image also returns 405 for that URL. Evidence is preserved in `attempt-1/`. After replacing that invalid route check with the homepage check, the second rollout passed and wrote `DEPLOYED`.

Public production verification passed for facebookexternalhit, Facebot, Twitterbot and MicrosoftPreview, including initial HTML title/description, Open Graph/Twitter tags, sharing image and favicon retrieval. Independent Node verification used system certificate authorities. The social image hash is unchanged. Bulk Update, Virtual Office and homepage checks returned 200; anonymous Bulk Update API returned 401. API, worker and beat container identities are unchanged; the web container is running with zero restarts. No migration ran.

Platform preview caches have not been refreshed by this deployment. Use the supported preview reinspection tools described above; existing message cards may retain old content.
