# Game activity (automatic activity posts)

Opt-in posts that say something notable happened to a player, from any console: "Tobi earned the Kart Racer: Wii Era badge".
They live in their own table and feed, not in the console post database, so Wii U and 3DS clients never see them.

## What a player sees

- **Game activity** in the web navigation (`/activity`): tabs Everyone and Following, and a Settings link.
- **Activity** tab on every profile (`/users/<pid>/activity`, `/users/me/activity`).
- **Settings** (`/activity/settings`): a master switch "Post my game activity" and one switch per category. Everything is
  OFF until the player turns it on. Only categories that have a working source are listed.
- A supervised account (parental controls core configured and the account supervised) cannot change the settings and nothing
  is posted for it (the same read-only rule as posting; if the core is unreachable the account counts as supervised).
- A player can remove their own activity posts with the x on each post (a moderator can remove any). Removing a post does not turn the setting off.
- Posts are one line, an icon or OpenPak artwork, and an optional link. Never a game screenshot.

## Categories

| id | Moment | Source today |
| --- | --- | --- |
| `badge` | earned a rewards badge | **live**: the rewards service calls the endpoint when a badge is granted (shop purchase, mission reward, admin or event grant) |
| `splatfest` | won a Splatfest round | no source. The `nex` Splatoon handler sees the Splatfest match upload but not who won |
| `kart` | new Mario Kart record or tournament win | no source. `nex` mario-kart-8 sees the tournament score upload, not a win or a record |
| `maker` | uploaded a Mario Maker course | no source yet. The signal exists (`maker_courses_uploaded` event in rewards) |
| `trophy` | PS3 trophy or Xbox 360 achievement | no source. `np-trophy` and `x360-progress` hold the data but do not emit |
| `trade` | completed a Pokémon trade | no source yet. The signal exists (`trades_completed` event in rewards) |

`PN_MIIVERSE_API_ACTIVITY_CATEGORIES` (default `badge`) lists the categories a source exists for. Only those get a switch, and an
event in any other category is answered `not_opted_in`. Add a category to the list in the same release that adds its source.

### Adding a source

The rewards service already receives game events (`POST /internal/v1/events`, shared client `rewards-emit`) and resolves the
console identity to the core account id. The hook for `maker` and `trade` is there: after an event with metric
`maker_courses_uploaded` or `trades_completed` is `counted`, rewards calls the endpoint below with category `maker`/`trade`,
`event_id` = the event's id, `subject` = course name or Pokémon, `link` = the OpenMaker course page. For `splatfest`, `kart`
and `trophy` the game server or `np-trophy`/`x360-progress` needs a new emit at the point it learns the win, record or unlock
(a win is not an existing metric). Then add the category to `PN_MIIVERSE_API_ACTIVITY_CATEGORIES`.

## Endpoint: `POST /internal/v1/activity`

Served by `nn-juxtaposition-api` (HTTP 20090) on the private network only; it is not routed publicly, and a request that came through the public proxy (has `X-Forwarded-For`) is answered 404 even with the key. Header
`X-Internal-Key: <PN_MIIVERSE_API_ACTIVITY_KEY>`. Without the setting the endpoint answers 404.

```json
{ "event_id": "badge:<account>:badge-first-steps",
  "account_id": "<core account id>",
  "category": "badge",
  "subject": "First Steps",
  "link": "https://openpak.org/account/rewards",
  "image": "https://rewards.openpak.org/v1/items/badge-first-steps/preview",
  "occurred_at": "2026-11-02T10:00:00Z" }
```

- `event_id` is the idempotency key (stable per real moment, never random). A repeat answers `duplicate` and changes nothing.
- `subject` is required (1 to 80 characters, no markup); the text around it comes from the category and the viewer's language.
- `link` must be a path on this site or an https link to `openpak.org` or a subdomain; anything else is dropped.
- `image` must be https on a host in `PN_MIIVERSE_API_ACTIVITY_IMAGE_HOSTS` (default `rewards.openpak.org,openpak.org`); anything else is dropped.
- `occurred_at` older than 7 days is rejected.

Answer `200 {"event_id","status"}`:

| status | meaning |
| --- | --- |
| `posted` | a post was created |
| `digested` | over the limit; counted in the day's digest post |
| `duplicate` | `event_id` seen before |
| `not_opted_in` | the player has it off (or the category has no source) |
| `no_account` | the account never signed in to OpenVerse, so there is nothing to opt in with |
| `supervised` | the account is supervised |

`400` invalid request or `rejected`; `401` bad key. None of these statuses should be retried except a 5xx.

## Rate limit and digest

At most 10 posts per account per UTC day and 4 within 10 minutes. A moment past either limit is stored (so a retry stays a
duplicate) and counted in one digest post per account per day ("3 more moments today"); the digest moves to the top when it grows.

## Data

Migration `20261102100000_activity_posts`: `activity_settings` (per account: `enabled`, `categories`) and `activity_posts`.
Keyed by the OpenPak account id like `web_identities`. Settings and posts are not yet removed by the account erasure flow (follow-up).

## Config

`PN_MIIVERSE_API_ACTIVITY_KEY` (shared secret, 32 or more characters), `PN_MIIVERSE_API_ACTIVITY_CATEGORIES`,
`PN_MIIVERSE_API_ACTIVITY_IMAGE_HOSTS`. The rewards service gets `REWARDS_VERSE_URL` and `REWARDS_VERSE_KEY`.
