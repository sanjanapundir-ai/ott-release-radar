"use client";

import { useState } from "react";
import type { DigestEntry } from "@/lib/digest";

type Mode = "preview" | "send";

export default function Home() {
  const [loading, setLoading] = useState<Mode | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [entries, setEntries] = useState<DigestEntry[] | null>(null);

  const run = async (mode: Mode) => {
    setLoading(mode);
    setStatus(
      mode === "send"
        ? "Fetching live TMDB releases, running Gemini Flash, and messaging Telegram..."
        : "Fetching live TMDB releases and running Gemini Flash..."
    );
    try {
      const res = await fetch(`/api/digest?manual=true&send=${mode === "send"}`);
      const data = await res.json();
      if (res.ok) {
        setEntries(data.entries);
        setStatus(
          mode === "send"
            ? `Sent ${data.count} titles to Telegram in ${data.messages} message(s).`
            : `Found ${data.count} matching titles (not sent).`
        );
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch {
      setStatus("Failed to trigger pipeline.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-950 px-4 py-12 font-sans text-white">
      <div className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl sm:p-8">
        <h1 className="mb-2 text-2xl font-bold">OTT Release Radar</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Weekly digest of new OTT releases on Netflix, Prime Video and JioHotstar in India,
          filtered to Naman&apos;s tastes, with watch-or-skip verdicts from Gemini Flash.
        </p>

        <div className="mb-6 space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-300">
          <p><strong>Profile:</strong> Naman</p>
          <p><strong>Languages:</strong> Hindi, English, Tamil</p>
          <p><strong>Genres:</strong> Thriller, Sci-Fi, Indie Drama</p>
          <p><strong>Schedule:</strong> Every Friday at 7:00 PM IST (Telegram)</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => run("preview")}
            disabled={loading !== null}
            className="flex-1 rounded-lg border border-zinc-700 px-4 py-3 font-semibold transition hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading === "preview" ? "Loading..." : "Preview This Week"}
          </button>
          <button
            onClick={() => run("send")}
            disabled={loading !== null}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 font-semibold transition hover:bg-emerald-500 disabled:bg-zinc-700"
          >
            {loading === "send" ? "Sending..." : "Send Digest Now"}
          </button>
        </div>

        {status && (
          <p className="mt-4 rounded border border-zinc-700 bg-zinc-800 p-3 text-xs text-zinc-300">
            {status}
          </p>
        )}

        {entries && entries.length > 0 && (
          <ul className="mt-6 space-y-4">
            {entries.map((e) => {
              const r = e.recommendation;
              return (
                <li key={e.key} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold">{e.title}</h2>
                    {r && (
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${
                          r.verdict === "WATCH"
                            ? "bg-emerald-900 text-emerald-300"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {r.verdict} · {r.matchScore}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">
                    {e.type === "movie" ? "Movie" : "Series"} · {e.language.toUpperCase()} ·{" "}
                    {e.platforms.join(", ")} · {e.runtimeOrEpisodes}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{e.genres.join(", ")}</p>
                  <p className="mt-2 text-sm text-zinc-300">{r?.twoLineSynopsis ?? e.overview}</p>
                  {r && <p className="mt-2 text-xs italic text-zinc-400">{r.reason}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
