import { namanPreferences } from "./preferences";

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
}

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const MAX_ITEMS = 12;

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

async function genreNames(): Promise<Map<number, string>> {
  const [movie, tv] = await Promise.all([
    tmdb<{ genres: { id: number; name: string }[] }>("/genre/movie/list"),
    tmdb<{ genres: { id: number; name: string }[] }>("/genre/tv/list"),
  ]);
  return new Map([...movie.genres, ...tv.genres].map((g) => [g.id, g.name]));
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

export async function fetchWeeklyNewReleases(): Promise<OTTMediaItem[]> {
  const today = new Date();
  const past7Days = new Date(today);
  past7Days.setDate(today.getDate() - 7);
  const fromDate = past7Days.toISOString().split("T")[0];
  const toDate = today.toISOString().split("T")[0];

  const [providers, genres] = await Promise.all([resolveProviders(), genreNames()]);
  const providerIds = [...providers.keys()].join("|");
  const languages = namanPreferences.languages.map((l) => l.code).join("|");
  const common = {
    watch_region: "IN",
    with_watch_providers: providerIds,
    with_watch_monetization_types: "flatrate",
    with_original_language: languages,
    sort_by: "popularity.desc",
  };

  const [movies, shows] = await Promise.all([
    tmdb<{ results: DiscoverResult[] }>("/discover/movie", {
      ...common,
      region: "IN",
      with_release_type: "4", // digital release
      "release_date.gte": fromDate,
      "release_date.lte": toDate,
      with_genres: namanPreferences.genres.movies.join("|"),
    }),
    tmdb<{ results: DiscoverResult[] }>("/discover/tv", {
      ...common,
      "air_date.gte": fromDate,
      "air_date.lte": toDate,
      with_genres: namanPreferences.genres.tv.join("|"),
    }),
  ]);

  const candidates = [
    ...movies.results.map((r) => ({ ...r, type: "movie" as const })),
    ...shows.results.map((r) => ({ ...r, type: "tv" as const })),
  ]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, MAX_ITEMS);

  return Promise.all(
    candidates.map(async (c): Promise<OTTMediaItem> => {
      const [details, watch] = await Promise.all([
        tmdb<{ runtime?: number; number_of_episodes?: number; number_of_seasons?: number }>(
          `/${c.type}/${c.id}`
        ),
        tmdb<{ results: { IN?: { flatrate?: Provider[] } } }>(`/${c.type}/${c.id}/watch/providers`),
      ]);

      const platforms = [
        ...new Set(
          (watch.results.IN?.flatrate ?? [])
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

      return {
        key: `${c.type}-${c.id}`,
        id: c.id,
        title: c.title ?? c.name ?? "Untitled",
        type: c.type,
        releaseDate: c.release_date ?? c.first_air_date ?? "",
        language: c.original_language,
        genres: c.genre_ids.map((g) => genres.get(g)).filter((g): g is string => Boolean(g)),
        overview: c.overview || "No overview available.",
        runtimeOrEpisodes,
        platforms: platforms.length ? platforms : ["Netflix / Prime / JioHotstar"],
      };
    })
  );
}
