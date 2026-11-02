# Upstream README: nn-juxtaposition

# Juxtaposition

Juxtaposition is the Pretendo made Miiverse replacement and successor.

## Philosophy

This project is not meant to be just a simple clone of Miiverse. We aim to evolve it and bring the platform into the modern era.

This means we both want to bring all features originally found in Miiverse into Juxtaposition, but go even further with even more features.

## Limitations

- The web platforms on the 3DS and Wii U are old, thus we need to use old web methodologies like AJAX. 
- The XML API of the Miiverse platform cannot be modified or extended, it needs to stay exactly as the consoles expect it.

# Development

Follow [this guide](./development.md) on how to get set up for local development.

# Translation

If you'd like to help localize Pretendo Network, you can contribute to the translations on our project on [Weblate](https://hosted.weblate.org/engage/pretendonetwork/).

# Upstream vs OpenPak

Upstream: `PretendoNetwork/juxtaposition`. This repo's history was rewritten at the fork
(v0.1.0), so its hashes differ from upstream's; the trees matched exactly at upstream
`6d2718eb` (PR #585). Upstream `dev` (`b4963d0e`, PR #631) was brought in with
one graft merge commit (parents: our `dev` and `upstream/dev`), so from here on
`git fetch upstream && git merge upstream/dev` works normally. Remote: `upstream`.

## Taken from upstream (150 commits since #585)

Markdown + mentions in posts (new `packages/common`, vitest suite), Wii U notification pulsing,
fixed notifications endpoint (#626), profile-picture borders, topic/removed-by display,
frontend "islands" refactor, shared tsconfig/eslint for webfiles, PNID stored in the user table
with `migrations/10-pnid-populate`, garage-based dev compose, Weblate locale updates, new CI
test workflow.

## Looked at and not taken

| Upstream | Why not |
| --- | --- |
| Draft PR #620 `feat/bunch-of-stuff-to-pg` (automod, discovery, reports, audit logs to Postgres) | Draft, moves discovery and reports to Postgres with data migrations. Take it when upstream marks it ready; until then our discovery stays on Mongo `endpoints`. |
| PR #595 `feat/grpc-api` | Open, new gRPC surface. Not needed by OpenPak yet. |
| PR #604 `work/pjax-nonsense` | Open, 3DS/portal navigation rewrite. Conflicts with the islands refactor already merged; wait for it to land. |
| `work/totally-image-processing` (3DS image upload + title-id checks) | Commit message: "not done yet no eta". Based on a pre-TypeScript tree (conflicts in 10+ files). The 3DS post form in `dev` already has text, drawing and screenshot tabs. |
| `work/ctr-pjax-forms`, `work/ctr-ui-stuff`, `work/3ds-reporting` | Stale or WIP branches; superseded by merged PRs (#580, #583) or still open. |
| `patch/guest-access` | One-line `webAuth` guest check; verify against `dev` before taking (guests already work through `guards.guest`). |
| PR #635 topic tags on web, #624 Weblate | Open; Weblate gets merged with the next upstream sync. |

## Ours (OpenPak)

- WU-4 chat bridge (`openpak-chat-bridge.ts`), outbound only.
- Release by tag: GHCR images for api and ui.
- `/cdn/<key>` media route on the API (MinIO read-through) and the working `db:seed` for
  discovery endpoints (`services/cdn`, `seed.entry.ts`, `services/discovery/endpoints.ts`).
- vitest setup in `apps/miiverse-api`, CI test matrix extended.
