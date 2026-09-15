# Ports — nn-juxtaposition (trimmed)

> Trimmed copy for this repository; the canonical document lives at
> `Openpak/ports.md` and governs. Last synchronised 2026-09-15.

One block per concern, nothing below 20000, nothing at or above 27000 (Photon-Nextendo and
Steam live there). Every service reads its listeners from `<SVC>_HTTP_ADDR`, `<SVC>_GRPC_ADDR`,
`<SVC>_METRICS_ADDR`; the values below are the defaults and the local-run convention. Each
service owns a block of ten: +0 HTTP, +1 gRPC, +2 metrics/pprof, +3..+9 spare.

## Miiverse blocks

| Block | Service | HTTP | gRPC | metrics |
| --- | --- | --- | --- | --- |
| 20090 | `nn-juxtaposition-api` (Miiverse API: Postgres `miiverse`, MongoDB, MinIO) | 20090 | 20091 | 20092 |
| 20100 | `nn-juxtaposition-ui` (Miiverse portal / 3DS / web; Redis sessions) | 20100 | — | 20102 |

Other services' rows live in the canonical ports.md.
