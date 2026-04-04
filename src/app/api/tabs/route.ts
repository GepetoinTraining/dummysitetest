import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db/connection";
import { createTab, listTabs } from "@/lib/engine/tabs";

export async function GET(req: NextRequest) {
  initDb();
  const userId = req.nextUrl.searchParams.get("user_id") ?? "";
  return NextResponse.json(listTabs(userId));
}

export async function POST(req: NextRequest) {
  initDb();
  const body = await req.json();
  const result = createTab(body);
  return NextResponse.json(result, { status: 201 });
}
