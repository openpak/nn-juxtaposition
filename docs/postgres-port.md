# miiverse-api: off MongoDB, onto Postgres (card openpak/prds#20)

From v0.6.0 the API (`apps/miiverse-api`, image `nn-juxtaposition-api`) keeps everything in Postgres. Users, follows,
notifications, web identities, device links and activity posts were already there (Prisma); this port moves the
eight Mongo collections that were left and removes mongoose. The UI moved from Redis to Postgres in v0.7.0.

## Inventory (what Mongo held, live counts on 2026-11-06)

| Collection | Docs | Postgres table | Notes |
| --- | --- | --- | --- |
| `posts` | 41 | `posts` | posts, replies (`parent`), console private messages (`message_to_pid`, `community_id` = conversation id) |
| `communities` | 457 | `communities` | games, sub-communities, announcement rooms, family pages |
| `endpoints` | 3 | `endpoints` | discovery data per server access level |
| `conversations` | 0 | `conversations` + `conversation_users` | the `users` sub-array became rows |
| `reports` | 0 | `reports` | |
| `automodrules` | 0 | `automod_rules` | `keyword_settings.keywords` became `keywords text[]` |
| `automodlogs` | 0 | `automod_logs` | `matches` (list of `{start, end}` ranges) is `jsonb` |
| `logs` | 0 | `audit_logs` | moderation audit log |

Fields: every mongoose schema field became a column with the same snake_case name, so the route code and the console
wire format read the same names. Two fields that the schema did not declare but the sync scripts wrote with raw
collection calls are real columns now: `communities.family` (families.entry.ts) and `communities.art_sha`
(game-communities.entry.ts). `communities.title_ids` (deprecated, on no document) and `__v` are gone. The nested
`permissions` and `icon_paths` objects are plain columns (`permissions_open`, `minimum_new_*_access_level`,
`icon_path_32` ... `icon_path_128`); `CommunityDocument` folds them back so code still reads
`community.permissions.open`. Arrays are `int[]` / `text[]` (`yeahs`, `search_key`, `title_id`, `admins`,
`user_favorites`, `shot_extra_title_id`, `changed_fields`, `keywords`). `jsonb` only for automod match ranges.

IDs: post `id` (21 random characters), `community_id` and `olive_community_id` are kept as they are. Conversation `id`
(snowflake) is kept. Reports, automod rules/logs and audit logs used the ObjectId as their id; imported rows keep the
ObjectId hex as `id`, new rows get a uuid (the id is a string in the internal API either way). Every table has a
nullable unique `legacy_mongo_id` (the ObjectId) for the idempotent import. `endpoints.server_access_level` is unique.

Indexes follow the mongoose ones, minus the array members (arrays get GIN indexes instead):
posts `(community_id, removed, parent, created_at desc)`, `(parent, removed, created_at desc)`,
`(pid, message_to_pid, parent, removed, created_at desc)`, `(topic_tag, message_to_pid, parent, removed, created_at desc)`,
`(message_to_pid, created_at)`, `(created_at)`, GIN `yeahs`, GIN `search_key`; communities unique `community_id`
(primary key) and `olive_community_id`, `(parent, type)`, `(type, created_at)`, `(owner)`, GIN `title_id`,
GIN `user_favorites`. Migration: `src/models/migrations/20261106104729_mongo_collections` (additive only).

### Query shapes and how they map

- equality, `$in`, `$nin`, `$ne`, `$gt(e)`, `$or`, `$and`: Prisma `where` (`in`, `notIn`, `not`, `gt(e)`, `OR`, `AND`).
  Mongo `$ne` also matched a missing field; every column it is used on is NOT NULL (`type`) or the query was
  about NULL itself (`app_data`, `parent`), so the result sets are the same.
- array contains (`{ yeahs: pid }`, `{ title_id: id }`, `{ user_favorites: pid }`, `{ search_key: key }`): `has`;
  `$in` against an array field: `hasSome`; the friend-message lookup that compared the whole array: `equals`.
  Mongoose turned an array given for a scalar field into `$in`; those sites use `in` now.
- `painting: { $nin: [null, ''] }`: `{ not: null, notIn: [''] }`.
- case-insensitive `^name$` regexes: `equals` with `mode: 'insensitive'`. Admin community search: the existing
  `buildPrismaSearchQuery` (`contains`, insensitive); `buildSearchQuery` (Mongo) is deleted.
- sort/skip/limit: `orderBy`/`skip`/`take`. Sorting by `removed_at` keeps Mongo's null order (nulls first going
  up, last going down).
- aggregates: post counts are `count`; WWP empathy totals are `aggregate _sum`; "posts per community in the
  last N hours" is `groupBy ... orderBy _count desc` (Mongo applied `$limit` before `$sort`, so it took arbitrary
  communities; this takes the busiest); `distinct_pid=1` (`$group` by pid, `$first`) is
  `Post.findNewestPerAuthor` (Prisma `distinct: ['pid']`, newest first, then the limit). Mongo's `$group` order was
  undefined; the result is now each author's newest post, newest first.
- `$inc` on `reply_count`: `Post.incrementReplies` (one `UPDATE ... SET reply_count = reply_count + n`). The legacy
  console route did read-modify-write (`parentPost.reply_count + 1; save()`); it is an increment now.
