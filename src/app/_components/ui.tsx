"use client";

import Image from "next/image";
import type { DigestEntry } from "@/lib/digest";
import { PLATFORMS, languageLabel } from "@/lib/preferences";
import { formatMinutes, prettyDate, tmdbImage } from "@/lib/format";

export function platformColor(label: string): string {
  return PLATFORMS.find((p) => p.label === label)?.color ?? "#71717a";
}

export function PlatformBadge({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ${className}`}
      style={{ backgroundColor: `${platformColor(label)}E6` }}
    >
      {label === "Amazon Prime Video" ? "Prime Video" : label}
    </span>
  );
}

export function MatchRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "#34d399" : score >= 55 ? "#fbbf24" : "#a1a1aa";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`${score}% match`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.15)" strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[11px] font-bold tabular-nums text-white">
        {score}
      </span>
    </div>
  );
}

export function VerdictChip({ entry }: { entry: DigestEntry }) {
  const r = entry.recommendation;
  if (!r) return <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-400">No verdict</span>;
  return r.verdict === "WATCH" ? (
    <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold tracking-wide text-emerald-300 ring-1 ring-emerald-400/30">
      WATCH
    </span>
  ) : (
    <span className="rounded bg-zinc-700/40 px-2 py-0.5 text-[11px] font-bold tracking-wide text-zinc-400 ring-1 ring-zinc-500/30">
      SKIP
    </span>
  );
}

export function Poster({ entry, sizes, className = "" }: { entry: DigestEntry; sizes: string; className?: string }) {
  const src = tmdbImage(entry.posterPath, "w500");
  if (!src) {
    return (
      <div
        className={`grid place-items-center bg-gradient-to-br from-zinc-700 to-zinc-900 p-3 text-center text-sm font-semibold text-zinc-200 ${className}`}
      >
        {entry.title}
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden bg-zinc-800 ${className}`}>
      <Image src={src} alt={`${entry.title} poster`} fill sizes={sizes} className="object-cover" />
    </div>
  );
}

export function metaLine(e: DigestEntry): string {
  return [
    e.type === "movie" ? "Movie" : "Series",
    languageLabel(e.language),
    e.runtimeOrEpisodes,
    e.newSeason ? `Season ${e.newSeason}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function arrivalLine(e: DigestEntry): string | null {
  if (!e.addedOn) return null;
  return `New on ${e.platforms[0] === "Amazon Prime Video" ? "Prime Video" : e.platforms[0]} · ${prettyDate(e.addedOn)}`;
}

export function MediaCard({ entry, onOpen }: { entry: DigestEntry; onOpen: () => void }) {
  const r = entry.recommendation;
  return (
    <button
      onClick={onOpen}
      className="group w-40 shrink-0 snap-start text-left outline-none sm:w-48"
      aria-label={`${entry.title}, open details`}
    >
      <div className="relative transition duration-300 group-hover:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-red-500 rounded-md">
        <Poster entry={entry} sizes="(min-width: 640px) 192px, 160px" className="aspect-[2/3] w-full rounded-md" />
        <div className="pointer-events-none absolute inset-0 rounded-md bg-gradient-to-t from-black/85 via-black/10 to-black/30" />
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {entry.platforms.slice(0, 2).map((p) => (
            <PlatformBadge key={p} label={p} />
          ))}
        </div>
        {r && (
          <div className="absolute right-2 top-2">
            <MatchRing score={r.matchScore} size={40} />
          </div>
        )}
        <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
          <VerdictChip entry={entry} />
          {entry.watchMinutes ? (
            <span className="text-[11px] font-medium text-zinc-300 tabular-nums">{formatMinutes(entry.watchMinutes)}</span>
          ) : null}
        </div>
      </div>
      <div className="mt-2 space-y-0.5 px-0.5">
        <h3 className="truncate text-sm font-semibold text-white">{entry.title}</h3>
        <p className="truncate text-xs text-zinc-400">{metaLine(entry)}</p>
        {r?.moodTag && <p className="truncate text-xs text-red-300/90">{r.moodTag}</p>}
      </div>
    </button>
  );
}

export function SkeletonCard() {
  return (
    <div className="w-40 shrink-0 sm:w-48">
      <div className="aspect-[2/3] w-full animate-pulse rounded-md bg-zinc-800" />
      <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-zinc-800" />
      <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-zinc-800/70" />
    </div>
  );
}
