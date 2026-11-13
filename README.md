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
env -u DATABASE_URL npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

- Lobby: `/lobby`
- Admin: `/admin`
- Default invite: `FAPOKER`
- Default admin PIN: `FAADMIN` (override with `ADMIN_PIN`)

## Stack

- Next.js + TypeScript
- Postgres when published (`cursor-app.json`); local PGlite for development

## Legacy

Older single-file HTML prototypes live in `legacy/`.
