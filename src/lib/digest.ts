import { fetchWeeklyNewReleases, type OTTMediaItem } from "./tmdb";
import { getGeminiRecommendations, type Recommendation } from "./gemini";
import { escapeHtml, sendTelegramDigest } from "./telegram";
import type { Profile } from "./preferences";
import { getCachedDigest, saveCachedDigest } from "./db";
import { formatMinutes, prettyDate } from "./format";

export interface DigestEntry extends OTTMediaItem {
  recommendation?: Recommendation;
}

export interface Digest {
  entries: DigestEntry[];
  fromDate: string;
  toDate: string;
  weekendMinutes: number; // total watch time of the WATCH picks
  generatedAt: string;
}

// Curator's restraint: only the most relevant titles make the digest.
const DIGEST_SIZE = 7;

function dateRange(day: string) {
  const to = new Date(`${day}T00:00:00Z`);
  const from = new Date(to.getTime() - 7 * 86400 * 1000);
  return { fromDate: from.toISOString().split("T")[0], toDate: day };
}

function assemble(day: string, items: OTTMediaItem[], recs: Map<string, Recommendation>): Digest {
  const entries = items
    .map((item) => ({ ...item, recommendation: recs.get(item.key) }))
    .sort((a, b) => {
      const watch = (e: DigestEntry) => (e.recommendation?.verdict === "WATCH" ? 1 : 0);
      return watch(b) - watch(a) || (b.recommendation?.matchScore ?? 0) - (a.recommendation?.matchScore ?? 0);
    })
    .slice(0, DIGEST_SIZE);
  const watchPicks = entries.filter((e) => e.recommendation?.verdict === "WATCH");
  const weekendMinutes = watchPicks.reduce((sum, e) => sum + (e.watchMinutes ?? 0), 0);
  return { entries, ...dateRange(day), weekendMinutes, generatedAt: new Date().toISOString() };
}

function profileKey(p: Profile): string {
  return JSON.stringify({
    name: p.name,
    genres: [...p.genres].sort(),
    languages: [...p.languages].sort(),
    platforms: [...p.platforms].sort(),
  });
}

const CACHE_HOURS = 6;

// One digest per day and profile is stored in Neon and reused for CACHE_HOURS, so opening
// the site doesn't re-run TMDB, RapidAPI and Gemini each time. `fresh` skips the cache.
// A digest without AI verdicts (Gemini down) is returned but never stored.
export async function buildDigest(profile: Profile, { fresh = false } = {}): Promise<Digest> {
  const day = new Date().toISOString().split("T")[0];
  const key = profileKey(profile);
  if (!fresh) {
    const cached = await getCachedDigest<Digest>(day, key, CACHE_HOURS);
    if (cached) return cached;
  }

  const items = await fetchWeeklyNewReleases(profile);
  const recs = await getGeminiRecommendations(items, profile).catch((err) => {
    console.error("Gemini unavailable, digest without verdicts:", err);
    return new Map<string, Recommendation>();
  });
  const digest = assemble(day, items, recs);
  if (items.length === 0 || recs.size > 0) await saveCachedDigest(day, key, digest);
  return digest;
}

function formatEntry(e: DigestEntry, index: number): string {
  const r = e.recommendation;
  const verdict = r ? (r.verdict === "WATCH" ? "✅ <b>WATCH</b>" : "⏭ <b>SKIP</b>") : "❔ <b>No verdict</b>";
  const synopsis = r?.twoLineSynopsis ?? e.overview.slice(0, 160);
  const added = [
    e.newSeason ? `Season ${e.newSeason}` : "",
    e.addedOn ? `added ${prettyDate(e.addedOn)}` : "",
  ].filter(Boolean).join(", ");
  const lines = [
    `<b>${index + 1}. ${escapeHtml(e.title)}</b> (${e.type === "movie" ? "Movie" : "Series"} · ${e.language.toUpperCase()})`,
    `📺 ${escapeHtml(e.platforms.join(", "))} · ⏱ ${escapeHtml(e.runtimeOrEpisodes)}${added ? ` · ${escapeHtml(added)}` : ""}`,
    `🏷 ${escapeHtml([r?.moodTag, ...e.genres].filter(Boolean).join(" · ") || "—")}`,
    `📝 ${escapeHtml(synopsis)}`,
  ];
  if (r?.take) lines.push(`💬 <i>${escapeHtml(r.take)}</i>`);
  if (r?.xRayInsight) lines.push(`🔍 ${escapeHtml(r.xRayInsight)}`);
  lines.push(`${verdict}${r ? ` · ${r.matchScore}% match — ${escapeHtml(r.reason)}` : ""}`);
  if (e.link?.startsWith("https://")) {
    lines.push(`▶️ <a href="${escapeHtml(e.link).replace(/"/g, "&quot;")}">Open in ${escapeHtml(e.platforms[0])}</a>`);
  }
  return lines.join("\n");
}

export async function sendDigest(digest: Digest, profile: Profile): Promise<number> {
  const header = [
    `🍿 <b>New this week for ${escapeHtml(profile.name)}</b>`,
    `${prettyDate(digest.fromDate)} – ${prettyDate(digest.toDate)} · India`,
  ];
  if (digest.entries.length === 0) {
    return sendTelegramDigest([
      header.join("\n"),
      "No new releases matched your genres and languages in the last 7 days.",
    ]);
  }
  if (digest.weekendMinutes > 0) header.push(`⏳ Weekend commitment for the WATCH picks: ${formatMinutes(digest.weekendMinutes)}`);
  return sendTelegramDigest([header.join("\n"), ...digest.entries.map(formatEntry)]);
}
