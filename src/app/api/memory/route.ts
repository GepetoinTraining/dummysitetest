import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db/connection";
import { getMemoryGraph } from "@/lib/engine/memory";

export async function GET(req: NextRequest) {
  initDb();
  const userId = req.nextUrl.searchParams.get("user_id") ?? "";
  const scope = req.nextUrl.searchParams.get("scope");
  const contactId = req.nextUrl.searchParams.get("contact_id");

  const scopeObj = scope === "contact" && contactId
    ? { type: "contact" as const, contactId }
    : scope === "global"
      ? { type: "global" as const }
      : undefined;

  return NextResponse.json(getMemoryGraph(userId, scopeObj));
}
