# OpenVerse web sign-in (openpak.org SSO)

The web UI has no sign-in form. `GET /login` on the canonical host (`PN_JUXTAPOSITION_UI_HTTP_BASE_URL`,
`openverse.openpak.org`) redirects to openpak.org's `/account/sso/authorize` (client `openverse`, state, PKCE S256).
Any other web host (`juxt.openpak.org`) answers `/login` with a 301 to the canonical host, so sign-in only
happens there. The contract is the website's `docs/sso.md`.

- `GET /login/callback`: checks `state` against the session, then POSTs the code to
  `http://openpak-website:20010/internal/sso/token` (HTTP Basic `openverse:<secret>`,
  `SSO_CLIENT_OPENVERSE_SECRET` from the shared `.env`, never logged). Result `{account_id, display_name, wiiu_pid}`.
- `wiiu_pid == null`: a page says no Wii U/3DS is linked, with a link to openpak.org's account page. No session is created.
- Otherwise the session (Redis, regenerated after sign-in) keeps `{accountId, displayName, wiiuPid}`.
- `GET /logout` destroys the session and sends the browser to openpak.org's `/account/sso/logout`.
- Config: `PN_JUXTAPOSITION_UI_SSO_{CLIENT_ID,CLIENT_SECRET,AUTHORIZE_URL,LOGOUT_URL,TOKEN_URL,LINK_URL}`.

## How the session reaches the miiverse-api

The UI sends `x-trusted-pid: <wiiu_pid>` on its internal API calls. `apps/miiverse-api` (`auth-populate.ts`)
accepts it as a third authentication method next to `x-service-token` (consoles) and `x-oauth-token`
(old web login) and loads the account by PID. It is safe because the internal Express app is reachable only
through the gRPC `sendPacket` channel, which requires the shared API key; browsers and consoles cannot set it.
This needed no change to nn-account. Console login (NNAS service tokens) is untouched.
