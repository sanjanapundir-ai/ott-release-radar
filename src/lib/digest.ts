import { fetchWeeklyNewReleases, type OTTMediaItem } from "./tmdb";
import { getGeminiRecommendations, type Recommendation } from "./gemini";
import { escapeHtml, sendTelegramDigest } from "./telegram";

export interface DigestEntry extends OTTMediaItem {
  recommendation?: Recommendation;
}

const DIGEST_SIZE = 12;

export async function buildDigest(): Promise<DigestEntry[]> {
  const items = await fetchWeeklyNewReleases();
  const recs = await getGeminiRecommendations(items).catch((err) => {
    console.error("Gemini unavailable, sending digest without verdicts:", err);
    return new Map<string, Recommendation>();
  });
  return items
    .map((item) => ({ ...item, recommendation: recs.get(item.key) }))
    .sort((a, b) => (b.recommendation?.matchScore ?? 0) - (a.recommendation?.matchScore ?? 0))
    .slice(0, DIGEST_SIZE);
}

function formatEntry(e: DigestEntry): string {
  const r = e.recommendation;
  const verdict = r ? (r.verdict === "WATCH" ? "✅ <b>WATCH</b>" : "⏭ <b>SKIP</b>") : "❔ <b>No verdict</b>";
  const synopsis = r?.twoLineSynopsis ?? e.overview.slice(0, 160);
  const added = [
    e.newSeason ? `Season ${e.newSeason} new` : "",
    e.addedOn ? `added ${e.addedOn}` : "",
  ].filter(Boolean).join(", ");
  const lines = [
    `🎬 <b>${escapeHtml(e.title)}</b> (${e.type === "movie" ? "Movie" : "Series"} · ${e.language.toUpperCase()})`,
    `📺 ${escapeHtml(e.platforms.join(", "))} · ⏱ ${escapeHtml(e.runtimeOrEpisodes)}${added ? ` · ${escapeHtml(added)}` : ""}`,
    `🏷 ${escapeHtml(e.genres.join(", ") || "—")}`,
    `📝 ${escapeHtml(synopsis)}`,
    `${verdict}${r ? ` (${r.matchScore}/100) — ${escapeHtml(r.reason)}` : ""}`,
  ];
  if (e.link?.startsWith("https://")) {
    lines.push(`▶️ <a href="${escapeHtml(e.link).replace(/"/g, "&quot;")}">Open in ${escapeHtml(e.platforms[0])}</a>`);
  }
  return lines.join("\n");
}

export async function sendDigest(entries: DigestEntry[]): Promise<number> {
  const header = "🍿 <b>New This Week — OTT Release Radar (India)</b>";
  if (entries.length === 0) {
    return sendTelegramDigest([
      header,
      "No new releases matched your genres and languages in the last 7 days.",
    ]);
  }
  return sendTelegramDigest([header, ...entries.map(formatEntry)]);
}
