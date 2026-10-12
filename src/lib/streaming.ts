import { cacheLife } from "next/cache";
import { platformsFor } from "./preferences";

// Streaming Availability API (Movie of the Night) via RapidAPI.
// Unlike TMDB, it records the date a title was added to each platform in India,
// so it answers "what landed on Netflix / Prime / JioHotstar this week" directly.
const HOST = "streaming-availability.p.rapidapi.com";
const MAX_PAGES = 3; // 25 changes per page
// The free plan allows 1,000 requests a month. Results are cached once per day in the
// shared remote cache, and live calls stop when fewer than this many requests remain.
const QUOTA_RESERVE = 100;

export interface PlatformArrival {
  key: string; // `${type}-${tmdbId}`, same shape as OTTMediaItem.key
  type: "movie" | "tv";
  tmdbId: number;
  platforms: string[];
  addedOn: string; // YYYY-MM-DD
  link?: string;
  rating?: number; // 0-100
  cast: string[];
  directors: string[];
  newSeason?: number;
}

interface Service {
  id: string;
  name: string;
}

interface Change {
  changeType: string;
  itemType: "show" | "season" | "episode";
  showId: string;
  showType: "movie" | "series";
  season?: number | null;
  service: Service;
  streamingOptionType: string;
  timestamp?: number | null;
  link?: string | null;
}

interface Show {
  tmdbId?: string; // "movie/123" or "tv/456"
  rating?: number;
  cast?: string[];
  directors?: string[] | null;
  creators?: string[] | null;
}

interface ChangesResponse {
  changes: Change[];
  shows: Record<string, Show>;
  hasMore: boolean;
  nextCursor?: string;
}

async function rapid<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY is missing");
  const url = new URL(`https://${HOST}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST },
    cache: "no-store",
  });
  const remaining = Number(res.headers.get("x-ratelimit-api-request-remaining"));
  if (Number.isFinite(remaining)) quotaRemaining = remaining;
  if (!res.ok) throw new Error(`Streaming Availability ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Last value of RapidAPI's remaining-requests header seen by this instance.
let quotaRemaining = Infinity;

function assertQuota() {
  if (quotaRemaining < QUOTA_RESERVE) {
    throw new Error(`RapidAPI quota low (${quotaRemaining} requests left); skipping until it resets`);
  }
}

// Service IDs are looked up by name, like the TMDB providers, rather than hardcoded.
async function resolveServices(platformLabels: string[]): Promise<Map<string, string>> {
  const wanted = platformsFor(platformLabels);
  const country = await rapid<{ services: Service[] }>("/countries/in");
  const ids = new Map<string, string>();
  for (const s of country.services) {
    const platform = wanted.find((p) => p.match.test(s.name) || p.match.test(s.id));
    if (platform) ids.set(s.id, platform.label);
  }
  if (ids.size === 0) throw new Error("No matching streaming services for India");
  return ids;
}

async function fetchChanges(
  itemType: "show" | "season",
  catalogs: string,
  from: number,
  to: number
): Promise<ChangesResponse[]> {
  const pages: ChangesResponse[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    assertQuota();
    const page = await rapid<ChangesResponse>("/changes", {
      country: "in",
      change_type: "new",
      item_type: itemType,
      catalogs,
      from: String(from),
      to: String(to),
      order_direction: "desc", // newest first, so the page cap keeps the latest arrivals
      ...(cursor ? { cursor } : {}),
    });
    pages.push(page);
    if (!page.hasMore || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return pages;
}

export function isStreamingAvailabilityEnabled(): boolean {
  return Boolean(process.env.RAPIDAPI_KEY);
}

// `day` (YYYY-MM-DD, UTC) and the sorted platform list are the cache key: every request on
// the same day, from any instance, reuses one fetch. Errors are not cached.
export async function fetchPlatformArrivals(day: string, platformLabels: string[]): Promise<PlatformArrival[]> {
  "use cache: remote";
  cacheLife({ stale: 3600, revalidate: 86400, expire: 172800 });

  assertQuota();
  const toDate = new Date(`${day}T23:59:59Z`);
  const fromDate = new Date(toDate.getTime() - 7 * 86400 * 1000);
  const services = await resolveServices(platformLabels);
  const catalogs = [...services.keys()].map((id) => `${id}.subscription`).join(",");
  const from = Math.floor(fromDate.getTime() / 1000);
  const to = Math.floor(toDate.getTime() / 1000);

  const [showPages, seasonPages] = await Promise.all([
    fetchChanges("show", catalogs, from, to),
    fetchChanges("season", catalogs, from, to),
  ]);

  const arrivals = new Map<string, PlatformArrival>();
  for (const page of [...showPages, ...seasonPages]) {
    for (const change of page.changes) {
      const show = page.shows[change.showId];
      const match = show?.tmdbId?.match(/^(movie|tv)\/(\d+)$/);
      if (!match) continue;
      const type = match[1] as "movie" | "tv";
      const tmdbId = Number(match[2]);
      const key = `${type}-${tmdbId}`;
      const platform = services.get(change.service.id) ?? change.service.name;
      const addedOn = change.timestamp
        ? new Date(change.timestamp * 1000).toISOString().split("T")[0]
        : "";

      const existing = arrivals.get(key);
      if (existing) {
        if (!existing.platforms.includes(platform)) existing.platforms.push(platform);
        existing.link ??= change.link ?? undefined;
        if (change.itemType === "season" && change.season) existing.newSeason ??= change.season;
        continue;
      }
      arrivals.set(key, {
        key,
        type,
        tmdbId,
        platforms: [platform],
        addedOn,
        link: change.link ?? undefined,
        rating: show.rating,
        cast: (show.cast ?? []).slice(0, 4),
        directors: show.directors ?? show.creators ?? [],
        newSeason: change.itemType === "season" ? change.season ?? undefined : undefined,
      });
    }
  }

  return [...arrivals.values()];
}
