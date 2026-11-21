# Nexora Dashboard

Control panel for **Nexora**. Discord is only used to sign in and read server permissions.

Confirmed bot user ID: `1520326181025615892`.

No existing Nexora Prime source archive was in this project, so command modules, AI providers, and the original application schema were not modified. This panel does not invent those controls. It signs users in with Discord, reads live bot data when credentials exist, and stores reviews, settings, and logs in the connected database.

## What is real

- Discord OAuth2 authorization-code login (`identify`, `guilds`, `email`, and `guilds.members.read`). The button sends the browser to Discord. If the client id, client secret, or session secret is missing, login returns an error and does not create a session.
- Sessions are HttpOnly cookies. Access tokens stay encrypted in the database. They are never written to browser storage.
- Server management requires the signed-in account to be the owner or to have Administrator or Manage Server. The check uses the guild list Discord returned, not a value from the page.
- Bot profile, server count, and verification use the bot token and Discord’s API. Gateway status, uptime, latency, and aggregate member count stay **Unavailable** until the bot process reports them.
- If the connected token’s user ID is not `1520326181025615892`, the panel shows a configuration error and does not treat that account as Nexora Prime.
- Approve, reject, save, and reset write to the database and append an audit row.

## Server environment

Set these on the host. Do not commit real values. Names that are missing are listed on the sign-in page; values are not.

| Name | Purpose |
| --- | --- |
| `DISCORD_BOT_ID` | Optional. If set, it must be `1520326181025615892`. |
| `DISCORD_CLIENT_ID` | OAuth application ID. Not the same field as the bot token. |
| `DISCORD_CLIENT_SECRET` | OAuth client secret. Server only. |
| `DISCORD_REDIRECT_URI` | Exact callback. This project uses `https://nexoradash.sryze.cc/callback`. |
| `DISCORD_OWNER_ID` | Discord user ID allowed to open the owner console. |
| `SESSION_SECRET` | Long random string used to encrypt stored Discord tokens. |
| `DATABASE_URL` | Postgres connection string. On this host it is injected when the app is deployed. The preview uses a local database when it is unset. |
| `DISCORD_BOT_TOKEN` | Bot token for profile, guild list, and per-server member counts. |
| `BOT_RUNTIME_URL` | HTTPS status URL, or HTTP on localhost / a private network. |
| `BOT_RUNTIME_SECRET` | Shared secret for the status URL and the bridge below. |
| `NEXORA_MONITOR_SECRET` | Shared secret for `POST /api/bot/latency`. Server only. Same value on the bot host. |

Generate a session secret with a password manager or `openssl rand -base64 48`.

## Discord Developer Portal

1. Open the application that owns bot `1520326181025615892`.
2. OAuth2 → Redirects. Keep `https://nexoradash.sryze.cc/callback` registered. The panel also accepts `/auth/discord/callback` if you add that URI.
3. Do not put the bot token or client secret in frontend code.
4. The invite link is created only after `DISCORD_CLIENT_ID` is set. It asks for the `bot` and `applications.commands` scopes and does not force a permission integer.

## Bot bridge

Run the existing discord.py process separately. This web app cannot see gateway latency from a bot ID alone.

The bot posts Discord gateway latency to `POST /api/bot/latency`. This is not the SillyDev process latency. Send `Authorization: Bearer <NEXORA_MONITOR_SECRET>` and:

```json
{
  "bot_id": "1526080216852725901",
  "latency_ms": 42,
  "bot_status": "online",
  "timestamp": "2026-11-04T04:47:00.000Z"
}
```

`bot_status` may be `online`, `idle`, `dnd`, `offline`, `disconnected`, `reconnecting`, or `connecting`. A report older than 30 seconds is shown as unavailable. The dashboard polls this stored value every 10 seconds.

The bot reports status by answering `GET BOT_RUNTIME_URL` with `Authorization: Bearer <BOT_RUNTIME_SECRET>`:

```json
{
  "bot_id": "1520326181025615892",
  "online": true,
  "uptime_seconds": 3600,
  "latency_ms": 42,
  "guild_count": 12,
  "member_count": 3400
}
```

It posts events to `POST /api/internal/ingest` with the same bearer token:

```json
{
  "bot_id": "1520326181025615892",
  "events": [
    {
      "type": "log",
      "level": "info",
      "kind": "moderation",
      "guild_id": "SERVER_ID",
      "message": "Warning recorded"
    },
    {
      "type": "application",
      "guild_id": "SERVER_ID",
      "external_id": "stable-id",
      "applicant_id": "USER_ID",
      "applicant_name": "name",
      "answers": [{ "question": "Why?", "answer": "Because" }]
    }
  ]
}
```

The bot reads saved settings from `GET /api/internal/settings/{guild_id}` with the same bearer token. If the secret is missing, those routes stay closed.

## Pterodactyl

Use two servers (or one server plus an external web host). One startup command will not reliably run both a Discord gateway and this web process.

1. Keep the existing Python egg for the bot (`discord.py` 2.7.1). Point it at the same Postgres database if you want it to read `nx_guild_settings` and write through the bridge.
2. Run this web app as its own process. Install dependencies with `npm install`, then `npm run build` and start the production server your host documents for this app. The dev command is `npm run dev` on port 8080.
3. Put the variables above in the Pterodactyl startup environment, not in a committed file.
4. Put HTTPS in front of the panel (Nginx, Caddy, or the host proxy). Set `X-Forwarded-Proto` and `X-Forwarded-Host`. Register the public `https://…/auth/discord/callback` URI.
5. Set `BOT_RUNTIME_URL` to the bot status port on the private network, for example `http://127.0.0.1:8787/status` only if both processes share a machine. Otherwise use HTTPS.
6. Do not expose the bot token, client secret, or bridge secret to the browser. There is no shell endpoint and no restart button, because this host does not provide a safe process manager for the bot.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| “Discord OAuth is not configured” | Client ID, client secret, or session secret is empty. |
| Redirect URI mismatch | The portal entry must match `DISCORD_REDIRECT_URI` or the host the panel calculated. |
| Login cancelled | Discord sent `access_denied`. No session is created. |
| Invalid state | The attempt expired, cookies were blocked, or a second tab reused it. |
| Bot ID mismatch | Token or `DISCORD_BOT_ID` is for a different application. |
| Uptime unavailable | The runtime URL is unset, refused, or the bot is offline. The panel does not invent a number. |
| Owner console forbidden | The signed-in Discord ID is not `DISCORD_OWNER_ID`. |

## HTTP routes

- `GET /auth/discord/login`
- `GET /auth/discord/callback`
- `POST /auth/logout` with header `x-nx-csrf`
- `GET /api/auth/me`
- `GET /api/auth/guilds`
- `GET /api/bot/info`
- `GET /api/bot/stats`
- `POST /api/bot/latency` with `Authorization: Bearer <NEXORA_MONITOR_SECRET>`
- `GET /api/dashboard/overview`
- `GET /api/servers/{guild_id}`
- `PUT /api/servers/{guild_id}/settings`
- `GET /api/applications`
- `POST /api/applications/{id}/review`
- `GET /api/logs`
- `GET /api/owner/console`

Private routes require the session cookie. State-changing routes also require the CSRF token from `/api/auth/me`.
