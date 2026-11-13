# FA Poker App

Free club poker platform for Android and iPhone (web + future store wrap).

## What’s in this MVP

- **Player lobby** — join with invite code, see tables, tournaments, BBJP
- **Admin panel** (PIN) — add players, send/recall chips, open tables **with rake**, create tournaments, fund/enable BBJP
- **Live tables** — sit with buy-in, play NLH vs players/AI, automatic rake, BBJP fee + trigger payouts
- **Tournaments** — register from the lobby; admin starts a single table (up to 9); blinds rise on a timer; winner takes the prize pool in club chips
- **Club chips only** — free play, not real-money gambling

## Quick start

```bash
npm install
export ADMIN_PIN='your-admin-pin'
export SESSION_SECRET='long-random-string'
export CLUB_INVITE='your-invite'
env -u DATABASE_URL npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

- Lobby: `/lobby` (use your `CLUB_INVITE`)
- Admin: `/admin` (use your `ADMIN_PIN`)

Required environment variables:

- `ADMIN_PIN` — club admin login
- `SESSION_SECRET` — signs session cookies (a random value is used for the process if unset; set this in production)
- `CLUB_INVITE` — club invite code (if unset on first boot, a random code is generated and shown in Admin)

## Stack

- Next.js + TypeScript
- Postgres when published (`cursor-app.json`); local PGlite for development

## Legacy

Older single-file HTML prototypes live in `legacy/`.
