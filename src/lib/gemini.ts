import { GoogleGenAI, Type } from "@google/genai";
import { namanPreferences } from "./preferences";
import type { OTTMediaItem } from "./tmdb";

export interface Recommendation {
  key: string;
  verdict: "WATCH" | "SKIP";
  matchScore: number;
  twoLineSynopsis: string;
  reason: string;
}

export async function getGeminiRecommendations(
  items: OTTMediaItem[]
): Promise<Map<string, Recommendation>> {
  if (items.length === 0) return new Map();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

  const ai = new GoogleGenAI({ apiKey });
  const prefs = namanPreferences;

  const prompt = `You curate a weekly OTT digest for ${prefs.name}.
Preference profile:
- Loves: ${prefs.tastes.join(", ")}
- Languages: ${prefs.languages.map((l) => l.label).join(", ")}
- Platforms: ${prefs.platforms.map((p) => p.label).join(", ")}
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
  })),
  null,
  2
)}

For every title, return its exact "key", a verdict (WATCH or SKIP), a 0-100 matchScore
against the profile, a synopsis of at most two short lines, and a one-sentence reason
tied to his tastes.`;

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
          },
          required: ["key", "verdict", "matchScore", "twoLineSynopsis", "reason"],
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
        config: { ...request.config, abortSignal: AbortSignal.timeout(15_000) },
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
