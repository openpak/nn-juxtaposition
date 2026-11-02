# OpenVerse Lite

Small server-rendered pages so the built-in browsers of older consoles can read and post on
OpenVerse, plus a read-only feed for the OpenPak Xbox 360 dashboard. Code: `apps/juxtaposition-ui/src/lite/`,
internal API `deviceLinks.*` in `apps/miiverse-api`.

## Can these browsers reach verse.openpak.org?

`verse.openpak.org` is behind Cloudflare. Measured against it (OpenSSL):

| Offer | Result |
| --- | --- |
| TLS 1.2 | works (ECDSA P-256 certificate, Google Trust Services WE1 / GTS Root R4) |
| TLS 1.0 / 1.1 with `ECDHE-ECDSA-AES128-SHA` | accepted |
| TLS 1.0 with an RSA suite (`AES128-SHA`, 3DES, RC4) | handshake failure (alert 40) |
| SSL 3.0 | refused |

So the server side would still talk TLS 1.0, but only with an elliptic-curve certificate that chains to a
2016 root and, normally, SNI. The browsers below are from 2007 to 2012 and ship RSA-era cipher lists and
root stores. Treat HTTPS to verse.openpak.org as **not reachable** from the Wii and the DSi, and as
**not expected** from the PS3.

| Device | Browser | Screen | Notes (from public browser documentation, not captured here) |
| --- | --- | --- | --- |
| PS3 | NetFront-derived, later WebKit-based (UA `PLAYSTATION 3 4.xx`) | 1280x720 | CSS 2.1, limited JS; old TLS and an old root store that cannot be updated except by firmware; text input with the on-screen keyboard |
| Wii | Internet Channel, Opera 9.x (UA `Opera/9.30 (Nintendo Wii; ...)`) | 640x480 | CSS 2, JS, cookies; SSL 3 / TLS 1.0 only; Opera's own root store; Wiimote pointer, on-screen keyboard |
| DSi | DSi Browser, Opera 9.5 based (UA `Opera/9.50 (Nintendo DSi; ...)`) | 256x192, about 240x176 usable | text and small images, cookies; SSL 3 / TLS 1.0 at best; stylus and on-screen keyboard |
| Xbox 360 | none usable | | the OpenPak dashboard reads a feed instead (below) |

## The Lite host

Lite is therefore its own host, **plain HTTP on port 80, served from our own edge, not through Cloudflare**:
`lite.verse.openpak.org`. Traefik routes it on the `web` entrypoint (port 80, nft redirects 80 to 21081)
to `openpak-nn-juxtaposition-ui:20100`, exactly like the Wii/DS WFC hosts (`nas.openpak.org`, `*.gs.openpak.org`)
and the Xbox 360 services. The UI picks Lite by host (`PN_JUXTAPOSITION_UI_LITE_HOSTS`, default
`lite.verse.openpak.org`).

Name resolution:

- A Wii or DS using OpenPak's DNS already resolves every `.openpak.org` name to the box (the `wii` and `ds`
  profiles list `.openpak.org` as a family).
- Anyone else needs a public record. It must be **DNS only (grey cloud)**: a proxied record would put
  Cloudflare, and its TLS floor, back in the way and would not serve port 80 from our box.

  `lite.verse.openpak.org  A  145.241.199.19  (proxy status: DNS only)`
- The PS3 profile in the network map lists only Sony names, so a PS3 on OpenPak DNS needs the public record
  (or `.openpak.org` added to the PS3 family).

HTTPS is not offered on this host: no certificate we can issue is trusted by these browsers, and a
self-signed one would only train people to click through warnings.

## Security on plain HTTP

Nothing secret is typed or shown on the console.

- **No password ever.** Sign-in is a link code. The console shows `ABC-DEF` (6 characters, no `0 O 1 I L`).
  The person types it at `https://verse.openpak.org/devices` while signed in through openpak.org, sees
  "A PlayStation 3 asked to be linked" and confirms. Every form on that page carries a per-session token.
