# Changelog — nn-juxtaposition

Generated from git history on 2026-09-15. `git log` stays the source
of truth; this file is the readable summary.

Note: the early history below is the upstream project (Pretendo Juxtaposition);
OpenPak work starts at the port/fork commit.

## v0.4.0 — 2026-11-04

- Account erasure (card openpak/prds#120). `DELETE /internal/accounts/{account_id}/data` on the API's HTTP port
  (20090), `Authorization: Bearer <ACCOUNT_ERASE_KEY>`; 503 without the env var, 404 through the public proxy
  (anything carrying `X-Forwarded-For`). The account's pids are its web identity pid plus the console pid
  nn-account resolves. Erased: its posts, comments and private messages (media files too; messages to or from it
  go on both sides, like chat), conversations it is in, its empathy on other posts (counts corrected), its
  community favourites, reports it filed or that were filed about it, automod log rows about it, the user row with
  settings and follows in both directions and community follows, notifications to it, its name in other people's
  grouped follow/empathy notices (a notice left empty is deleted), web identity, device links, activity
  settings and activity posts. Moderation audit rows keep the action but lose the pid and context.
- Kept: other people's replies under a deleted post (their own content) and staff-made communities (only the
  owner/admin entry is dropped). Idempotent; logs `account erased account=<uuid> rows=<n> service=nn-juxtaposition`.
- No event consumer here; the endpoint is the path.

## v0.3.30 — 2026-11-03

- UI and API request log lines carry no headers at all unless `log.sensitive` is on: no decoded
  `X-Nintendo-ParamPack` (device identifiers), no user-agent, referer or cookies. What remains is
  method, path without the query, id, status, duration and client address. Tests added.

## v0.3.29 — 2026-11-03

- UI and API per-request log lines no longer carry the query string (URL, `query`, Referer) unless
  the existing sensitive-logging setting (`log.sensitive`) is on.

## v0.3.28 — 2026-11-02

- miiverse-api: franchise families for OpenVerse. A family is a Sub community (never listed to consoles) that its games name as `parent`; the feed, `/stats` and the following feed read a family id as its games' posts, and posting to a family is refused. Games keep their ids and console behaviour. `families.json` (59 families over 181 games), `npm run db:sync-families` (idempotent, `--dry-run`, `--undo`), and the popular list no longer filters on `parent`.

## v0.3.27 — 2026-11-02

- A parental core that stays unreachable for two minutes logs an error line every minute ("PARENTAL CORE UNREACHABLE: every OpenVerse web account is locked out"), since failing closed locks everyone out.

## v0.3.26 — 2026-11-02

- miiverse-api: key-protected web bridge (`/internal/v1/web`, `PN_MIIVERSE_API_WEB_KEY`) so the OpenVerse web app (common/openverse) can call the internal API over private HTTP; 404 without a key or through the public proxy, never `/api/v1/admin/`
- one OpenVerse community per game OpenPak serves: `tools/game-communities/build.py` builds a bundle from the website titles and their tiles, `npm run db:sync-games` creates and updates the communities (idempotent, never deletes). Wii U, 3DS and Switch title IDs go on the community so in-game posting lands in it

## v0.3.25 — 2026-11-02

- fix: the parental lookup passed a bare string to nice-grpc, which throws a TypeError, so every web account failed closed to OpenVerse off (adults nobody supervises included). The request is now an object; a test drives the real gRPC path against a stand-in parental core (unsupervised adult is full access, supervised follows its level).

## v0.3.24 — 2026-11-02

- activity: nothing is posted for an account below full access (parental level read, or OpenVerse off), matching the new parental access levels
  (v0.3.18 only skipped read-only accounts)

## v0.3.23 — 2026-11-02

- web: Linked devices page rebuilt on the shared layout (wrap, page head, cards): a code field (one-time-code, monospace, inline errors), where-to-find-the-code help, device rows with an icon, linked and last-used dates and a confirmed Remove, a friendly empty state
- web: "Devices" is no longer in the top bar; Linked devices is in the account menu on the avatar (profile, linked devices, sign out)
- web: openverse.css is requested with a content hash (`?v=`), so a changed stylesheet is never served stale by the CDN or the browser (the first Devices page was shown unstyled for that reason)

## v0.3.22 — 2026-11-02

- lite: drawings load on the PS3 and Wii (the API names the drawing URL on verse.openpak.org, not the console CDN host); the Devices page tells people to open lite.verse.openpak.org;
  a supervised account with OpenVerse turned off by a parent gets a clear message on Lite and `openverse_off` from the Xbox 360 feed

## v0.3.21 — 2026-11-02

- web: parent-controlled OpenVerse level for supervised accounts (off, read, read + post; default off), read from the parental controls core's `GetProfile.openverse`. Off blocks the whole API (`auth_openverse_off`) and shows `/welcome/off`; read keeps the existing read-only behaviour. A core that cannot be reached means off.

## v0.3.20 — 2026-11-01

