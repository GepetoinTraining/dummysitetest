import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";

const DB_PATH = process.env.STUDYSYNC_DB_PATH || join(process.cwd(), "studysync.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

export function initDb(): void {
  const database = getDb();
  const schema = readFileSync(
    join(process.cwd(), "src/lib/db/schema.sql"),
    "utf-8"
  );
  database.exec(schema);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
