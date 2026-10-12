import { NextRequest, NextResponse } from "next/server";
import { getProfile, isDatabaseEnabled, saveProfile } from "@/lib/db";
import { GENRES, LANGUAGES, PLATFORMS } from "@/lib/preferences";

// The profile plus the options the editor can offer.
export async function GET() {
  return NextResponse.json({
    profile: await getProfile(),
    editable: isDatabaseEnabled(),
    options: {
      genres: GENRES.map((g) => g.label),
      languages: LANGUAGES,
      platforms: PLATFORMS.map((p) => ({ label: p.label, color: p.color })),
    },
  });
}

export async function PUT(req: NextRequest) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Profile editing needs DATABASE_URL" }, { status: 503 });
  }
  try {
    const profile = await saveProfile(await req.json());
    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
