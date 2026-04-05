import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db/connection";
import { resolveView, getActiveView, seedDashboard, resetDashboard } from "@/lib/engine/primitives";

export async function GET(req: NextRequest) {
  initDb();
  const userId = req.nextUrl.searchParams.get("user_id") ?? "usr_001";
  const viewName = req.nextUrl.searchParams.get("view");
  const reset = req.nextUrl.searchParams.get("reset");

  // Reset if requested (re-seed from scratch)
  if (reset === "true") {
    resetDashboard(userId);
  }

  // Seed dashboard if first visit
  seedDashboard(userId);

  if (viewName) {
    const result = resolveView(userId, viewName);
    return NextResponse.json(result);
  }

  const active = getActiveView(userId);
  if (!active) {
    return NextResponse.json(resolveView(userId, "dashboard"));
  }

  return NextResponse.json(resolveView(userId, active.name));
}