- **The code is not a credential.** The console polls with a secret only it holds (`s=` in the link page URL),
  from the same IP address that asked for the code. The first poll after approval receives the token, once
  (Redis GETDEL); codes live 10 minutes. Approving, checking and polling are rate limited.
- **The device token** (`ovd1.` + 32 random bytes) is stored as SHA-256 only. The console keeps it in a
  host-only cookie `ovl` (`HttpOnly`, `SameSite=Lax`, one year; it cannot be `Secure` on HTTP). The same
  token is accepted as `Authorization: Bearer` by the Xbox 360 feed, only for devices linked as `x360`.
- **Revocable.** `https://verse.openpak.org/devices` (Devices in the top bar) lists linked devices and removes
  them; "Sign this device out" on the console does the same. A removed token stops working on its next request.
  An account can hold 12 devices.
- **What a sniffed token allows:** reading OpenVerse and posting text, replying and sending Yeahs as that account,
  until the person removes the device. It cannot sign in anywhere else, reach account settings, openpak.org
  or other services, and it is not sent to verse.openpak.org (host-only cookie). This is the cost of plain HTTP and
  is why Lite carries no more than that. Do not use Lite on a network you do not trust.
- **Supervised accounts** follow the parent-controlled level: off (Lite says a parent or guardian turned OpenVerse off; the feed answers `openverse_off`), read (read-only) or read and post.
  The same server-side check as the web (`readOnly`, parental controls
  when configured) applies to every Lite write; the forms are hidden and a forced POST is refused. A banned
  account sees "not available". The community rules gate is passed before a link can be created, because
  `/devices` sits behind it.

## Pages

`/` sends the browser to `/ps3/`, `/wii/` or `/dsi/` by user agent (anything else gets the PS3 sizing); the
path always wins, so any browser can open any class.

| Path | What |
| --- | --- |
| `/<c>/link` | shows the code; reloads itself every 5 seconds; on approval sets the cookie |
| `/<c>/` | latest posts |
| `/<c>/c`, `/<c>/c/<id>` | communities, a community with a post form |
| `/<c>/p/<id>` | a post with replies, Yeah button, reply form |
| `/<c>/me`, `POST /<c>/signout` | this device, sign out |
| `/<c>/about` | what this is, the AGPL credit |
| `/img/paintings/...` | drawings, proxied from the CDN (that host speaks modern TLS only) |

| | PS3 | Wii | DSi |
| --- | --- | --- | --- |
| Per page | 10 | 6 | 4 |
| Width | 880 px | 580 px | full screen |
| Font | 18 px | 18 px | 12 px |
| Posts in lists | whole | cut at 140 | cut at 90 |
| Mark and drawings | yes | yes | no, text only |

HTML 4.01, one inline stylesheet (CSS 1/2 only, no flexbox, variables or media queries), no JavaScript, no web
fonts, no `<link>`. Posts are text only (280 characters, the same limit as the web); drawing from these browsers
is not offered. Forms use POST and redirect (302) back to the page.

## Xbox 360 feed

For the OpenPak replacement dashboard (this repo does not touch the dashboard). Same host, path `/x360/v1`,
plain HTTP like the other x360 services. JSON by default; XML with `?format=xml` or `Accept: application/xml`.
Read-only: there is no write route.

Linking, from the dashboard:

1. `POST /x360/v1/link/start` returns `{"code":"ABC23X","display_code":"ABC-23X","poll_secret":"...","approve_url":"https://verse.openpak.org/devices","expires_in":600,"poll_every":5}`. Show `display_code` and `approve_url`.
2. `POST /x360/v1/link/poll` with `{"code":"ABC23X","secret":"<poll_secret>"}` (JSON or form). Answers `{"status":"pending"}`, `{"status":"expired"}`
   or, once, `{"status":"approved","token":"ovd1...."}`. Store the token. Poll from the same IP that called `start`.
3. Send `Authorization: Bearer <token>` on every read. A revoked or unknown token gets `401`.

Reads (`limit` 1 to 25, default 10; `offset`):

