export interface UserPreferences {
  name: string;
  tastes: string[];
  languages: { code: string; label: string }[]; // ISO 639-1
  genres: {
    movies: number[];
    tv: number[];
  };
  // Matched by name against TMDB's India provider list, so ID changes
  // (e.g. Hotstar -> JioHotstar) don't silently break the filter.
  platforms: { label: string; match: RegExp }[];
}

export const namanPreferences: UserPreferences = {
  name: "Naman",
  tastes: ["Thriller", "Sci-Fi", "Indie Drama"],
  languages: [
    { code: "hi", label: "Hindi" },
    { code: "en", label: "English" },
    { code: "ta", label: "Tamil" },
  ],
  genres: {
    // Thriller: 53, Sci-Fi: 878, Drama: 18 (TMDB has no "indie" genre)
    movies: [53, 878, 18],
    // TV has no Thriller genre: Crime 80, Mystery 9648, Sci-Fi & Fantasy 10765, Drama 18
    tv: [80, 9648, 10765, 18],
  },
  platforms: [
    { label: "Netflix", match: /^netflix$/i },
    { label: "Amazon Prime Video", match: /^amazon prime video$/i },
    { label: "JioHotstar", match: /hotstar/i },
  ],
};
