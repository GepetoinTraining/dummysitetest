import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db/connection";
import { startSession, endSession, getActiveSession } from "@/lib/engine/session";

export async function GET(req: NextRequest) {
  initDb();
  const userId = req.nextUrl.searchParams.get("user_id") ?? "";
  return NextResponse.json(getActiveSession(userId));
}

export async function POST(req: NextRequest) {
  initDb();
  const { user_id, discipline_id, skill_file } = await req.json();
  return NextResponse.json(startSession(user_id, discipline_id, skill_file), { status: 201 });
}

export async function PATCH(req: NextRequest) {
  initDb();
  const { session_id, self_assessment, ai_assessment } = await req.json();
  return NextResponse.json(endSession(session_id, self_assessment, ai_assessment));
}
