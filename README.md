# Wii U/3DS Miiverse Server

OpenPak's Wii U/3DS Miiverse Server.

| | |
| --- | --- |
| Network | Wii U, 3DS |
| Role | Miiverse API (`miiverse-api`) and the Juxtaposition UI (`juxtaposition-ui`) that serves the frontend for Wii U, 3DS and web |
| Depends on | [`nn-account`](https://github.com/openpak/nn-account), [`nn-friends`](https://github.com/openpak/nn-friends), PostgreSQL, MongoDB, S3, Redis |
| Image | `ghcr.io/openpak/nn-juxtaposition-api`, `ghcr.io/openpak/nn-juxtaposition-ui` |
| Based on | [Pretendo `juxtaposition`](https://github.com/PretendoNetwork/juxtaposition) (AGPL-3.0) |
| Licence | AGPL-3.0-only |

## What it serves

| Component | What |
| --- | --- |
| `miiverse-api` | The Miiverse API, backed by Postgres, MongoDB and S3 |
| `juxtaposition-ui` | The frontend for all platforms, backed by Redis and the API's gRPC |

## Run

Local development (dependencies in Docker, then the two apps):

```sh
cd .docker && docker compose up -d
cd apps/miiverse-api && npm i && npm run migration:deploy && npm run dev
cd apps/juxtaposition-ui && npm i && npm run dev
```

Each app needs a `.env` with its `*_USE_PRESETS=docker` line first. The full setup
is in [docs/development.md](docs/development.md); settings and images are in
[docs/deploy.md](docs/deploy.md).

## Docs

- [Protocol](docs/protocol.md)
- [Evidence](docs/evidence.md)
- [Deploy](docs/deploy.md)
- [Notes](docs/notes.md)
- [Upstream README](docs/upstream.md)
- [Development setup](docs/development.md)
- [Extra topics](docs/extra-topics.md)

## Licence

AGPL-3.0-only. See [LICENSE](LICENSE).
