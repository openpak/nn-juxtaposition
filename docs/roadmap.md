# Roadmap: parity with Pretendo's Juxtaposition list

Status as of 2026-11-01. "Upstream" = already in Pretendo's `dev` and merged here;
"ours" = OpenPak work. Sizes: S under a day, M a few days, L a week or more.
Nothing here is console-verified yet: prod Mongo is empty (no endpoints, no communities)
and no Wii U or 3DS has signed in. Every row's last step is a console test.

| # | Item | State | Upstream / ours | Done means | Size left |
| --- | --- | --- | --- | --- | --- |
| 1 | [3DS] Posts | upstream, untested | upstream: text, drawing and screenshot tabs in `ctr/newPostView`; 3DS image-upload branch is WIP upstream | A 3DS posts text, a drawing and a screenshot to a community and sees them in the feed | S (console test) |
| 2 | [All] Notifications | upstream | upstream: Postgres notifications, follow/yeah/reply types, per-type user settings, Wii U pulsing. Upstream still has open bugs (#634 Wii U task registration, #628 stale tokens, #616 in-game yeahs) | Follow, yeah and reply notifications arrive on 3DS, Wii U and web and clear when read | S (console test) |
| 3 | [All] Translations | upstream | upstream: i18next with 46 locale files, console language id mapping. Checked 2026-11-01: `en`, `es`, `fr`, `de` have all 202 keys | en/es/fr/de complete and selected from the console language | done |
| 4 | [All] Messages | partial | ours: outbound bridge to the neutral chat store. Upstream: friend messages on the console XML API (the old in-app DMs were removed upstream) | A console message shows on website/phone (done) and a phone message shows on the console | M, blocked: the console's `search_key` for a thread is chosen by the Friend List app, so an inbound post cannot be filed in the right thread until one is captured from a real console. Specified in the wiiu PRD gap 3 |
| 5 | [All] Remove the Juxt-specific user object | upstream | upstream #569: users, settings, follows in Postgres; user identity comes from account (`pnid`, gRPC account v2). Migrations `9-users-to-pg`, `10-pnid-populate` | No Mongo user collection; profile read from account + `users` table | done upstream; `10-pnid-populate` only matters for a database that has users (prod has none) |
| 6 | [API] New endpoint design | upstream | upstream: zod-contract internal API with generated OpenAPI (`internal.openapi.json`) used by the UI; the console XML API stays byte-compatible on purpose | UI talks only to the internal API; console API unchanged | done upstream (gRPC PR #595 still open) |
| 7 | [All] Server instances by access level | upstream + ours | upstream: Mongo `endpoints` document per `server_access_level`, picked from the account. Ours: `npm run db:seed` creates prod/test/dev (it was a dead script); hosts from `PN_MIIVERSE_API_DOMAINS_*` | Each access level gets its own hosts and switches (guest access, new users) | done; staging instance for test/dev is an operator decision |
| 8 | [All] Drawings and screenshots to object storage | done on config, route ours | upstream: all uploads already go through the S3 client with `forcePathStyle`, so MinIO works. Ours: `/cdn/<key>` read route so consoles can fetch them; prod had `CDN_URL` pointing at a path nothing served | Uploads land in MinIO bucket `miiverse` and consoles load them through the API host | done; prod bucket and Mongo are empty so there is nothing to migrate |
| 9 | [All] Sub communities | upstream | upstream: `parent` communities, `subCommunityView` for ctr/portal/web (#548 styling fixed) | A game community lists its sub communities on all three clients | S (needs seeded communities) |
| 10 | [3DS] UI refactor | upstream, ongoing | upstream: islands, redesigned post embed (#583), lists (#580). Remaining pjax work is open PR #604 | 3DS pages use the new components | tracks upstream; take #604 when merged |
| 11 | [3DS] User page | upstream | upstream: `ctr/userPageView`, following list, settings | Profile, follows and settings usable on 3DS | S (console test) |
| 12 | [All] Guest mode | upstream | upstream: internal API `guards.guest`, endpoint `guest_access` flag, web guest browsing. Ours: seed sets `guest_access` on prod only | Logged-out web visitor browses communities and posts read-only | S (check on a live web host; juxt.openpak.org is not publicly resolvable today) |
| 13 | Set-Up page rewrite | upstream | upstream: `firstRunView` for ctr and portal, internal `onboarding` route | First launch walks a new account through setup | S (console test) |

## Open prerequisites outside this repo

- Mii face images (`/mii/<pid>/normal_face.png`) are written and served by `nn-account`
  (`NN_ACCOUNT_CDN_BASE_URL=https://openpak.org`, no S3 configured on prod, nothing routed).
  Posts and the UI reference `${cdn}/mii/...`; until nn-account has a bucket and a route these
  images 404. The `/cdn` route here also serves a `mii/` prefix, so pointing nn-account's S3 at
  the `miiverse` bucket would be enough.
- Communities: prod needs the game communities created (admin pages or a seed list).
