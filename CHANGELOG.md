# Changelog — nn-juxtaposition

Generated from git history on 2026-09-15. `git log` stays the source
of truth; this file is the readable summary.

Note: the early history below is the upstream project (Pretendo Juxtaposition);
OpenPak work starts at the port/fork commit.

## v0.3.11 — 2026-11-02

- activity: opt-in automatic activity posts ("Tobi earned the Kart Racer: Wii Era badge") with a web feed (Game activity in the navigation),
  an Activity tab on profiles and settings at `/activity/settings` (master switch plus one switch per category, everything OFF by default,
  nothing for supervised accounts). Server-to-server `POST /internal/v1/activity` (`X-Internal-Key` =
  `PN_MIIVERSE_API_ACTIVITY_KEY`, idempotent by `event_id`); at most 10 posts a day and 4 per 10 minutes per account, the rest folded
  into one digest post. Only the `badge` category has a source (rewards 0.3.0) and is listed
  (`PN_MIIVERSE_API_ACTIVITY_CATEGORIES`); see docs/activity.md. Migration `20261102100000_activity_posts`; run `npm run migration:deploy`

## v0.3.10 — 2026-11-01

- web: signing in with openpak.org creates the OpenVerse user on the spot (internal `sso.resolve`); there is no first-run page on the web
  and no Wii U requirement. A Wii U-linked account keeps its PID; a web-only account gets a number from 1800000001 (`web_identities`
  table, migration `20261101190000_web_identities`; run `npm run migration:deploy`)
- web: a short welcome page (community rules, Accept) on the first visit
- web: posting for everyone, text or a 320x120 drawing (canvas posts a 1-bit BMP the console drawing pipeline turns into the stored TGA);
  no image uploads from the web
- web: a failed Mii picture falls back to the OpenPak default avatar; console views of a web-only player's posts use `mii/default/*`
- web: supervised accounts are read-only when the parental controls core is configured (`PN_MIIVERSE_API_PARENTAL_ADDRESS/KEY`); see docs/web-sso.md
- seed: `npm run db:seed` creates the starting communities (Announcements, Help, Introductions, Off-topic, Drawing and Art, Feedback,
  Switch, Wii U and 3DS, Super Mario Maker) with drawn icons and banners, and uploads the default avatar
- ui: the user page leaves out an empty `@handle`

## v0.3.9 — 2026-11-01

- ui: `/logout` ends only the OpenVerse session and redirects (303) to `/about`, the signed-out landing page. It no longer goes through openpak.org's "Sign out of OpenPak?" page and openpak.org stays signed in; the next Sign in may sign straight back in. The `PN_JUXTAPOSITION_UI_SSO_LOGOUT_URL` setting is gone
- ui: the first-run page title is "Welcome · OpenVerse" (was "Welcome to OpenVerse! · OpenVerse")

## v0.3.8 — 2026-11-01

- ui: /feed sends an account that has not finished console onboarding to the first-run page instead of a 500

## v0.3.7 — 2026-11-01

- ui: the web UI is now selected by the `config.domains.web` host list instead of a subdomain containing "juxt";
  signed-in pages on verse.openpak.org were being rendered with the console (CTR) views
- locales: inflected forms of the brand name fixed in da, fi, hr, hu, sk, ko, nl, ta, tr, fr, fr_CA, ca, ro and cy
  (no more "OpenVerseu"-style suffixes); remaining "juxtaposition" strings in ca and cy replaced
- test: locale values may not attach Latin/Cyrillic letters to "OpenVerse" or mention Juxtaposition outside the credit lines

## v0.3.6 — 2026-11-01

- ui: About and first-run page titles follow "<page> · OpenVerse"

## v0.3.4 — 2026-11-01

- ui: every web page title is "<page> · OpenVerse" (default "OpenVerse"); last "Juxt"/"Juxtaposition" strings
  in titles, OpenGraph site names, discovery messages and the admin alert replaced

## v0.3.3 — 2026-11-01

- ui: the web host is `verse.openpak.org` (config defaults, SSO redirect and logout target, OpenGraph and manifest URLs)
- ui: footer line "Part of the OpenPak network" linking to openpak.org

## v0.3.2 — 2026-11-01

- ui: web sign-in is openpak.org single sign-on only; the login form and the PNID password login are gone
  (`docs/web-sso.md`). No Wii U linked gets its own page; `/logout` ends both sessions
- ui: shared Open-site header (mark and name only) and footer (OpenPak / OpenVerse / Project / Legal columns),
  Sign in button and signed-in chip as on openpak.org; the AGPL credit sits in the footer and on `/about`
- api: `x-trusted-pid` internal auth header (only reachable over the API-keyed gRPC channel)
- ui: vitest added (SSO flow tests: state mismatch, failed exchange, happy path; render checks)

## v0.3.1 — 2026-11-01

