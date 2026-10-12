"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Digest, DigestEntry } from "@/lib/digest";
import type { Profile } from "@/lib/preferences";
import { formatMinutes, prettyDate } from "@/lib/format";
import { Hero, HeroSkeleton } from "./_components/hero";
import { DetailSheet } from "./_components/detail";
import { ProfileEditor, type ProfileOptions } from "./_components/profile";
import { MediaCard, SkeletonCard } from "./_components/ui";

type Tab = "week" | "watchlist" | "profile";
type Filter = "all" | "watch" | "skip" | "movie" | "tv";

interface DigestResponse extends Digest {
  count: number;
  messages: number;
  profile: Profile;
}

interface WatchlistItem {
  key: string;
  title: string;
  item: DigestEntry;
  addedAt: string;
}

const LOADING_STEPS = [
  "Checking Netflix, Prime Video and JioHotstar in India…",
  "Keeping only this week's new titles…",
  "Matching against your taste profile…",
  "Asking Gemini Flash for verdicts…",
  "Writing this week's micro-reviews…",
];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "watch", label: "Watch" },
  { id: "skip", label: "Skip" },
  { id: "movie", label: "Movies" },
  { id: "tv", label: "Series" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("week");
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<DigestEntry | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [profileData, setProfileData] = useState<{ profile: Profile; options: ProfileOptions; editable: boolean } | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchlistEnabled, setWatchlistEnabled] = useState(true);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  };

  const loadDigest = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStep(0);
    try {
      const res = await fetch("/api/digest?manual=true&send=false");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setDigest(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this week's picks.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWatchlist = useCallback(async () => {
    const res = await fetch("/api/watchlist");
    if (res.status === 503) return setWatchlistEnabled(false);
    if (res.ok) setWatchlist((await res.json()).items);
  }, []);

  useEffect(() => {
    // Initial data load from the API routes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDigest();
    loadWatchlist();
    fetch("/api/profile")
      .then((r) => r.json())
      .then(setProfileData)
      .catch(() => {});
  }, [loadDigest, loadWatchlist]);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 6000);
    return () => clearInterval(id);
  }, [loading]);

  const savedKeys = useMemo(() => new Set(watchlist.map((w) => w.key)), [watchlist]);

  const toggleSave = async (entry: DigestEntry) => {
    if (!watchlistEnabled) return showToast("The watchlist needs a database connection.");
    const saved = savedKeys.has(entry.key);
    setWatchlist((list) =>
      saved
        ? list.filter((w) => w.key !== entry.key)
        : [{ key: entry.key, title: entry.title, item: entry, addedAt: new Date().toISOString() }, ...list]
    );
    const res = saved
      ? await fetch(`/api/watchlist?key=${encodeURIComponent(entry.key)}`, { method: "DELETE" })
      : await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: entry.key, title: entry.title, item: entry }),
        });
    if (!res.ok) {
      showToast("Could not update your watchlist. Try again.");
      loadWatchlist();
    } else {
      showToast(saved ? `Removed ${entry.title} from your watchlist` : `Added ${entry.title} to your watchlist`);
    }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/digest?manual=true");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`Sent ${data.count} picks to Telegram`);
    } catch (err) {
      showToast(err instanceof Error ? `Telegram send failed: ${err.message}` : "Telegram send failed");
    } finally {
      setSending(false);
    }
  };

  const entries = digest?.entries ?? [];
  const featured = entries.find((e) => e.recommendation?.verdict === "WATCH") ?? entries[0];
  const filtered = entries.filter((e) => {
    if (filter === "watch") return e.recommendation?.verdict === "WATCH";
    if (filter === "skip") return e.recommendation?.verdict === "SKIP";
    if (filter === "movie" || filter === "tv") return e.type === filter;
    return true;
  });
  const watchCount = entries.filter((e) => e.recommendation?.verdict === "WATCH").length;
  const name = profileData?.profile.name ?? digest?.profile.name ?? "Naman";

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-zinc-950/85 backdrop-blur" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black tracking-tight text-red-600">RADAR</span>
            <span className="text-sm text-zinc-400">for {name}</span>
          </div>
          <nav className="flex gap-1 text-sm" aria-label="Sections">
            {(
              [
                ["week", "New this week"],
                ["watchlist", `Watchlist${watchlist.length ? ` (${watchlist.length})` : ""}`],
                ["profile", "Profile"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  tab === id ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-10 px-4 py-6 sm:px-6 sm:py-8">
        {tab === "week" && (
          <>
            {loading ? (
              <HeroSkeleton message={LOADING_STEPS[step]} />
            ) : error ? (
              <section className="grid min-h-[300px] place-items-center rounded-2xl bg-zinc-900 p-8 text-center">
                <div className="space-y-3">
                  <p className="text-lg font-semibold">This week&apos;s picks didn&apos;t load</p>
                  <p className="text-sm text-zinc-400">{error}</p>
                  <button onClick={loadDigest} className="rounded-md bg-white px-4 py-2 text-sm font-bold text-black">
                    Try again
                  </button>
                </div>
              </section>
            ) : featured ? (
              <Hero
                entry={featured}
                saved={savedKeys.has(featured.key)}
                onToggleSave={() => toggleSave(featured)}
                onOpen={() => setOpen(featured)}
              />
            ) : (
              <section className="grid min-h-[300px] place-items-center rounded-2xl bg-zinc-900 p-8 text-center">
                <div className="space-y-2">
                  <p className="text-lg font-semibold">Nothing new matched your taste this week</p>
                  <p className="text-sm text-zinc-400">Try adding a genre or language in your profile.</p>
                </div>
              </section>
            )}

            {digest && !loading && (
              <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-zinc-900/70 px-5 py-4 ring-1 ring-white/5">
                <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-zinc-500">This week</p>
                    <p className="font-semibold">
                      {prettyDate(digest.fromDate)} – {prettyDate(digest.toDate)} · India
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-zinc-500">Worth watching</p>
                    <p className="font-semibold tabular-nums">
                      {watchCount} of {entries.length} picks
                    </p>
                  </div>
                  {digest.weekendMinutes > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-widest text-zinc-500">Weekend commitment</p>
                      <p className="font-semibold tabular-nums">{formatMinutes(digest.weekendMinutes)} for the WATCH picks</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs uppercase tracking-widest text-zinc-500">Next digest</p>
                    <p className="font-semibold">Friday, 7:00 PM IST</p>
                  </div>
                </div>
                <button
                  onClick={sendNow}
                  disabled={sending}
                  className="rounded-md bg-red-600 px-5 py-2.5 text-sm font-bold transition hover:bg-red-500 disabled:opacity-60"
                >
                  {sending ? "Sending…" : "Send to Telegram now"}
                </button>
              </section>
            )}

            <section className="grid gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">New in India this week</h2>
                  <p className="text-sm text-zinc-400">The {entries.length || 7} best matches, picked for your taste</p>
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter picks">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFilter(f.id)}
                      aria-pressed={filter === f.id}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        filter === f.id ? "bg-white text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
                {loading
                  ? Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)
                  : filtered.map((e) => <MediaCard key={e.key} entry={e} onOpen={() => setOpen(e)} />)}
                {!loading && entries.length > 0 && filtered.length === 0 && (
                  <p className="py-10 text-sm text-zinc-400">No picks match this filter.</p>
                )}
              </div>
            </section>
          </>
        )}

        {tab === "watchlist" && (
          <section className="grid gap-4">
            <div>
              <h2 className="text-2xl font-bold">Your watchlist</h2>
              <p className="text-sm text-zinc-400">
                {watchlistEnabled ? "Saved picks stay here across weeks." : "The watchlist needs a database connection."}
              </p>
            </div>
            {watchlist.length === 0 ? (
              <p className="rounded-xl bg-zinc-900 p-8 text-center text-sm text-zinc-400">
                Nothing saved yet. Tap “Add to watchlist” on any pick.
              </p>
            ) : (
              <div className="flex flex-wrap gap-4">
                {watchlist.map((w) => (
                  <MediaCard key={w.key} entry={w.item} onOpen={() => setOpen(w.item)} />
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "profile" &&
          (profileData ? (
            <ProfileEditor
              profile={profileData.profile}
              options={profileData.options}
              editable={profileData.editable}
              onSaved={(profile) => {
                setProfileData({ ...profileData, profile });
                setTab("week");
                loadDigest();
              }}
            />
          ) : (
            <p className="text-sm text-zinc-400">Loading profile…</p>
          ))}
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-xs text-zinc-500 sm:px-6">
        Data from TMDB and Streaming Availability · Verdicts by Gemini Flash · Digest every Friday at 7 PM IST on Telegram
      </footer>

      {open && (
        <DetailSheet
          key={open.key}
          entry={open}
          saved={savedKeys.has(open.key)}
          onToggleSave={() => toggleSave(open)}
          onClose={() => setOpen(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 z-50 mx-auto w-fit max-w-[calc(100vw-32px)] rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black shadow-xl"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