- yeahs (`$addToSet`/`$push` + `$inc`, `$pull` + `$inc`, guarded by `yeahs: { $ne | $eq: pid }`): one conditional
  `UPDATE ... WHERE id = $1 AND NOT ($2 = ANY(yeahs))` with `array_append` / `array_remove`, so concurrent requests
  cannot double-count. A removal never takes `empathy_count` below 0.
- favourites: `addUserFavorite` / `delUserFavorite` are single `array_append` / `array_remove` statements.
- `document.save()`: `PostDocument` / `CommunityDocument` remember the row they were read from and write only the
  columns the caller changed, so a counter another request moved in the meantime is not overwritten.
- id generation: a post without an id gets a random one at insert and a new one on a unique violation (no longer
  check-then-insert). `tryCreateCommunity` retries on Prisma's unique violation (`P2002`) instead of `MongoError 11000`.
- erasure (`services/erase`): same rows as before, now SQL (`eraseMongo` is `eraseContent`).

## Identity: posts store the author's pid only

Owner decision (2026-11-06): console services are adapters over the core; a post keeps no copy of who wrote it.
`posts` has no `screen_name`, `mii` or `mii_face_url` column. The wire format is unchanged: every post the `Post`
facade returns is filled in by `services/identity`:

- console pid: nn-account `account.v2 GetUserData` (the existing gRPC client; nn-account fronts the account and Mii
  core, one Mii per account): `mii.name`, `mii.data`. nn-account hands out the ten character console form of the
  name; when the cached full core name (`users.display_name`) has that console form, the full name is used (the
  profile sync's rule).
- web-only pid: no Mii; the name is `users.display_name` (the core name cached at every web sign-in, already
  allowlisted and watched by openpak-dedup-check). Pakka: its fixed name, no Mii.
- `mii_face_url` is derived (`${cdnUrl}/mii/<pid or default>/<face for feeling_id>.png`), as the post routes built it.
- The console XML (`Post.json`, friend messages) carries the ten character form; the internal/web API the full name.
- Lookups are batched per list (distinct pids, 8 at a time) and cached in memory for 60 s (5000 entries).
- A failed lookup never fails a feed: that post gets the cached display name, or `Player`, and an empty Mii; the
  failure is logged (`identity: account core lookup failed`, pids only) and not cached.

Conversations, reports, automod logs, audit logs and notifications already stored pids only; nothing changed there.
`posts.country_id` / `posts.language_id` stay (allowlisted in `.dedup-allow`): they are per-post Olive param pack
values the console sends with each post (the language a post is written in filters feeds), not the player's
profile. Flagged for the owner in case they want them derived too.

## Chosen not to change

- `posts.message_to_pid` stays text (the documents stored a string and every caller compares strings).
- Private messages are still stored as posts here and forwarded to the core chat store (chat bridge); moving the
  console message store onto the chat core is a separate change.
- `getMostPopularCommunities` sorted by a `followers` field no community has; it still has no meaningful order.
- `post.json()`'s `created_at` format string (`HH:MM:SS`, minutes printed as the month) is upstream's; untouched.
- WWP (`/v1/topics`) stops widening its time window once it reaches back before 2020 (the Mongo version doubled the
  window until the date was invalid).
- `getDuplicatePosts` compares an absent body as `''` (a drawing-only post sent twice in five minutes now counts as
  a duplicate; under Mongo `body: undefined` never matched).
- Erasure corrects a parent's `reply_count` only for deleted posts by other authors (the Mongo logic, kept as is).

## Data migration

`migrations/11-mongo-to-pg/script.cjs` (only needs `pg`, which the image has). Input: one newline-delimited extended
JSON file per collection (`posts`, `communities`, `endpoints`, `conversations`, `reports`, `automodrules`,
`automodlogs`, `logs`), exported with `mongosh`. `--check` resolves every distinct post author against the core
(console pids: nn-account `/internal/resolve/pid`; web-only pids: `web_identities`) and lists the unresolved ones,
exit 3. The import runs the same check first and refuses on any unresolved author unless `--allow-unresolved` is
given. It inserts in one transaction with `ON CONFLICT DO NOTHING` (keyed on `legacy_mongo_id`, so reruns insert
nothing), states how many `screen_name` / `mii` / `mii_face_url` fields it left out, warns about any unknown field,
prints Mongo line counts against Postgres row counts per table before and after, and exits 1 on a mismatch.
Mongo is not written to and stays as the read-only copy until it is retired.

Order on the box: deploy the schema (`npm run migration:deploy` from the new image), export, `--check`, import, then
start the new image. Nothing in the new image creates communities or endpoints on its own, but run the import before
anyone uses `db:seed` or Pakka's community creation against the new database, or an id clash shows up as a mismatch.

## Rollback

Pin the previous API image tag (v0.5.1) and put `PN_MIIVERSE_API_MONGOOSE_URI` back in the environment. Mongo was
never written by the new version, so v0.5.1 continues from the data as it was at the export; anything posted while
v0.6.0 ran exists only in Postgres. The new tables are additive and can stay (v0.5.1 ignores them).
