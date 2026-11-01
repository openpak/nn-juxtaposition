# Deploy: nn-juxtaposition

Fork of Pretendo's Juxtaposition (AGPL-3.0) run against OpenPak's Wii U/3DS adapter
([`nn-account`](../../nn-account), `account.v2` gRPC) and [`nn-friends`](../../nn-friends).
Two images on tag: `ghcr.io/openpak/nn-juxtaposition-api` (miiverse-api: Postgres, MongoDB,
S3) and `ghcr.io/openpak/nn-juxtaposition-ui` (juxtaposition-ui: Redis, the API's gRPC).
Settings are the upstream env schema under `PN_MIIVERSE_API_*` / `PN_JUXTAPOSITION_UI_*`
(`apps/*/src/config.ts`).

## Activity posts

`PN_MIIVERSE_API_ACTIVITY_KEY` (32 or more characters; unset = `POST /internal/v1/activity` answers 404),
`PN_MIIVERSE_API_ACTIVITY_CATEGORIES` (default `badge`), `PN_MIIVERSE_API_ACTIVITY_IMAGE_HOSTS` (default
`rewards.openpak.org,openpak.org`). The endpoint is on the API's HTTP port (20090), private network only: the public host rule for `api.olv.openpak.org` reaches the port, so the endpoint itself answers 404 to anything carrying `X-Forwarded-For`. See activity.md.
