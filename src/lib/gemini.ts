import { GoogleGenAI, Type } from "@google/genai";
import { languageLabel, type Profile } from "./preferences";
import type { OTTMediaItem } from "./tmdb";

export interface Recommendation {
  key: string;
  verdict: "WATCH" | "SKIP";
  matchScore: number;
  twoLineSynopsis: string;
  reason: string;
  moodTag: string; // e.g. "Psychological slow-burn"
  xRayInsight: string; // one notable fact about the director, cast or style
  take: string; // MUBI-style micro-review
}

export const MOOD_TAGS = [
  "High-octane thriller",
  "Psychological slow-burn",
  "Hard sci-fi",
  "Mind-bending",
  "Gritty crime",
  "Quiet indie drama",
  "Character study",
  "Dark comedy",
  "Feel-good",
  "Edge-of-seat mystery",
  "Epic spectacle",
  "Easy watch",
];

export async function getGeminiRecommendations(
  items: OTTMediaItem[],
  profile: Profile
): Promise<Map<string, Recommendation>> {
  if (items.length === 0) return new Map();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `You curate a weekly OTT digest for ${profile.name}, in the spirit of a MUBI curator:
restrained, specific, never marketing copy.
Preference profile:
- Loves: ${profile.genres.join(", ")}
- Languages: ${profile.languages.map(languageLabel).join(", ")}
- Platforms: ${profile.platforms.join(", ")}
- Watches 2-3 titles a week, so be selective: recommend WATCH only for strong matches.

Titles released in India in the last 7 days:
${JSON.stringify(
  items.map((i) => ({
    key: i.key,
    title: i.title,
    type: i.type,
    language: i.language,
    genres: i.genres,
    overview: i.overview,
    platforms: i.platforms,
    ...(i.newSeason ? { newSeason: i.newSeason } : {}),
    ...(i.ongoing !== undefined ? { status: i.ongoing ? "ongoing series" : "new series" } : {}),
    ...(i.rating !== undefined ? { criticRating: `${i.rating}/100` } : {}),
    ...(i.directors?.length ? { directors: i.directors } : {}),
    ...(i.cast?.length ? { cast: i.cast } : {}),
  })),
  null,
  2
)}

Where criticRating, cast or directors are given, weigh them: a well-reviewed title or a
notable director in his genres is a stronger WATCH; a weakly rated one needs a strong genre fit.

For every title, return:
- "key": its exact key
- "verdict": WATCH or SKIP
- "matchScore": 0-100 fit against the profile
- "twoLineSynopsis": what it is about, at most two short lines, no spoilers
- "reason": one sentence on why it fits or doesn't fit his tastes
- "moodTag": exactly one of: ${MOOD_TAGS.join(", ")}
- "xRayInsight": one short, true fact worth knowing, such as the director's or a lead
  actor's best-known work ("From the director of Gangs of Wasseypur"). Use only the
  directors and cast given or facts you are sure of; never invent credits.
- "take": a micro-review of at most 25 words about directorial voice, craft, tone or theme,
  not plot.`;

  const request = {
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            key: { type: Type.STRING },
            verdict: { type: Type.STRING, enum: ["WATCH", "SKIP"] },
            matchScore: { type: Type.INTEGER },
            twoLineSynopsis: { type: Type.STRING },
            reason: { type: Type.STRING },
            moodTag: { type: Type.STRING, enum: MOOD_TAGS },
            xRayInsight: { type: Type.STRING },
            take: { type: Type.STRING },
          },
          required: ["key", "verdict", "matchScore", "twoLineSynopsis", "reason", "moodTag", "xRayInsight", "take"],
        },
      },
    },
  };

  // Flash models return 503/429 under load; time-box each call and fall back to other Flash models.
  const models = [
    ...new Set([process.env.GEMINI_MODEL || "gemini-flash-latest", "gemini-3.5-flash", "gemini-flash-lite-latest"]),
  ];
  let response;
  let lastError: unknown;
  for (const model of models) {
    try {
      response = await ai.models.generateContent({
        model,
        ...request,
        config: { ...request.config, abortSignal: AbortSignal.timeout(25_000) },
      });
      break;
    } catch (err) {
      lastError = err;
      console.warn(`Gemini ${model} failed:`, err instanceof Error ? err.message : err);
    }
  }
  if (!response) throw lastError;

  try {
    const parsed: Recommendation[] = JSON.parse(response.text ?? "[]");
    return new Map(parsed.map((r) => [r.key, r]));
  } catch (err) {
    console.error("Gemini JSON parsing error:", err, response.text);
    return new Map();
  }
}
