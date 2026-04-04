import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db/connection";
import { getTodayChallenges, completeChallenge, ignoreChallenge } from "@/lib/engine/daily-push";

export async function GET(req: NextRequest) {
  initDb();
  const userId = req.nextUrl.searchParams.get("user_id") ?? "";
  return NextResponse.json(getTodayChallenges(userId));
}

export async function PATCH(req: NextRequest) {
  initDb();
  const { challenge_id, action } = await req.json();
  if (action === "complete") completeChallenge(challenge_id);
  else if (action === "ignore") ignoreChallenge(challenge_id);
  return NextResponse.json({ ok: true });
}