| Request | Answer |
| --- | --- |
| `GET /x360/v1/feed` | one call for a tile: `generated_at`, `account.display_name`, `unread_notifications`, `communities[]` (10), `posts[]` (recent, `limit`) |
| `GET /x360/v1/communities` | `communities[]`, `total`, `next_offset` |
| `GET /x360/v1/communities/<id>/posts` | `community`, `posts[]`, `next_offset` |
| `GET /x360/v1/posts/<id>` | `post`, `replies[]` (oldest first), `next_offset` |
| `GET /x360/v1/activity` | posts from people the account follows (and its own), `unread_notifications`, `next_offset` |
| `GET /x360/v1/me` | `display_name`, `read_only: true` |

Post: `id`, `created_at` (ISO 8601 UTC), `community {id,name}`, `author {name}`, `body`, `drawing_url` (absolute
`http://lite.verse.openpak.org/img/paintings/...` PNG, 320x120, or `null`), `yeahs`, `replies`, `parent_id`.
Community: `id`, `name`, `description`, `followers`. Errors: `{"error":"unauthorized|not_found|rate_limited|server_error"}`
with the matching status; 120 requests a minute per address.

XML mirrors the JSON: the root is `<feed>`, `<communities>`, `<posts>`, `<thread>`, `<activity>`, `<me>`, `<link>` or `<error>`;
arrays are `<communities><community>...`, `<posts><post>...`, `<replies><item>...`; `null` is an empty element.

## Internal API for the device-link logic

For the OpenVerse web rebuild (or any other service on the private network). These are routes of the miiverse-api internal API
(`/api/v1`, reachable only through the API-key gRPC channel, like `/sso/*`); the caller has already authenticated the person.
All are `POST` with a JSON body. Device classes: `ps3`, `wii`, `dsi`, `x360`, `lite`.

| Operation | Path | Body | Answer |
| --- | --- | --- | --- |
| `deviceLinks.create` | `/device-links` | `{accountId, deviceClass}` | `{id, token, deviceClass, label}` (the token is shown once); `403 forbidden` reason `too_many_links` at 12 active links |
| `deviceLinks.resolve` | `/device-links/resolve` | `{token}` | `{id, accountId, pid, deviceClass}`, or `null` for an unknown or revoked token; `pid` is the account's current OpenVerse number |
| `deviceLinks.list` | `/device-links/list` | `{accountId}` | `{items: [{id, deviceClass, label, createdAt, lastUsedAt}]}`, active links only |
| `deviceLinks.revoke` | `/device-links/revoke` | `{accountId, id}` | `{status: "success"}`; `404` if it is not that account's active link |

Code approval (the step before `create`) lives in Redis, `apps/juxtaposition-ui/src/lite/linkCodes.ts`: `verse-lite:code:<CODE>` holds
`{deviceClass, secretHash, ip, createdAt, accountId|null}` for 10 minutes. The device side `startLink` writes it; the web side `peekCode` shows what is
asking and `approveCode(code, accountId)` sets `accountId`; the device's `pollCode(code, secret, ip)` consumes it once (GETDEL) and then calls `deviceLinks.create`.
A Go service can reimplement those four calls against the same key shape; the token table behind the four routes is what must be shared.
Web pages: `GET /devices` (link form, list), `POST /devices/check` (code, then the confirm step), `POST /devices/approve`, `POST /devices/revoke`, all with a per-session `k` form token.

## Deploy

1. Migration `20261102110000_device_links` (`npm run migration:deploy`).
2. Traefik (box, `~/openpak/deploy/traefik/dynamic.yml`): router `verse-lite` on entrypoint `web`,
   `Host(\`lite.verse.openpak.org\`)`, service `nn-juxtaposition-ui` (`http://openpak-nn-juxtaposition-ui:20100`).
3. Public DNS record (above) for anyone not using OpenPak DNS.
4. Optional env on the UI unit: `PN_JUXTAPOSITION_UI_LITE_HOSTS`, `PN_JUXTAPOSITION_UI_LITE_CDN_INTERNAL_URL`,
   `PN_JUXTAPOSITION_UI_LITE_APPROVE_URL` (defaults are the production values).