- ui: web pages rebranded as OpenVerse: openpak.org tokens, M PLUS Rounded 1c (self-hosted, no Google Fonts),
  light and dark, OpenPak header and footer, OpenVerse mark and favicon, new `/about` page with the AGPL credit
  to Juxtaposition by Pretendo Network. Register and forgot-password link to openpak.org
- ui: no Pretendo names, logos, OpenGraph images, Discord or forum links in user-visible output;
  locales updated (all 44); console (portal/ctr) layouts untouched
- ui: `DOMAINS_WEB` takes a comma-separated list (prod: `verse.openpak.org`)

## v0.3.0 — 2026-11-01

- upstream: merged PretendoNetwork/juxtaposition `dev` b4963d0e (150 commits: markdown and mentions,
  notification fixes, profile borders, frontend islands, user pnid column; migration
  `20260918001215_add_pnid_to_user_table`). See `docs/upstream.md`
- api: `GET /cdn/<key>` reads drawings, screenshots, icons and headers from the object store
  (MinIO); point `PN_MIIVERSE_API_CDN_URL` and `PN_JUXTAPOSITION_UI_CDN_DOMAIN` at `https://<api host>/cdn`
- api: `npm run db:seed` (node dist/seed.js) creates the prod/test/dev discovery endpoints
- api: vitest setup; docs: `docs/roadmap.md`

## v0.2.2 — 2026-09-24

- deps: npm audit fix plus overrides (js-yaml, mysql2, deepmerge-ts, esbuild) and @hey-api/openapi-ts 0.99 (Dependabot)
- ui: the API client's error interceptor passes an error with no response through unchanged

## v0.2.1 — 2026-09-24

- config: the `openpak` block defaults to off when no `PN_MIIVERSE_API_OPENPAK_*` env is set;
  v0.2.0 refused to start without it (rolled back on prod within minutes)

## v0.2.0 — 2026-09-24

- OpenPak chat bridge (WU-4, outbound): a friend message a console posts is forwarded
  to the neutral chat store, resolved through nn-account. Off unless
  `PN_MIIVERSE_API_OPENPAK_CHAT_URL` and `..._OPENPAK_NNAS_URL` are set [31d78675]
- ci: build only on v*.*.* tags [aacab1ab]

## v0.1.0 — 2026-09-10

- OpenPak fork: tag-driven ghcr release of both images [05127506]
- Merge pull request #585 from PretendoNetwork/work/notification-types [6d2718eb]
- fix(api): Don't filter json for follow notifications that doesn't exist [52dcc040]
- Merge branch 'dev' into work/notification-types [d36d9c13]
- Merge pull request #590 from PretendoNetwork/work/profile-test [f2e1349c]
- feat(portal): have Bandwidth post the community descriptions [dda9a426]
- feat(ctr): have our boy Bandwidth post the community description [aae3647c]
- Merge pull request #589 from PretendoNetwork/weblate [a87bf7ff]
- locales(remove): Removed Toki Pona locale [2b723445]
- Merge pull request #564 from PretendoNetwork/weblate [df6d01cd]
- weblate(Remove blank strings):  update locales [2c7fdc86]
- locales(update): Updated Polish locale [5609947c]
- locales(update): Updated Japanese locale [dbcd5f3a]
- locales(update): Updated Portuguese (Brazil) locale [928a898e]
- locales(update): Updated Danish locale [68943b53]
- locales(update): Updated Catalan locale [1f2227b4]
- locales(update): Updated French locale [cc8924be]
- locales(update): Updated Spanish locale [05df05bd]
- locales(update): Updated German locale [bbe46069]
- locales(update): Updated Slovak locale [fdefe98e]
- locales(update): Updated Portuguese (Portugal) locale [f10aec7e]
- locales(update): Updated Indonesian locale [0e4c5bb2]
- locales(update): Updated Hungarian locale [3bce6263]
- locales(update): Updated Croatian locale [077c9a14]
- locales(update): Updated Hebrew locale [82f3e708]
- locales(update): Updated Czech locale [560385d2]
- locales(update): Updated Chinese (Traditional Han script) locale [b924615e]
- locales(update): Updated Chinese (Simplified Han script) locale [e0072a2f]
- locales(update): Updated Portuguese (Brazil) locale [3649ee2f]
- locales(update): Updated Portuguese locale [4bc6203d]
- locales(update): Updated Dutch locale [7766b359]
- locales(update): Updated Korean locale [05f5ca45]
- locales(update): Updated Italian locale [f741f292]
- locales(update): Updated French locale [9ccfb4eb]
- locales(update): Updated Spanish locale [e74bc819]
- locales(update): Updated German locale [f7c3a0b3]
- locales(update): Updated Hungarian locale [8ad87354]
- weblate(Cleanup translation files):  update locales [daff06ea]
- locales(update): Updated Hungarian locale [807467dc]
- Merge branch 'dev' into work/notification-types [fef32942]

- … 1901 earlier commits omitted (see `git log`)
