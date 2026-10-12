import { namanPreferences } from "./preferences";
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
}

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const MAX_ITEMS = 12; // TMDB discover results taken per type
const POOL_PER_SOURCE = 10; // candidates per source sent to Gemini
// A platform arrival counts as new only if the film (or the arriving season) was first
// released this recently; covers the usual theatrical-to-OTT gap.
const FRESH_DAYS = 180;
const MAX_ARRIVALS = 60;

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY is missing");
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
  return res.json();
}

interface Provider {
  provider_id: number;
  provider_name: string;
}

// Resolve Naman's platforms to TMDB provider IDs for India.
async function resolveProviders(): Promise<Map<number, string>> {
  const [movie, tv] = await Promise.all([
    tmdb<{ results: Provider[] }>("/watch/providers/movie", { watch_region: "IN" }),
    tmdb<{ results: Provider[] }>("/watch/providers/tv", { watch_region: "IN" }),
  ]);
  const ids = new Map<number, string>();
  for (const p of [...movie.results, ...tv.results]) {
    const platform = namanPreferences.platforms.find((pl) => pl.match.test(p.provider_name));
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
  seasons?: { season_number: number; air_date: string | null }[];
}

interface Candidate {
  type: "movie" | "tv";
  id: number;
  arrival?: PlatformArrival;
}

export async function fetchWeeklyNewReleases(): Promise<OTTMediaItem[]> {
  const today = new Date();
  const past7Days = new Date(today);
  past7Days.setDate(today.getDate() - 7);
  const fromDate = past7Days.toISOString().split("T")[0];
  const toDate = today.toISOString().split("T")[0];

  const prefs = namanPreferences;
  const languageCodes = prefs.languages.map((l) => l.code);

  // Source 1: platform arrivals from Streaming Availability (exact "added on" dates).
  // Optional: without a key, or if RapidAPI fails, TMDB alone is used.
  const arrivalsPromise = isStreamingAvailabilityEnabled()
    ? fetchPlatformArrivals(toDate).catch((err) => {
        console.error("Streaming Availability unavailable, using TMDB only:", err);
        return [] as PlatformArrival[];
      })
    : Promise.resolve([] as PlatformArrival[]);

  // Source 2: TMDB discover (release dates + current platforms).
  const providers = await resolveProviders();
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
      with_genres: prefs.genres.movies.join("|"),
    }),
    tmdb<{ results: DiscoverResult[] }>("/discover/tv", {
      ...common,
      "air_date.gte": fromDate,
      "air_date.lte": toDate,
      with_genres: prefs.genres.tv.join("|"),
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

  const enriched = await Promise.all(
    [...candidates.values()].map(async (c): Promise<{ item: OTTMediaItem; popularity: number } | null> => {
      const [details, watch] = await Promise.all([
        tmdb<Details>(`/${c.type}/${c.id}`),
        c.arrival
          ? Promise.resolve(null)
          : tmdb<{ results: { IN?: { flatrate?: Provider[] } } }>(`/${c.type}/${c.id}/watch/providers`),
      ]);

      // Arrivals cover every genre and language, so apply Naman's filters here.
      if (c.arrival) {
        const wanted = c.type === "movie" ? prefs.genres.movies : prefs.genres.tv;
        if (!languageCodes.includes(details.original_language)) return null;
        if (!details.genres.some((g) => wanted.includes(g.id))) return null;
        // Platforms also add old catalogue titles; only recent releases count as new.
        if (c.type === "movie" && !isFresh(details.release_date)) return null;
        if (c.type === "tv") {
          const season = c.arrival.newSeason
            ? details.seasons?.find((s) => s.season_number === c.arrival!.newSeason)
            : undefined;
          if (!isFresh(details.first_air_date) && !isFresh(season?.air_date)) return null;
        }
      } else if (c.type === "tv") {
        // A TMDB-only show counts as new only if it premiered, or a new season started,
        // in the window, not because a weekly episode of a long-running show aired.
        const newSeason = details.seasons?.some((s) => s.season_number > 0 && inWindow(s.air_date));
        if (!inWindow(details.first_air_date) && !newSeason) return null;
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
        platforms: platforms.length ? platforms : ["Netflix / Prime / JioHotstar"],
        verifiedArrival: Boolean(c.arrival),
        addedOn: c.arrival?.addedOn || undefined,
        link: c.arrival?.link,
        rating: c.arrival?.rating,
        cast: c.arrival?.cast,
        directors: c.arrival?.directors,
        newSeason: c.arrival?.newSeason,
      };
      return { item, popularity: details.popularity };
    })
  );

  // Build the pool Gemini judges from both sources, so popular TMDB titles can't crowd
  // out platform arrivals (which include older catalogue titles with lower popularity).
  const kept = enriched.filter((e) => e !== null).sort((a, b) => b.popularity - a.popularity);
  const verified = kept.filter((e) => e.item.verifiedArrival).slice(0, POOL_PER_SOURCE);
  const tmdbOnly = kept.filter((e) => !e.item.verifiedArrival).slice(0, POOL_PER_SOURCE);
  return [...verified, ...tmdbOnly]
    .map((e) => e.item);
}
