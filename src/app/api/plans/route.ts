import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db/connection";
import { createPlan, getActivePlan } from "@/lib/engine/planner";

export async function GET(req: NextRequest) {
  initDb();
  const userId = req.nextUrl.searchParams.get("user_id") ?? "";
  const granularity = req.nextUrl.searchParams.get("granularity") as "monthly" | "weekly" | "daily" ?? "weekly";
  return NextResponse.json(getActivePlan(userId, granularity));
}

export async function POST(req: NextRequest) {
  initDb();
  const { user_id, granularity, period_start, period_end, total_hours } = await req.json();
  return NextResponse.json(createPlan(user_id, granularity, period_start, period_end, total_hours), { status: 201 });
}
