# OTT Release Radar

A personalised "New This Week" digest of OTT releases in India, delivered to Telegram every Friday evening, with a streaming-style dashboard on the web.

- **Live app:** https://ott-release-radar-theta.vercel.app
- **Problem statement:** MESA Cohort C4 · AI and its Applications · Problem Statement 11

## The problem

- Naman watches two to three shows or movies every week, on Netflix, Amazon Prime Video and JioHotstar (formerly Disney+ Hotstar).
- Every OTT platform surfaces what's trending or algorithmically recommended, never what actually released in the last seven days.
- No single source does this well. IMDb shows global release dates that don't reflect India-specific OTT windows, and the apps themselves bury new releases behind recommendation carousels.

## What it does

- Builds a clean "New This Week" digest: titles released in the last seven days on any of the three platforms in India.
- Pulls releases for India from a movie and TV database API (TMDB), plus the Streaming Availability API on RapidAPI for titles newly added to each platform.
- Filters results by Naman's stored genre and language preferences: thriller, sci-fi, indie drama; Hindi, English, Tamil.
- Delivers a Friday evening Telegram digest at 7 PM IST.

Each entry includes:

| Field | Source |
|---|---|
| Title | TMDB |
| Platform | TMDB watch providers / Streaming Availability (India, subscription) |
| Genre tags | TMDB genres, plus a Gemini mood tag |
| Runtime or episode count | TMDB details |
| Two-line synopsis | Gemini Flash |
| Watch or skip recommendation, based on how well the title matches his preference profile | Gemini Flash (verdict, 0–100 match score, reason) |

Extras: an X-Ray note on the director or cast, a MUBI-style micro-review, the weekend watch time for the WATCH picks, Open-in-app links, a watchlist and an editable taste profile.

## How it works

1. **Trigger:** Vercel Cron every Friday at 13:30 UTC (7:00 PM IST), or the buttons on the website.
2. **Fetch:** TMDB discover (released in India in the last 7 days) and Streaming Availability (added to each platform this week, cached daily to protect the free quota).
3. **Filter:** recent titles only, Naman's genres and languages, and for series only new shows or new seasons of shows still running.
4. **Judge:** Gemini Flash rates each title in one batched call, with timeouts and fallback Flash models.
5. **Deliver:** the top 7 picks go to Telegram and the dashboard. Finished digests are cached per day and profile in Neon Postgres.

## Tech

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Vercel (hosting + cron) · Neon Postgres · TMDB · Streaming Availability (RapidAPI) · Gemini Flash · Telegram Bot API

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in the keys
npm run dev
```

Environment variables are listed in [`.env.example`](.env.example): `TMDB_API_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CRON_SECRET`, and the optional `RAPIDAPI_KEY` and `DATABASE_URL`.

## API

| Route | Purpose |
|---|---|
| `GET /api/digest?manual=true&send=false` | Preview this week's picks as JSON |
| `GET /api/digest?manual=true` | Build and send the Telegram digest |
| `GET /api/digest` with `Authorization: Bearer CRON_SECRET` | Friday cron run |
| `GET` / `PUT /api/profile` | Read or update the taste profile |
| `GET` / `POST` / `DELETE /api/watchlist` | Manage the watchlist |

## Docs

- [Components map](docs/components-map.pdf)
