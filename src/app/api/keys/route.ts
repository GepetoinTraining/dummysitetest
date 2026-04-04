import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db/connection";
import { storeApiKey, hasApiKey, deleteApiKey } from "@/lib/ai/keys";

export async function GET(req: NextRequest) {
  initDb();
  const userId = req.nextUrl.searchParams.get("user_id") ?? "";
  const provider = req.nextUrl.searchParams.get("provider") ?? "";
  return NextResponse.json({ has_key: hasApiKey(userId, provider) });
}

export async function POST(req: NextRequest) {
  initDb();
  const { user_id, provider, api_key, passphrase } = await req.json();
  const id = storeApiKey(user_id, provider, api_key, passphrase);
  return NextResponse.json({ id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  initDb();
  const { user_id, provider } = await req.json();
  deleteApiKey(user_id, provider);
  return NextResponse.json({ ok: true });
}
