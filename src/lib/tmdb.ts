import { genreIdsFor, platformsFor, type Profile } from "./preferences";
import { fetchPlatformArrivals, isStreamingAvailabilityEnabled, type PlatformArrival } from "./streaming";

export interface OTTMediaItem {
  key: string; // `${type}-${id}` — movie and TV IDs overlap in TMDB
  id: number;
  title: string;
  type: "movie" | "tv";
  releaseDate: string;
  language: string;
  genres: string[];
  overview: string;
  runtimeOrEpisodes: string;
  platforms: string[];
  // From Streaming Availability (RapidAPI), when the title was found there
  verifiedArrival: boolean;
  addedOn?: string;
  link?: string;
  rating?: number;
  cast?: string[];
  directors?: string[];
  newSeason?: number;
  ongoing?: boolean; // TV only: TMDB says the show is returning or in production
  posterPath?: string; // TMDB image path, e.g. "/abc.jpg"
  backdropPath?: string;
  watchMinutes?: number; // film runtime, or the new season / new show's total episode time
}

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const MAX_ITEMS = 12; // TMDB discover results taken per type
const POOL_PER_SOURCE = 10; // candidates per source sent to Gemini
// A platform arrival counts as new only if the film (or the arriving season) was first
// released this recently; covers the usual theatrical-to-OTT gap.
const FRESH_DAYS = 180;
const MAX_ARRIVALS = 60;
const TMDB_CONCURRENCY = 8;

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY is missing");
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Retries: TMDB occasionally drops a connection or rate-limits under load.
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 429 || res.status >= 500) throw new Error(`TMDB ${path} failed: ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`TMDB ${path} failed: ${res.status}`), { final: true });
      return res.json();
    } catch (err) {
      if (attempt >= 2 || (err as { final?: boolean }).final) throw err;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
}

// Runs `fn` over `items` with at most `limit` in flight, keeping input order.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    })
  );
  return results;
}

interface Provider {
  provider_id: number;
  provider_name: string;
}

// Resolve the profile's platforms to TMDB provider IDs for India.
async function resolveProviders(platformLabels: string[]): Promise<Map<number, string>> {
  const wanted = platformsFor(platformLabels);
  const [movie, tv] = await Promise.all([
    tmdb<{ results: Provider[] }>("/watch/providers/movie", { watch_region: "IN" }),
    tmdb<{ results: Provider[] }>("/watch/providers/tv", { watch_region: "IN" }),
  ]);
  const ids = new Map<number, string>();
  for (const p of [...movie.results, ...tv.results]) {
    const platform = wanted.find((pl) => pl.match.test(p.provider_name));
    if (platform) ids.set(p.provider_id, platform.label);
  }
  if (ids.size === 0) throw new Error("Could not resolve any OTT providers for India");
  return ids;
}

interface DiscoverResult {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  original_language: string;
  genre_ids: number[];
  overview: string;
  popularity: number;
}

interface Details {
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  original_language: string;
  genres: { id: number; name: string }[];
  overview: string;
  popularity: number;
  runtime?: number;
  number_of_episodes?: number;
  number_of_seasons?: number;
  status?: string; // TV: "Returning Series", "In Production", "Planned", "Ended", "Canceled"
  seasons?: { season_number: number; air_date: string | null; episode_count?: number }[];
  poster_path?: string | null;
  backdrop_path?: string | null;
  episode_run_time?: number[];
  last_episode_to_air?: { runtime?: number | null } | null;
  created_by?: { name: string }[];
  credits?: { cast?: { name: string }[]; crew?: { job: string; name: string }[] };
}

// A returning show's new season counts only while the show is still continuing;
// seasons of ended or cancelled shows are dropped. Brand-new shows are always kept.
const ONGOING_STATUSES = ["Returning Series", "In Production", "Planned"];
function isOngoing(details: Details): boolean {
  return ONGOING_STATUSES.includes(details.status ?? "");
}

interface Candidate {
  type: "movie" | "tv";
  id: number;
  arrival?: PlatformArrival;
}

export async function fetchWeeklyNewReleases(profile: Profile): Promise<OTTMediaItem[]> {
  const today = new Date();
  const past7Days = new Date(today);
  past7Days.setDate(today.getDate() - 7);
  const fromDate = past7Days.toISOString().split("T")[0];
  const toDate = today.toISOString().split("T")[0];

  const genreIds = genreIdsFor(profile);
  const languageCodes = profile.languages;

  // Source 1: platform arrivals from Streaming Availability (exact "added on" dates).
  // Optional: without a key, or if RapidAPI fails, TMDB alone is used.
  const arrivalsPromise = isStreamingAvailabilityEnabled()
    ? fetchPlatformArrivals(toDate, [...profile.platforms].sort()).catch((err) => {
        console.error("Streaming Availability unavailable, using TMDB only:", err);
        return [] as PlatformArrival[];
      })
    : Promise.resolve([] as PlatformArrival[]);

  // Source 2: TMDB discover (release dates + current platforms).
  const providers = await resolveProviders(profile.platforms);
  const common = {
    watch_region: "IN",
    with_watch_providers: [...providers.keys()].join("|"),
    with_watch_monetization_types: "flatrate",
    with_original_language: languageCodes.join("|"),
    sort_by: "popularity.desc",
  };
  const [arrivals, movies, shows] = await Promise.all([
    arrivalsPromise,
    tmdb<{ results: DiscoverResult[] }>("/discover/movie", {
      ...common,
      region: "IN",
      with_release_type: "4", // digital release
      "release_date.gte": fromDate,
      "release_date.lte": toDate,
      with_genres: genreIds.movies.join("|"),
    }),
    tmdb<{ results: DiscoverResult[] }>("/discover/tv", {
      ...common,
      "air_date.gte": fromDate,
      "air_date.lte": toDate,
      with_genres: genreIds.tv.join("|"),
    }),
  ]);

  const candidates = new Map<string, Candidate>();
  for (const a of arrivals.slice(0, MAX_ARRIVALS)) {
    candidates.set(a.key, { type: a.type, id: a.tmdbId, arrival: a });
  }
  for (const r of movies.results.slice(0, MAX_ITEMS)) {
    if (!candidates.has(`movie-${r.id}`)) candidates.set(`movie-${r.id}`, { type: "movie", id: r.id });
  }
  for (const r of shows.results.slice(0, MAX_ITEMS)) {
    if (!candidates.has(`tv-${r.id}`)) candidates.set(`tv-${r.id}`, { type: "tv", id: r.id });
  }

  const inWindow = (d?: string | null) => Boolean(d && d >= fromDate && d <= toDate);
  const freshCutoff = new Date(today);
  freshCutoff.setDate(today.getDate() - FRESH_DAYS);
  const freshFrom = freshCutoff.toISOString().split("T")[0];
  const isFresh = (d?: string | null) => Boolean(d && d >= freshFrom && d <= toDate);

  const enriched = await mapLimit(
    [...candidates.values()],
    TMDB_CONCURRENCY,
    async (c): Promise<{ item: OTTMediaItem; popularity: number } | null> => {
      let tmdbNewSeason: number | undefined;
      const [details, watch] = await Promise.all([
        tmdb<Details>(`/${c.type}/${c.id}`, { append_to_response: "credits" }),
        c.arrival
          ? Promise.resolve(null)
          : tmdb<{ results: { IN?: { flatrate?: Provider[] } } }>(`/${c.type}/${c.id}/watch/providers`),
      ]);

      // Arrivals cover every genre and language, so apply Naman's filters here.
      if (c.arrival) {
        const wanted = c.type === "movie" ? genreIds.movies : genreIds.tv;
        if (!languageCodes.includes(details.original_language)) return null;
        if (!details.genres.some((g) => wanted.includes(g.id))) return null;
        // Platforms also add old catalogue titles; only recent releases count as new.
        if (c.type === "movie" && !isFresh(details.release_date)) return null;
        if (c.type === "tv") {
          const season = c.arrival.newSeason
            ? details.seasons?.find((s) => s.season_number === c.arrival!.newSeason)
            : undefined;
          if (!isFresh(details.first_air_date) && !isFresh(season?.air_date)) return null;
          if (!isFresh(details.first_air_date) && !isOngoing(details)) return null;
        }
      } else if (c.type === "tv") {
        // A TMDB-only show counts as new only if it premiered, or a new season started,
        // in the window, not because a weekly episode of a long-running show aired.
        const newSeason = details.seasons?.find((s) => s.season_number > 0 && inWindow(s.air_date));
        if (!inWindow(details.first_air_date) && !newSeason) return null;
        if (newSeason && newSeason.season_number > 1) tmdbNewSeason = newSeason.season_number;
        if (!inWindow(details.first_air_date) && !isOngoing(details)) return null;
      }

      const platforms = c.arrival
        ? c.arrival.platforms
        : [
            ...new Set(
              (watch?.results.IN?.flatrate ?? [])
                .map((p) => providers.get(p.provider_id))
                .filter((p): p is string => Boolean(p))
            ),
          ];

      let runtimeOrEpisodes: string;
      if (c.type === "movie") {
        runtimeOrEpisodes = details.runtime ? `${details.runtime} min` : "Runtime N/A";
      } else {
        const eps = details.number_of_episodes;
        const seasons = details.number_of_seasons;
        runtimeOrEpisodes = eps
          ? `${eps} episodes${seasons && seasons > 1 ? ` · ${seasons} seasons` : ""}`
          : "Series";
      }

      const newSeason = c.arrival?.newSeason ?? tmdbNewSeason;
      const episodeRuntime = details.episode_run_time?.[0] ?? details.last_episode_to_air?.runtime ?? 45;
      const seasonEpisodes = newSeason
        ? details.seasons?.find((s) => s.season_number === newSeason)?.episode_count
        : undefined;
      const watchMinutes =
        c.type === "movie"
          ? details.runtime || undefined
          : (seasonEpisodes ?? details.number_of_episodes ?? 0) * episodeRuntime || undefined;
      const directors =
        c.arrival?.directors?.length
          ? c.arrival.directors
          : c.type === "movie"
            ? (details.credits?.crew ?? []).filter((m) => m.job === "Director").map((m) => m.name).slice(0, 2)
            : (details.created_by ?? []).map((m) => m.name).slice(0, 2);
      const cast = c.arrival?.cast?.length
        ? c.arrival.cast
        : (details.credits?.cast ?? []).slice(0, 4).map((m) => m.name);

      const item: OTTMediaItem = {
        key: `${c.type}-${c.id}`,
        id: c.id,
        title: details.title ?? details.name ?? "Untitled",
        type: c.type,
        releaseDate: details.release_date ?? details.first_air_date ?? "",
        language: details.original_language,
        genres: details.genres.map((g) => g.name),
        overview: details.overview || "No overview available.",
        runtimeOrEpisodes,
        platforms: platforms.length ? platforms : profile.platforms,
        verifiedArrival: Boolean(c.arrival),
        addedOn: c.arrival?.addedOn || undefined,
        link: c.arrival?.link,
        rating: c.arrival?.rating,
        cast,
        directors,
        newSeason,
        ongoing: c.type === "tv" ? isOngoing(details) : undefined,
        posterPath: details.poster_path ?? undefined,
        backdropPath: details.backdrop_path ?? undefined,
        watchMinutes,
      };
      return { item, popularity: details.popularity };
    }
  );

  // Build the pool Gemini judges from both sources, so popular TMDB titles can't crowd
  // out platform arrivals (which include older catalogue titles with lower popularity).
  const kept = enriched.filter((e) => e !== null).sort((a, b) => b.popularity - a.popularity);
  const verified = kept.filter((e) => e.item.verifiedArrival).slice(0, POOL_PER_SOURCE);
  const tmdbOnly = kept.filter((e) => !e.item.verifiedArrival).slice(0, POOL_PER_SOURCE);
  return [...verified, ...tmdbOnly]
    .map((e) => e.item);
}
