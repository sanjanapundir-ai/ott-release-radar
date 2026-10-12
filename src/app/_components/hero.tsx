"use client";

import Image from "next/image";
import type { DigestEntry } from "@/lib/digest";
import { tmdbImage } from "@/lib/format";
import { MatchRing, PlatformBadge, arrivalLine, metaLine } from "./ui";

export function Hero({
  entry,
  saved,
  onToggleSave,
  onOpen,
}: {
  entry: DigestEntry;
  saved: boolean;
  onToggleSave: () => void;
  onOpen: () => void;
}) {
  const r = entry.recommendation;
  const backdrop = tmdbImage(entry.backdropPath, "w1280") ?? tmdbImage(entry.posterPath, "w780");
  const arrival = arrivalLine(entry);
  return (
    <section className="relative isolate overflow-hidden rounded-2xl bg-zinc-900">
      {backdrop && (
        <Image
          src={backdrop}
          alt=""
          fill
          preload
          sizes="(min-width: 1280px) 1200px, 100vw"
          className="-z-10 object-cover object-top opacity-80"
        />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/70 to-black/0 sm:bg-gradient-to-r sm:from-black sm:via-black/75 sm:to-black/10" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />

      <div className="flex min-h-[420px] max-w-2xl flex-col justify-end gap-4 p-6 sm:p-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">Featured pick</span>
          {entry.platforms.map((p) => (
            <PlatformBadge key={p} label={p} />
          ))}
          {arrival && <span className="text-xs text-zinc-300">{arrival}</span>}
        </div>

        <div className="flex items-end gap-4">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white text-balance sm:text-5xl">
            {entry.title}
          </h2>
          {r && <MatchRing score={r.matchScore} size={56} />}
        </div>

        <p className="text-sm text-zinc-300">
          {metaLine(entry)}
          {r?.moodTag ? <span className="text-red-300"> · {r.moodTag}</span> : null}
        </p>

        {r ? (
          <blockquote className="border-l-2 border-red-500 pl-4">
            <p className="text-base leading-relaxed text-zinc-100 sm:text-lg">“{r.take}”</p>
            <footer className="mt-2 text-xs text-zinc-400">
              Gemini verdict:{" "}
              <span className={r.verdict === "WATCH" ? "font-bold text-emerald-300" : "font-bold text-zinc-300"}>
                {r.verdict}
              </span>{" "}
              · {r.reason}
            </footer>
          </blockquote>
        ) : (
          <p className="line-clamp-3 text-sm text-zinc-300">{entry.overview}</p>
        )}

        <div className="flex flex-wrap gap-3 pt-1">
          {entry.link?.startsWith("https://") && (
            <a
              href={entry.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-sm font-bold text-black transition hover:bg-zinc-200"
            >
              ▶ Watch on {entry.platforms[0] === "Amazon Prime Video" ? "Prime Video" : entry.platforms[0]}
            </a>
          )}
          <button
            onClick={onToggleSave}
            className="inline-flex items-center gap-2 rounded-md bg-zinc-500/40 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-zinc-500/60"
          >
            {saved ? "✓ On your watchlist" : "+ Add to watchlist"}
          </button>
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-2 rounded-md border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            🔍 X-Ray
          </button>
        </div>
      </div>
    </section>
  );
}

export function HeroSkeleton({ message }: { message: string }) {
  return (
    <section className="relative flex min-h-[420px] flex-col justify-end gap-4 overflow-hidden rounded-2xl bg-zinc-900 p-6 sm:p-10">
      <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-zinc-900 via-zinc-800/60 to-zinc-900" />
      <div className="relative space-y-4">
        <div className="h-3 w-28 rounded bg-zinc-700" />
        <div className="h-10 w-2/3 max-w-md rounded bg-zinc-700" />
        <div className="h-3 w-1/2 max-w-sm rounded bg-zinc-800" />
        <p className="flex items-center gap-3 pt-2 text-sm text-zinc-300" role="status" aria-live="polite">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-500 border-t-transparent motion-reduce:animate-none" />
          {message}
        </p>
      </div>
    </section>
  );
}
