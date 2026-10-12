# OTT Release Radar — UI/UX redesign brief

## What the product is
OTT Release Radar is a personal weekly "New This Week" digest of OTT releases in India. Every Friday at 7 PM IST it finds shows and films released in the last 7 days on **Netflix, Amazon Prime Video and JioHotstar**, keeps the ones that match one user's taste, asks an AI (Gemini Flash) whether each is worth watching, and sends the result to Telegram. A website lets the user preview the week's picks and send the digest on demand.

- Live app: https://ott-release-radar-theta.vercel.app
- Code: https://github.com/sanjanapundir-ai/ott-release-radar

## The user
**Naman** watches 2–3 shows or films a week and subscribes to Netflix, Prime Video and JioHotstar. His problem: every app pushes trending or recommended titles, never "what actually came out this week", so he spends about 20 minutes every Friday scrolling three apps.

His taste profile:
- **Genres:** Thriller, Sci-Fi, Indie Drama
- **Languages:** Hindi, English, Tamil
- **Platforms:** Netflix, Prime Video, JioHotstar

## How it works (already built, keep as is)
1. **Trigger:** a cron job every Friday at 7 PM IST, or the user clicking a button on the website.
2. **Data:** TMDB (titles released in India) plus the Streaming Availability API on RapidAPI (titles added to each platform this week, with deep links). RapidAPI results are cached once a day to protect a 1,000-requests-a-month quota.
3. **Filter:** only recent titles (films released in the last 6 months, no old catalogue), only his genres and languages, and for series only brand-new shows or new seasons of shows still running.
4. **AI:** Gemini Flash rates each title WATCH or SKIP with a 0–100 match score, a two-line synopsis and a one-line reason.
5. **Output:** up to 12 picks, best match first, sent to Telegram and shown on the website.

## Tech stack and constraints
- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4. Deployed on Vercel.
- **Do not change the backend logic** in `src/lib/*` or `src/app/api/digest/route.ts`, except to add fields to the response as described below.
- All AI must stay on **Gemini Flash**. Do not add Claude, OpenAI or other model APIs.
- The UI lives in `src/app/page.tsx` (a single client component) and `src/app/layout.tsx`. Split it into components as you see fit.
- Next.js 16 has breaking changes. Read `node_modules/next/dist/docs/` before using APIs you are unsure of. Route segment config `export const dynamic` is not allowed (Cache Components is on).

## API the UI uses
`GET /api/digest?manual=true&send=false` returns this week's picks without messaging Telegram (Preview).
`GET /api/digest?manual=true` runs the full pipeline and sends the Telegram digest (Send Now).
A run takes about 15–40 seconds; design the loading state for that.

Response shape:
```json
{
  "success": true,
  "sent": false,
  "messages": 0,
  "count": 10,
  "entries": [
    {
      "key": "movie-12345",
      "id": 12345,
      "title": "Reporting Live",
      "type": "movie",                 // "movie" | "tv"
      "releaseDate": "2026-10-09",
      "language": "hi",                // ISO 639-1
      "genres": ["Crime", "Thriller"],
      "overview": "TMDB synopsis…",
      "runtimeOrEpisodes": "116 min",  // or "8 episodes · 2 seasons"
      "platforms": ["Netflix"],
      "verifiedArrival": true,         // true when confirmed added to a platform this week
      "addedOn": "2026-10-11",         // optional
      "link": "https://www.netflix.com/title/…", // optional deep link into the app
      "rating": 71,                    // optional critic rating 0–100
      "cast": ["…"],                   // optional
      "directors": ["…"],              // optional
      "newSeason": 2,                  // optional, series only
      "ongoing": true,                 // series only: still running
      "recommendation": {              // optional; missing if Gemini was unavailable
        "key": "movie-12345",
        "verdict": "WATCH",            // "WATCH" | "SKIP"
        "matchScore": 87,
        "twoLineSynopsis": "…",
        "reason": "…"
      }
    }
  ]
}
```
On failure: `{ "error": "message" }` with HTTP 500.

**Posters are not in the response yet.** TMDB returns `poster_path` and `backdrop_path` from the details call already made in `src/lib/tmdb.ts`. You may add `posterPath` and `backdropPath` to `OTTMediaItem` and fill them from that call; build image URLs as `https://image.tmdb.org/t/p/w500{posterPath}` and allow `image.tmdb.org` in `next.config.ts` `images.remotePatterns` if you use `next/image`.

## What to design
Make the website feel like a polished, graphic, mobile-first OTT companion, not a utility form.

1. **Home / This Week**
   - Hero: "New this week" with the date range and a short line on what the radar does.
   - Primary action: Preview this week. Secondary: Send to Telegram.
   - Profile summary as chips (genres, languages, platforms) and the next scheduled send ("Friday 7:00 PM IST").
2. **Picks grid or carousel**
   - Poster-led cards: poster, title, type (Movie / Series), language, platform badge with brand colour, runtime or episodes, genre chips.
   - Verdict treatment: a strong WATCH vs SKIP state and the match score as a ring or bar.
   - Badges: "New on Netflix · 11 Oct" (when `verifiedArrival`), "Season 2" (when `newSeason`), critic rating.
   - Filters/tabs: All · Watch · Skip; Movies · Series; by platform.
3. **Title detail** (sheet or modal): backdrop, synopsis, Gemini's reason, cast and director, "Open in Netflix/Prime/JioHotstar" button using `link`.
4. **Loading state** for a 15–40 second run: staged progress ("Checking Netflix, Prime and JioHotstar…", "Matching your taste…", "Asking Gemini…") and skeleton cards.
5. **Empty and error states:** no matches this week; data source down; Gemini unavailable (cards still show, without verdicts).
6. **Telegram preview:** a mock phone showing how the Friday message will look.

## Design requirements
- Mobile-first; works from 360 px to desktop with no horizontal scroll.
- Dark theme by default (it is a watch-at-night product), with a light theme.
- Accessible: WCAG AA contrast, keyboard focus states, alt text on posters, `prefers-reduced-motion` respected.
- Subtle motion only: card hover/press, verdict reveal, loading progress.
- Use platform names, not logos, unless you add licensed assets.

## Acceptance checklist
- `npm run lint` and `npm run build` pass.
- Preview shows real data from `/api/digest?manual=true&send=false`.
- Send Now still sends the Telegram digest and shows a success message.
- Works with and without `recommendation` on entries, and with zero entries.
- No backend behaviour changes beyond adding poster/backdrop fields.
