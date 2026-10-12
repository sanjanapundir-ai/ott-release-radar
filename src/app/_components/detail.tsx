"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import type { DigestEntry } from "@/lib/digest";
import { formatMinutes, tmdbImage } from "@/lib/format";
import { MatchRing, PlatformBadge, Poster, VerdictChip, arrivalLine, metaLine } from "./ui";

export function DetailSheet({
  entry,
  saved,
  onToggleSave,
  onClose,
}: {
  entry: DigestEntry;
  saved: boolean;
  onToggleSave: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const r = entry.recommendation;
  const backdrop = tmdbImage(entry.backdropPath, "w1280");
  const arrival = arrivalLine(entry);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="m-auto w-[min(760px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] overflow-y-auto rounded-2xl bg-zinc-900 p-0 text-white shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm"
    >
      <div className="relative aspect-[16/7] w-full bg-zinc-800">
        {backdrop && <Image src={backdrop} alt="" fill sizes="760px" className="object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/30 to-transparent" />
        <button
          onClick={() => ref.current?.close()}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/70 text-lg text-white hover:bg-black"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="-mt-20 relative flex gap-5 px-5 sm:px-8">
        <Poster entry={entry} sizes="128px" className="aspect-[2/3] w-28 shrink-0 rounded-lg shadow-xl ring-1 ring-white/10 sm:w-32" />
        <div className="flex min-w-0 flex-col justify-end gap-2 pb-1">
          <div className="flex flex-wrap gap-1.5">
            {entry.platforms.map((p) => (
              <PlatformBadge key={p} label={p} />
            ))}
          </div>
          <h2 className="text-2xl font-extrabold leading-tight text-balance sm:text-3xl">{entry.title}</h2>
          <p className="text-sm text-zinc-400">{metaLine(entry)}</p>
        </div>
      </div>

      <div className="grid gap-6 px-5 pb-8 pt-6 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          {r && <MatchRing score={r.matchScore} size={52} />}
          <div className="space-y-1">
            <VerdictChip entry={entry} />
            {r && <p className="text-sm text-zinc-300">{r.reason}</p>}
          </div>
        </div>

        {r?.take && (
          <section>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-500">Take of the week</h3>
            <p className="font-serif text-lg italic leading-relaxed text-zinc-100">“{r.take}”</p>
          </section>
        )}

        <section>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-500">Synopsis</h3>
          <p className="leading-relaxed text-zinc-300">{r?.twoLineSynopsis ?? entry.overview}</p>
        </section>

        <section className="rounded-xl bg-amber-400/10 p-4 ring-1 ring-amber-300/20">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-300">🔍 X-Ray</h3>
          {r?.xRayInsight && <p className="mb-3 text-sm text-amber-50">{r.xRayInsight}</p>}
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {entry.directors?.length ? (
              <div>
                <dt className="text-zinc-500">{entry.type === "movie" ? "Director" : "Created by"}</dt>
                <dd className="text-zinc-200">{entry.directors.join(", ")}</dd>
              </div>
            ) : null}
            {entry.cast?.length ? (
              <div>
                <dt className="text-zinc-500">Starring</dt>
                <dd className="text-zinc-200">{entry.cast.join(", ")}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-zinc-500">Genres</dt>
              <dd className="text-zinc-200">{[r?.moodTag, ...entry.genres].filter(Boolean).join(" · ")}</dd>
            </div>
            {entry.watchMinutes ? (
              <div>
                <dt className="text-zinc-500">Time to watch</dt>
                <dd className="text-zinc-200">
                  {formatMinutes(entry.watchMinutes)}
                  {entry.type === "tv" ? (entry.newSeason ? ` for season ${entry.newSeason}` : " for the series") : ""}
                </dd>
              </div>
            ) : null}
            {entry.rating !== undefined && (
              <div>
                <dt className="text-zinc-500">Critic rating</dt>
                <dd className="text-zinc-200">{entry.rating}/100</dd>
              </div>
            )}
            {arrival && (
              <div>
                <dt className="text-zinc-500">Arrived</dt>
                <dd className="text-zinc-200">{arrival}</dd>
              </div>
            )}
          </dl>
        </section>

        <div className="flex flex-wrap gap-3">
          {entry.link?.startsWith("https://") && (
            <a
              href={entry.link}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-white px-5 py-2.5 text-sm font-bold text-black hover:bg-zinc-200"
            >
              ▶ Open in {entry.platforms[0] === "Amazon Prime Video" ? "Prime Video" : entry.platforms[0]}
            </a>
          )}
          <button
            onClick={onToggleSave}
            className="rounded-md bg-zinc-700 px-5 py-2.5 text-sm font-semibold hover:bg-zinc-600"
          >
            {saved ? "✓ On your watchlist" : "+ Add to watchlist"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
