import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db/connection";
import { computeLattice } from "@/lib/engine/lattice";

export async function GET(req: NextRequest) {
  initDb();
  const userId = req.nextUrl.searchParams.get("user_id") ?? "";
  return NextResponse.json(computeLattice(userId));
}
