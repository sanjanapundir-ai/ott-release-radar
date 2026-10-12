import { NextRequest, NextResponse } from "next/server";
import { addToWatchlist, getWatchlist, isDatabaseEnabled, removeFromWatchlist } from "@/lib/db";

function disabled() {
  return NextResponse.json({ error: "Watchlist needs DATABASE_URL" }, { status: 503 });
}

export async function GET() {
  if (!isDatabaseEnabled()) return disabled();
  return NextResponse.json({ items: await getWatchlist() });
}

// Body: { key, title, item } where item is the digest entry to remember.
export async function POST(req: NextRequest) {
  if (!isDatabaseEnabled()) return disabled();
  const body = await req.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key : "";
  const title = typeof body?.title === "string" ? body.title.slice(0, 200) : "";
  if (!/^(movie|tv)-\d+$/.test(key) || !title || typeof body?.item !== "object") {
    return NextResponse.json({ error: "Expected { key, title, item }" }, { status: 400 });
  }
  const size = JSON.stringify(body.item).length;
  if (size > 20_000) return NextResponse.json({ error: "Item too large" }, { status: 413 });
  await addToWatchlist(key, title, body.item);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!isDatabaseEnabled()) return disabled();
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!/^(movie|tv)-\d+$/.test(key)) return NextResponse.json({ error: "Missing key" }, { status: 400 });
  await removeFromWatchlist(key);
  return NextResponse.json({ ok: true });
}
