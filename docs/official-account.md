# The official Pakka account

Pakka, OpenPak's assistant, has a verified OpenVerse account: display name "Pakka", a check mark on its posts and profile, and an avatar in the OpenPak site-mark style (rendered by `renderPakkaAvatar`; the source art is the `pakka` mark in the private brand folder).

It is a service identity, not a player:

- Its PID is `OFFICIAL_PID` (2000000000), inside the web-only range and far above the sequence. It has no `web_identities` row, so no sign-in can resolve to it. The user row and avatar are created on first use.
- The only way to act as it is the key-protected routes below. With no `PN_MIIVERSE_API_OFFICIAL_KEY` they answer 404, and so do requests that came through the public Traefik route (they carry `X-Forwarded-For`), exactly like `POST /internal/v1/activity`. The key goes in `X-Internal-Key`.
- What Pakka may post, and what needs staff approval, is decided on Pakka's side (see Pakka's `docs/publisher.md`). This service only authenticates and keeps writes safe to repeat.

Routes (`/internal/v1/official`, served by the API container next to the console API):

| Route | What |
| --- | --- |
| `GET /account` | Creates the account if needed and answers its pid, name and profile URL |
| `GET /communities?id=&titleId=&name=` | Finds a community (id, then title id in hex or decimal, then name) |
| `POST /communities` | Creates a community with generated artwork, or answers the existing one (by title id, then name) |
| `POST /posts` | `{eventId, community:{id,titleId,name}, body, image?, discuss?}`. The post id is derived from `eventId`, so the same event always answers the same post (`created:false`). `discuss` appends a "Discuss" link to the post's own page. `image` is a base64 JPEG and only works in a community that has a title id |
| `DELETE /posts/{id}` | Removes one of Pakka's own posts. Other posts are never touched |
| `GET /top?days=&limit=` | The most Yeah'd public posts of the last days (never Pakka's own), the raw material of the weekly highlights draft |

Official posts skip the duplicate-post check and automod (staff-controlled content) and are marked `verified`. Posts reach every OpenVerse surface that reads the feed (web, the Wii U and 3DS apps, OpenVerse Lite, the Xbox 360 feed).
