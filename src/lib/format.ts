// Formatting helpers shared by the server (Telegram) and the browser (UI).

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

export function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function tmdbImage(path: string | undefined, size: "w342" | "w500" | "w780" | "w1280"): string | undefined {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;
}
