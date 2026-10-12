"use client";

import { useState } from "react";
import type { Profile } from "@/lib/preferences";

export interface ProfileOptions {
  genres: string[];
  languages: { code: string; label: string }[];
  platforms: { label: string; color: string }[];
}

function Chip({ on, onClick, children, color }: { on: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        on ? "bg-white text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
      }`}
      style={on && color ? { backgroundColor: color, color: "#fff" } : undefined}
    >
      {on ? "✓ " : ""}
      {children}
    </button>
  );
}

export function ProfileEditor({
  profile,
  options,
  editable,
  onSaved,
}: {
  profile: Profile;
  options: ProfileOptions;
  editable: boolean;
  onSaved: (p: Profile) => void;
}) {
  const [draft, setDraft] = useState<Profile>(profile);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggle = (field: "genres" | "languages" | "platforms", value: string) =>
    setDraft((d) => ({
      ...d,
      [field]: d[field].includes(value) ? d[field].filter((v) => v !== value) : [...d[field], value],
    }));

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus("Saved. This week's picks are being rebuilt for your new taste.");
      onSaved(data.profile);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-3xl gap-8">
      <div>
        <h2 className="text-2xl font-bold">Taste profile</h2>
        <p className="mt-1 text-sm text-zinc-400">
          The radar uses this every Friday to pick titles and to brief Gemini.
          {!editable && " Editing is off because no database is connected."}
        </p>
      </div>

      <label className="grid gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Name</span>
        <input
          id="profile-name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          maxLength={40}
          className="max-w-xs rounded-md bg-zinc-800 px-3 py-2 text-white outline-none ring-red-500 focus:ring-2"
        />
      </label>

      <fieldset className="grid gap-3">
        <legend className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Genres</legend>
        <div className="flex flex-wrap gap-2">
          {options.genres.map((g) => (
            <Chip key={g} on={draft.genres.includes(g)} onClick={() => toggle("genres", g)}>
              {g}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Languages</legend>
        <div className="flex flex-wrap gap-2">
          {options.languages.map((l) => (
            <Chip key={l.code} on={draft.languages.includes(l.code)} onClick={() => toggle("languages", l.code)}>
              {l.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Platforms</legend>
        <div className="flex flex-wrap gap-2">
          {options.platforms.map((p) => (
            <Chip key={p.label} color={p.color} on={draft.platforms.includes(p.label)} onClick={() => toggle("platforms", p.label)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={save}
          disabled={!editable || saving}
          className="rounded-md bg-red-600 px-6 py-2.5 font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
        {status && <p className="text-sm text-zinc-300" role="status">{status}</p>}
      </div>
    </div>
  );
}
