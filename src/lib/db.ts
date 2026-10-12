import { neon } from "@neondatabase/serverless";
import { DEFAULT_PROFILE, sanitizeProfile, type Profile } from "./preferences";

// Neon Postgres: the editable profile (one row) and the watchlist.
// Without DATABASE_URL the app still works with the default profile and no watchlist.

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is missing");
  return neon(url);
}

export function isDatabaseEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function getProfile(): Promise<Profile> {
  if (!isDatabaseEnabled()) return DEFAULT_PROFILE;
  try {
    const rows = await sql()`SELECT name, genres, languages, platforms FROM profile WHERE id = 1`;
    return rows[0] ? sanitizeProfile(rows[0] as Profile) : DEFAULT_PROFILE;
  } catch (err) {
    console.error("Could not load profile, using default:", err);
    return DEFAULT_PROFILE;
  }
}

export async function saveProfile(input: Partial<Profile>): Promise<Profile> {
  const p = sanitizeProfile(input);
  await sql()`
    INSERT INTO profile (id, name, genres, languages, platforms, updated_at)
    VALUES (1, ${p.name}, ${p.genres}, ${p.languages}, ${p.platforms}, now())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, genres = EXCLUDED.genres, languages = EXCLUDED.languages,
      platforms = EXCLUDED.platforms, updated_at = now()`;
  return p;
}

export interface WatchlistRow<T = unknown> {
  key: string;
  title: string;
  item: T;
  addedAt: string;
}

export async function getWatchlist<T>(): Promise<WatchlistRow<T>[]> {
  const rows = await sql()`SELECT key, title, item, added_at FROM watchlist ORDER BY added_at DESC LIMIT 200`;
  return rows.map((r) => ({
    key: r.key as string,
    title: r.title as string,
    item: r.item as T,
    addedAt: new Date(r.added_at as string).toISOString(),
  }));
}

export async function addToWatchlist(key: string, title: string, item: unknown): Promise<void> {
  await sql()`
    INSERT INTO watchlist (key, title, item) VALUES (${key}, ${title}, ${JSON.stringify(item)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, item = EXCLUDED.item`;
}

export async function removeFromWatchlist(key: string): Promise<void> {
  await sql()`DELETE FROM watchlist WHERE key = ${key}`;
}

// Finished digests, one per day and profile, so visitors don't re-run TMDB, RapidAPI and
// Gemini on every page load. Only digests with AI verdicts are stored.
export async function getCachedDigest<T>(day: string, profileKey: string, maxAgeHours: number): Promise<T | null> {
  if (!isDatabaseEnabled()) return null;
  try {
    const rows = await sql()`
      SELECT payload FROM digest_cache
      WHERE day = ${day} AND profile_key = ${profileKey}
        AND created_at > now() - make_interval(hours => ${maxAgeHours})`;
    return rows[0] ? (rows[0].payload as T) : null;
  } catch (err) {
    console.error("Digest cache read failed:", err);
    return null;
  }
}

export async function saveCachedDigest(day: string, profileKey: string, payload: unknown): Promise<void> {
  if (!isDatabaseEnabled()) return;
  try {
    await sql()`
      INSERT INTO digest_cache (day, profile_key, payload) VALUES (${day}, ${profileKey}, ${JSON.stringify(payload)}::jsonb)
      ON CONFLICT (day, profile_key) DO UPDATE SET payload = EXCLUDED.payload, created_at = now()`;
    await sql()`DELETE FROM digest_cache WHERE day < current_date - 14`;
  } catch (err) {
    console.error("Digest cache write failed:", err);
  }
}
