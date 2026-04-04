import { NextRequest, NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/db/connection";
import { generateId } from "@/lib/utils/id";

export async function GET(req: NextRequest) {
  initDb();
  const db = getDb();
  const userId = req.nextUrl.searchParams.get("user_id") ?? "";
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const blob = db.prepare("SELECT * FROM graph_blobs WHERE id = ? AND user_id = ?").get(id, userId);
    return NextResponse.json(blob);
  }

  const blobs = db.prepare(
    "SELECT id, name, discipline_id, is_memory_web, created_at, modified_at FROM graph_blobs WHERE user_id = ? ORDER BY modified_at DESC"
  ).all(userId);
  return NextResponse.json(blobs);
}

export async function POST(req: NextRequest) {
  initDb();
  const db = getDb();
  const { user_id, discipline_id, name, blob, is_memory_web } = await req.json();
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(
    "INSERT INTO graph_blobs (id, user_id, discipline_id, name, blob, is_memory_web, created_at, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, user_id, discipline_id ?? null, name, JSON.stringify(blob), is_memory_web ? 1 : 0, now, now);

  return NextResponse.json({ id }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  initDb();
  const db = getDb();
  const { id, blob } = await req.json();
  const now = Math.floor(Date.now() / 1000);

  db.prepare("UPDATE graph_blobs SET blob = ?, modified_at = ? WHERE id = ?")
    .run(JSON.stringify(blob), now, id);

  return NextResponse.json({ ok: true });
}
