import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db/connection";
import { grep } from "@/lib/engine/autopilot";

export async function POST(req: NextRequest) {
  initDb();
  const { user_id, query, sources, limit } = await req.json();
  return NextResponse.json(grep(user_id, query, sources, limit));
}
