# Next session — nn-juxtaposition

Updated 2026-09-24.

Miiverse for Wii U and 3DS: Pretendo's Juxtaposition (AGPL) forked onto the
OpenPak core. Deployed 2026-09-10 behind Traefik TLS (`*.olv.nintendo.net`,
OpenPak CA leaf), tagged `v0.1.0`, never console-verified. The working tree
carried the WU-4 outbound chat bridge; committed and tagged v0.2.0 on 2026-09-24 (bridge off on prod until its env is set).

## Where things stand

- Two images on tag: `ghcr.io/openpak/nn-juxtaposition-api` (miiverse-api:
  Postgres, MongoDB, S3; 20090) and `-ui` (juxtaposition-ui: Redis; 20100).
  Push a tag, Actions builds, `podman-auto-update` picks it up.
- Last commit is the fork point `05127506` (tag-driven ghcr release of both
  images); everything below it is upstream Pretendo history.
- In-flight (uncommitted, ~4 dirty files):
  - `apps/miiverse-api/src/config.ts` — new `config.openpak.*` block
    (`chatUrl`, `chatKey`, `nnasUrl`, `nnasKey`); empty URL = bridge off,
    behaviour identical to upstream, so the fork stays deployable anywhere.
  - `apps/miiverse-api/src/services/openpak-chat-bridge.ts` (new) — resolves
    PIDs to core accounts via nn-account `/internal/resolve/pid?namespace=wiiu`,
    POSTs the message to the neutral chat store (`kind` =
    text/painting/screenshot/app_data, `dedup_key` = post id). Fire-and-forget
    by policy; every failure degrades to "message stays console-local".
  - `friend_messages.ts` POST route — calls the bridge, never awaited.
  - `package-lock.json` churn; untracked `CHANGELOG.md` + `prds/` placeholder.
- Outbound is the whole bridge today. The inbound half (a phone message
  appearing in the console feed) is specified as pull-time ingestion in the
  `friend_messages.ts` GET and deliberately unshipped until it can be tested
  against a live Miiverse (wiiu PRD §3 gap 3).
- WU-4 DoD: inbound bridge shipped + one phone message visible on a Wii U.

## Next steps

1. Commit the outbound bridge, add the four env values to the deploy env
   (upstream `PN_MIIVERSE_API_*` schema), tag, let the release flow run.
2. Inbound ingestion in the `friend_messages.ts` GET once a console can
   exercise it — until then it stays specified-only.
3. First console sign-in against Miiverse at all: Wii U via `nn-inkay` or the
   hackless SSSL path, 3DS via `nimbus.cia` (`nn-nimbus` openpak-v1). Every
   "deployed" claim above converts to "verified" only then.

## Pointers

- `README.md` — images, env schema, upstream docs link.
- `apps/miiverse-api/src/services/openpak-chat-bridge.ts` — the bridge, with
  the policy comments.
- `../../prds/platform-wiiu-prd.md` — §3 gap 3 (chat), WU-4 milestone.
- `../../prds/platform-3ds-prd.md` — DS3-6 (Miiverse on the neutral store).
- `../../ports.md` — rows 20090/20100, the Traefik TLS row.
