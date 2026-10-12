const PROBLEM = [
  "Naman watches two to three shows or movies every week across Netflix, Amazon Prime Video and JioHotstar (formerly Disney+ Hotstar).",
  "Every OTT platform surfaces what's trending or algorithmically recommended, never what actually released in the last seven days.",
  "No single source does this well: IMDb shows global release dates that don't reflect India-specific OTT windows.",
  "The apps themselves bury new releases behind recommendation carousels.",
];

const SOLUTION = [
  "A clean “New This Week” digest of titles released in the last seven days on any of the three platforms in India.",
  "Pulls releases for India from a movie and TV database API (TMDB), plus Streaming Availability for what landed on each platform.",
  "Filters by his stored genre and language preferences: thriller, sci-fi, indie drama; Hindi, English, Tamil.",
  "Delivers the digest to Telegram every Friday evening at 7 PM IST.",
];

const FIELDS = [
  "Title",
  "Platform",
  "Genre tags",
  "Runtime or episode count",
  "Two-line synopsis",
  "Gemini watch-or-skip verdict, based on how well it matches his profile",
];

export function About() {
  return (
    <section aria-labelledby="about-heading" className="grid gap-6 rounded-2xl bg-zinc-900/70 p-6 ring-1 ring-white/5 sm:p-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">About</p>
        <h2 id="about-heading" className="mt-1 text-2xl font-bold text-balance">
          What actually came out this week that I might like?
        </h2>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-3 text-sm font-semibold text-zinc-200">The problem</h3>
          <ul className="grid gap-2.5 text-sm leading-relaxed text-zinc-400">
            {PROBLEM.map((p) => (
              <li key={p} className="flex gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <h3 className="mb-3 text-sm font-semibold text-zinc-200">What the radar does</h3>
          <ul className="grid gap-2.5 text-sm leading-relaxed text-zinc-400">
            {SOLUTION.map((p) => (
              <li key={p} className="flex gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-zinc-200">Every pick includes</h3>
        <ul className="flex flex-wrap gap-2">
          {FIELDS.map((f) => (
            <li key={f} className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200">
              <span className="text-emerald-400">✓</span> {f}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
