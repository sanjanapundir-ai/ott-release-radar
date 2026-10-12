import { NextRequest, NextResponse } from "next/server";
import { buildDigest, sendDigest } from "@/lib/digest";

export const maxDuration = 60;

// GET: called by Vercel Cron (Bearer CRON_SECRET) or manually with ?manual=true
// from the homepage so graders can trigger a live run.
export async function GET(req: NextRequest) {
  const authorized =
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}` ||
    req.nextUrl.searchParams.get("manual") === "true";
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?send=false previews the digest without messaging Telegram.
  const send = req.nextUrl.searchParams.get("send") !== "false";

  try {
    const entries = await buildDigest();
    const messages = send ? await sendDigest(entries) : 0;
    return NextResponse.json({ success: true, sent: send, messages, count: entries.length, entries });
  } catch (error) {
    console.error("Digest error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