- web: welcome page is one card (heading, intro, rules, action row). Actions are real buttons of the same height: primary "Accept and continue", secondary "Not now" (signs out, lands on /about) and a quiet "Read the full terms" button; they stack full width on phones with the primary on top

## v0.3.19 — 2026-11-02

- privacy: deleting a post now deletes its screenshot and drawing (full, thumbnail and big renders, PNG and TGA keys) from the `miiverse` bucket, so `/cdn/...` answers 404 at once. Covers a player removing their own post or reply, a moderator removal (`DELETE /posts/:id` and the report action), the console XML API delete, Pakka's official post removal, and the account deletion call from core (`deleteAccountData`, which now also removes the big and thumb renders it used to miss)
- privacy: moderation removals still keep the post row (who removed it, when, why) but the row's drawing blob and media urls are wiped; the files are never kept for audit
- privacy: a post refused after its images were uploaded (duplicate, automod, empty, failed insert) no longer leaves them behind
- privacy: `/cdn` and the web proxy serve screenshots and drawings with `Cache-Control: no-cache`, so a copy cached by a browser or proxy is revalidated and a deleted image stops loading
- tools: one-off orphan cleaner `node dist/media-orphans.js [--apply]` (`npm run media:orphans`): dry run by default, deletes screenshot/drawing objects with no live post, idempotent. Activity posts carry no uploaded media (OpenPak art by https URL), so nothing to delete there

## v0.3.18 — 2026-11-02

- activity: a player can remove their own activity post (the x on the post; moderators any), `DELETE /api/v1/activity/:id`; "Show more" only when a full page came back; the Game activity styles were dropped from `openverse.css` by the v0.3.16 welcome change and are back, with settings spacing
- activity: verified live on verse.openpak.org with the test account (opt in, badge post from the rewards service and from the internal endpoint, feed and profile, removed)

## v0.3.17 — 2026-11-02

- lite: OpenVerse Lite, plain-HTTP pages for the PS3, Wii (Internet Channel) and DSi browsers on their own host (`lite.verse.openpak.org`, `PN_JUXTAPOSITION_UI_LITE_HOSTS`),
  served from our edge because those browsers cannot reach Cloudflare's modern TLS. Server-rendered HTML 4 with no JavaScript, per-device sizes (`/ps3`, `/wii`, `/dsi`, or by user agent),
  communities, posts, replies, Yeah and text posts; drawings are proxied (`/img/paintings/...`) and left out on the DSi. Supervised accounts are read-only. See docs/lite.md
- lite: sign-in is a device link code, not a password: the console shows `ABC-DEF`, the person approves it at verse.openpak.org/devices (new Devices page: confirm step, list, Remove),
  the console receives a revocable device token (SHA-256 stored, cookie `ovl`). Internal API `deviceLinks.create/resolve/list/revoke`, table `device_links`
  (migration `20261102110000_device_links`; run `npm run migration:deploy`); 12 devices per account
- x360: read-only feed for the Xbox 360 dashboard under `/x360/v1` on the Lite host (link, `feed`, `communities`, `posts`, `activity`), JSON or XML, bearer device token; see docs/lite.md

## v0.3.16 — 2026-11-01

- web: the welcome page remembers the page you first asked for and never sends you back to a sign-in step (`/login/callback?code=...` is no longer wrapped in `/welcome?redirect=`, and `code`/`state` are stripped); the sign-in steps are exempt from the welcome redirect
- web: welcome page rebuilt on the shared page head and card, h1 in the site style, a primary "Accept and continue" and a secondary "Not now" button in a row (stacked full width on phones), no leftover background image
- web: copy now says everyone can join from the web or the app, with or without a console (welcome intro, footer blurb, page descriptions), translated in every locale
- web: footer "Part of the OpenPak network" moved into the bottom line, like OpenKart, OpenSplat and OpenMaker

## v0.3.15 — 2026-11-02

- Switch Album shares: `POST /api/v1/console-share/posts` (internal API) creates a screenshot post for a console user that nx-share
  proved, in the game's community (matched by the Switch title id) or the Switch room, with the game's name as the topic tag.
  Bans, read-only accounts, community permissions, automod and the duplicate check apply. `sso/resolve` takes `keepName`, so a
  console share never renames a person. The web post view shows a screenshot's game name.

## v0.3.14 — 2026-11-02

- The official Pakka account: a verified service identity (no sign-in) that Pakka, OpenPak's assistant, posts through `/internal/v1/official` (key `PN_MIIVERSE_API_OFFICIAL_KEY`, private network only, 404 without a key). Idempotent posts, communities with generated art, removal of its own posts, weekly top posts. See docs/official-account.md

## v0.3.13 — 2026-11-01

- api: a post no longer needs author Mii data, so a web-only player can post (the 500 on the first web-only post)

## v0.3.12 — 2026-11-01

- web: pictures (community icons, drawings, Miis) are served from https://verse.openpak.org/cdn (a read-only proxy to the API's /cdn route).
  They used the console-only host api.olv.openpak.org, which a browser cannot resolve, so every image on the web was broken. Consoles keep the old host

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
