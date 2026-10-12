// The profile is stored as plain labels (editable from the UI and saved in Neon).
// These catalogs turn labels into what TMDB and the streaming APIs understand.

export interface Profile {
  name: string;
  genres: string[]; // labels from GENRES
  languages: string[]; // ISO 639-1 codes from LANGUAGES
  platforms: string[]; // labels from PLATFORMS
}

export const DEFAULT_PROFILE: Profile = {
  name: "Naman",
  genres: ["Thriller", "Sci-Fi", "Indie Drama"],
  languages: ["hi", "en", "ta"],
  platforms: ["Netflix", "Amazon Prime Video", "JioHotstar"],
};

// TMDB genre IDs differ between movies and TV (TV has no Thriller, Romance or Horror).
export const GENRES: { label: string; movie: number[]; tv: number[] }[] = [
  { label: "Thriller", movie: [53], tv: [80, 9648] },
  { label: "Sci-Fi", movie: [878], tv: [10765] },
  { label: "Indie Drama", movie: [18], tv: [18] }, // TMDB has no "indie" genre
  { label: "Crime", movie: [80], tv: [80] },
  { label: "Mystery", movie: [9648], tv: [9648] },
  { label: "Action", movie: [28], tv: [10759] },
  { label: "Comedy", movie: [35], tv: [35] },
  { label: "Romance", movie: [10749], tv: [] },
  { label: "Horror", movie: [27], tv: [] },
  { label: "Fantasy", movie: [14], tv: [10765] },
  { label: "Animation", movie: [16], tv: [16] },
  { label: "Documentary", movie: [99], tv: [99] },
];

export const LANGUAGES: { code: string; label: string }[] = [
  { code: "hi", label: "Hindi" },
  { code: "en", label: "English" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "ml", label: "Malayalam" },
  { code: "kn", label: "Kannada" },
  { code: "bn", label: "Bengali" },
  { code: "mr", label: "Marathi" },
  { code: "ko", label: "Korean" },
  { code: "ja", label: "Japanese" },
];

// Matched by name (and RapidAPI service id), so renamed or re-numbered providers are still found.
export const PLATFORMS: { label: string; match: RegExp; color: string }[] = [
  { label: "Netflix", match: /^netflix$/i, color: "#E50914" },
  { label: "Amazon Prime Video", match: /^(amazon )?prime( video)?$/i, color: "#00A8E1" },
  { label: "JioHotstar", match: /hotstar/i, color: "#1F80E0" },
  { label: "Zee5", match: /^zee5$/i, color: "#8230C6" },
  { label: "SonyLIV", match: /^sony ?liv$/i, color: "#F5A623" },
  { label: "Apple TV+", match: /^apple( tv\+?)?$/i, color: "#A2AAAD" },
  { label: "MUBI", match: /^mubi$/i, color: "#3D7EFF" },
];

export function genreLabel(label: string) {
  return GENRES.find((g) => g.label === label);
}

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase();
}

export function platformsFor(labels: string[]) {
  return PLATFORMS.filter((p) => labels.includes(p.label));
}

export function genreIdsFor(profile: Profile) {
  const selected = GENRES.filter((g) => profile.genres.includes(g.label));
  return {
    movies: [...new Set(selected.flatMap((g) => g.movie))],
    tv: [...new Set(selected.flatMap((g) => g.tv))],
  };
}

// Keeps only known values, so a bad request can't break the pipeline.
export function sanitizeProfile(input: Partial<Profile>): Profile {
  const pick = (values: unknown, allowed: string[]) =>
    Array.isArray(values) ? [...new Set(values.filter((v): v is string => allowed.includes(v)))] : [];
  const profile: Profile = {
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 40) : DEFAULT_PROFILE.name,
    genres: pick(input.genres, GENRES.map((g) => g.label)),
    languages: pick(input.languages, LANGUAGES.map((l) => l.code)),
    platforms: pick(input.platforms, PLATFORMS.map((p) => p.label)),
  };
  if (!profile.genres.length || !profile.languages.length || !profile.platforms.length) {
    throw new Error("Pick at least one genre, one language and one platform.");
  }
  return profile;
}
