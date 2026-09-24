# Next session — nn-juxtaposition

Updated 2026-09-24.

Miiverse for Wii U and 3DS: Pretendo's Juxtaposition (AGPL) forked onto the
OpenPak core. Deployed 2026-09-10 behind Traefik TLS (`*.olv.nintendo.net`,
OpenPak CA leaf), tagged `v0.1.0`, never console-verified. The working tree
carried the WU-4 outbound chat bridge; committed and tagged v0.2.0 on 2026-09-24 — **bridge ON in prod since 2026-09-24 20:32 UTC**: the four `PN_MIIVERSE_API_OPENPAK_{CHAT,NNAS}_{URL,KEY}` values are in the shared `.env` (chat at `openpak-chat:20130`, nn-account resolve at `openpak-nn-account:20050`); from inside the api container chat answers, the chat key is accepted, and both linked Wii U PIDs resolve. Not yet exercised by a console post.

Current status 2026-09-24: latest tag v0.2.1 (67da0b64); `dev` clean except a
`package-lock.json` change that is not part of this work.

## Where things stand

- Two images on tag: `ghcr.io/openpak/nn-juxtaposition-api` (miiverse-api:
  Postgres, MongoDB, S3; 20090) and `-ui` (juxtaposition-ui: Redis; 20100).
  Push a tag, Actions builds, `podman-auto-update` picks it up.
- Fork point `05127506` = v0.1.0 (tag-driven ghcr release of both images);
  everything below it is upstream Pretendo history.
- WU-4 outbound bridge committed in `31d78675`, tagged v0.2.0; v0.2.1
  (`67da0b64`) makes the `openpak` block default to off when its env is
  absent (v0.2.0 refused to start without it, rolled back on prod):
  - `apps/miiverse-api/src/config.ts` — `config.openpak.*` block
    (`chatUrl`, `chatKey`, `nnasUrl`, `nnasKey`); empty URL = bridge off,
    behaviour identical to upstream, so the fork stays deployable anywhere.
  - `apps/miiverse-api/src/services/openpak-chat-bridge.ts` — resolves
    PIDs to core accounts via nn-account `/internal/resolve/pid?namespace=wiiu`,
    POSTs the message to the neutral chat store (`kind` =
    text/painting/screenshot/app_data, `dedup_key` = post id). Fire-and-forget
    by policy; every failure degrades to "message stays console-local".
  - `friend_messages.ts` POST route — calls the bridge, never awaited.
- Outbound is the whole bridge today. The inbound half (a phone message
  appearing in the console feed) is specified as pull-time ingestion in the
  `friend_messages.ts` GET and deliberately unshipped until it can be tested
  against a live Miiverse (wiiu PRD §3 gap 3).
- WU-4 DoD: inbound bridge shipped + one phone message visible on a Wii U.

## Next steps

1. ~~Commit the outbound bridge, add the four env values, tag~~ — done (v0.2.1, env set
   2026-09-24). Watch the api log on the first console friend message.
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

## Scratch (research and throwaway work)

Decompiles, Ghidra projects, dumps, exefs/romfs extracts, packet captures,
strace and emulator logs, probe harnesses: put them in
`~/REPOS/Openpak/scratch/<topic>`. That folder is a local mount of the media pool,
outside every repository, so nothing in it is committed. Never use `/tmp` (a
shared 15 GB RAM disk) or elsewhere on `/home` for this. Keys and signing
material never go there. Rule: `docs/playbooks/conventions.md` in the workspace.
