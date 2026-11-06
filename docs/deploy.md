# Deploy: nn-juxtaposition

Fork of Pretendo's Juxtaposition (AGPL-3.0) run against OpenPak's Wii U/3DS adapter
([`nn-account`](../../nn-account), `account.v2` gRPC) and [`nn-friends`](../../nn-friends).
Two images on tag: `ghcr.io/openpak/nn-juxtaposition-api` (miiverse-api: Postgres and S3; no MongoDB since
v0.6.0, see postgres-port.md) and `ghcr.io/openpak/nn-juxtaposition-ui` (juxtaposition-ui: Redis, the API's gRPC).
Settings are the upstream env schema under `PN_MIIVERSE_API_*` / `PN_JUXTAPOSITION_UI_*`
(`apps/*/src/config.ts`).

## Activity posts

`PN_MIIVERSE_API_ACTIVITY_KEY` (32 or more characters; unset = `POST /internal/v1/activity` answers 404),
`PN_MIIVERSE_API_ACTIVITY_CATEGORIES` (default `badge`), `PN_MIIVERSE_API_ACTIVITY_IMAGE_HOSTS` (default
`rewards.openpak.org,openpak.org`). The endpoint is on the API's HTTP port (20090), private network only: the public host rule for `api.olv.openpak.org` reaches the port, so the endpoint itself answers 404 to anything carrying `X-Forwarded-For`. See activity.md.

## Account erasure

`DELETE /internal/accounts/{account_id}/data` on the API's HTTP port (20090), `Authorization: Bearer
$ACCOUNT_ERASE_KEY`; 503 if unset, 404 when the request carries `X-Forwarded-For`. Answers
`{"service":"nn-juxtaposition","rows":N}`. The API needs `PN_MIIVERSE_API_OPENPAK_NNAS_URL` / `_KEY` to find the
console pid of an account (without them only the web identity pid is erased).

Erased: posts, comments, private messages, conversations, empathy, favourites, reports, automod rows, the user and
all its follows, notifications, web identity, device links and activity data (see the changelog for v0.4.0). Kept:
other people's replies under a deleted post; staff-made communities lose only the owner/admin entry.
