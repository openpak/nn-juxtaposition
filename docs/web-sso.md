# OpenVerse web sign-in (openpak.org SSO)

The web UI has no sign-in form. `GET /login` on the canonical host (`PN_JUXTAPOSITION_UI_HTTP_BASE_URL`,
`verse.openpak.org`) redirects to openpak.org's `/account/sso/authorize` (client `openverse`, state, PKCE S256).
`verse.openpak.org` is the only web address (juxt.openpak.org and openverse.openpak.org do not exist). The contract is the website's `docs/sso.md`.

- `GET /login/callback`: checks `state` against the session, then POSTs the code to
  `http://openpak-website:20010/internal/sso/token` (HTTP Basic `openverse:<secret>`,
  `SSO_CLIENT_OPENVERSE_SECRET` from the shared `.env`, never logged). Result `{account_id, display_name, wiiu_pid}`.
- Right after the code exchange the UI calls the internal `sso.resolve` (`POST /sso/resolve`), which finds or creates the
  OpenVerse user for the account (see "Identity" below). There is no first-run page on the web and no "link a console" gate:
  every OpenPak account can sign in, with or without a Wii U or 3DS.
- The session (Redis, regenerated after sign-in) keeps `{accountId, displayName, wiiuPid, pid}`; `pid` is the number OpenVerse knows the person by.
- First visit: until the account has accepted the community rules, every page redirects to `/welcome` (rules, one Accept button).
  Acceptance is stored once per account (`web_identities.rules_accepted_at`).
- `GET /logout` destroys only this site's session and redirects (303) to `/about`, the signed-out landing page; openpak.org stays signed in.
- Config: `PN_JUXTAPOSITION_UI_SSO_{CLIENT_ID,CLIENT_SECRET,AUTHORIZE_URL,TOKEN_URL,LINK_URL}`.

## How the session reaches the miiverse-api

The UI sends `x-trusted-pid: <wiiu_pid>` on its internal API calls. `apps/miiverse-api` (`auth-populate.ts`)
accepts it as a third authentication method next to `x-service-token` (consoles) and `x-oauth-token`
(old web login) and loads the account by PID. It is safe because the internal Express app is reachable only
through the gRPC `sendPacket` channel, which requires the shared API key; browsers and consoles cannot set it.
This needed no change to nn-account. Console login (NNAS service tokens) is untouched.

## Identity (who a web account is)

Everything in miiverse-api is keyed by a number called `pid`. `web_identities` (Postgres) maps an OpenPak `account_id` to it:

| Account | `pid` | `linked` |
| --- | --- | --- |
| Has a Wii U linked | the real Wii U PID from nn-account (1000000000 to 1799999999) | true |
| Web only (no console) | next value of the `web_identities_pid_seq` sequence, from 1800000001 up to 2147483647 | false |

nn-account never issues a PID above 1799999999, so a web-only number cannot collide with a console PID. The upper bound is the
largest 32-bit integer because `users.pid` is an `INTEGER`. A Wii U-linked account uses its real PID on the web too, so console
posts and web posts are one user. A web-only account that links a console later switches to the real PID from then on; what it posted
before stays under the old number (merging them is a follow-up).

`sso.resolve` is idempotent: it creates the `web_identities` row, the `users` row and its settings (the same defaults the console
first-run page writes) on first use, keeps a console player's name (their Mii's), and keeps a web-only player's name in step with the
OpenPak account. A web-only account has no Mii and no console account, so `getUserAccountData` answers from a local record
(`buildWebOnlyAccount`) instead of nn-account, `username` is empty (the user page then shows no `@handle`), and posts carry the
default avatar (`mii/default/*.png`, written by `npm run db:seed`) for consoles.

## Posting from the web

- Text and drawings only. There is no image or screenshot upload on the web.
- The drawing pad is 320x120, black on white, the console's size. The page posts a 1-bit BMP (`painting`, base64, `bmp=true`); the
  server reads it with the same code path as a 3DS, crops to 320x120, makes it bilevel and stores the zlib-compressed TGA that Wii U
  and 3DS read, plus the PNGs the web shows. `apps/miiverse-api/src/images.drawing.test.ts` runs the web encoder through that code and
  checks the stored TGA. Not verified on a console (nothing here is).
- Yeahs, replies, follows and user pages go through the same internal API as a console account, using the web-only `pid`.

## Supervised accounts

A parent sets "OpenVerse: off / read / read + post" per supervised account on openpak.org (Parental controls); it is the `openverse`
level of the parental controls core (`platforms/core/infra/parental`). A supervised account that was never given a level is **off**.

- With `PN_MIIVERSE_API_PARENTAL_ADDRESS` (gRPC address) and `PN_MIIVERSE_API_PARENTAL_KEY` (the `wiiu` adapter key) set, the API asks
  `Parental.GetProfile(account_id)` (cached 60 s) and reads the effective `openverse` level (field 6; an account nobody supervises is `read_post`).
- `read + post`: full access. `read`: browse only; post, reply, Yeah and follow answer `403 auth_read_only`. `off`: every call except
  `/api/v1/self` and `/api/v1/sso/*` answers `403 auth_openverse_off`, and the web redirects to `/welcome/off`, which says a parent turned
  OpenVerse off and offers sign-out.
- If it is configured and the core cannot be reached, or the account is unknown, the account is **off** (fail closed).
- If it is not configured, there is no check.
- Not yet applied to console traffic (it would need PID to account id resolution).

## Seeded communities

`npm run db:seed` (inside the api image: `node dist/seed.js`) creates, if missing by name or title ID: Announcements (team-only
posting), Help, Introductions, Off-topic, Drawing and Art, Feedback, Switch, Wii U and 3DS, and Super Mario Maker. Each gets a drawn
icon and banners through the normal upload pipeline. Edits made later in the admin panel are kept. The two hubs are ordinary
communities; game communities are not re-parented under them.

## Game communities

Every game OpenPak serves (website titles with status live or beta) has one community. The same game on several consoles shares one
community (no sub-communities): its `title_id` list holds the Wii U, 3DS and Switch IDs, so an in-game post lands there whichever
console it comes from. Wii and DS games have no title ID to give and are web-only.

- Bundle: `python3 apps/miiverse-api/tools/game-communities/build.py <titles.json> <dir>` reads the website's live and beta titles
  (`requests`, kind `title`; columns name, console, title_id, title_ids) and copies each game's tile from openpak.org into `<dir>/icons`
  (non-Switch tiles from `/static/art/titles/<slug>.jpg`, Switch icons from `/titles/icon/<id>`). A game with no art is drawn as an
  OpenVerse letter icon.
- Sync: `node dist/game-communities.js <dir>` (`npm run db:sync-games -- <dir>`). Idempotent and never deletes. A game is found by its
  fixed id, then by a shared title ID, then by name; what is missing is created (owner: Pakka), what exists gets its name, title IDs
  (only added to) and art updated. A community the sync made also follows the generated description; a hand-made one keeps its own.
- Id: `olive_community_id` = sha256("openverse-game:" + slug of the name), first 8 bytes big endian, top bit set
  (`communityIdForKey`). openpak.org computes the same id (`verseCommunityID`) to put an "OpenVerse community" button on each game's
  details, so only live and beta games link. Super Mario Maker predates the sync and keeps its old id (an override on the website).
- Pakka's News mirror already looks a channel's games up by title ID, so game news lands in these communities with no change there.
