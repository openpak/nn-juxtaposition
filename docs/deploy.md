# Deploy: nn-juxtaposition

Fork of Pretendo's Juxtaposition (AGPL-3.0) run against OpenPak's Wii U/3DS adapter
([`nn-account`](../../nn-account), `account.v2` gRPC) and [`nn-friends`](../../nn-friends).
Two images on tag: `ghcr.io/openpak/nn-juxtaposition-api` (miiverse-api: Postgres, MongoDB,
S3) and `ghcr.io/openpak/nn-juxtaposition-ui` (juxtaposition-ui: Redis, the API's gRPC).
Settings are the upstream env schema under `PN_MIIVERSE_API_*` / `PN_JUXTAPOSITION_UI_*`
(`apps/*/src/config.ts`).
