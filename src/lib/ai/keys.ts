// ============================================================
// API Key Management
//
// External API keys are optional — for when the student wants
// a more powerful model for heavy research tasks.
//
// Keys are encrypted at rest using AES-256-GCM with a key
// derived from the user's local passphrase via PBKDF2.
// We never store plaintext keys.
// ============================================================

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash } from "crypto";
import { getDb } from "@/lib/db/connection";
import { generateId } from "@/lib/utils/id";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

interface StoredKey {
  id: string;
  user_id: string;
  provider: string;
  key_hash: string; // SHA-256 hash for identification (not the actual key)
  encrypted_key: string; // AES-256-GCM encrypted key (hex)
  salt: string; // PBKDF2 salt (hex)
  iv: string; // AES IV (hex)
  auth_tag: string; // GCM auth tag (hex)
  created_at: number;
}

/**
 * Derive an encryption key from a user passphrase.
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha512");
}

/**
 * Hash an API key for identification (not encryption).
 * Used to check if a key is already stored without decrypting.
 */
function hashKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

/**
 * Store an encrypted API key for an external provider.
 *
 * The passphrase is used to derive the encryption key via PBKDF2.
 * The passphrase itself is never stored — the student must provide it
 * each time they want to use the external provider.
 */
export function storeApiKey(
  userId: string,
  provider: string,
  apiKey: string,
  passphrase: string
): string {
  const db = getDb();
  const id = generateId();

  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const derivedKey = deriveKey(passphrase, salt);

  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);
  let encrypted = cipher.update(apiKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  const keyHash = hashKey(apiKey);
  const now = Math.floor(Date.now() / 1000);

  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      salt TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, provider)
    )
  `);

  db.prepare(`
    INSERT OR REPLACE INTO api_keys (id, user_id, provider, key_hash, encrypted_key, salt, iv, auth_tag, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, provider, keyHash, encrypted, salt.toString("hex"), iv.toString("hex"), authTag.toString("hex"), now);

  return id;
}

/**
 * Retrieve and decrypt an API key.
 * Returns null if passphrase is wrong or key doesn't exist.
 */
export function retrieveApiKey(
  userId: string,
  provider: string,
  passphrase: string
): string | null {
  const db = getDb();

  const row = db.prepare(
    "SELECT * FROM api_keys WHERE user_id = ? AND provider = ?"
  ).get(userId, provider) as StoredKey | undefined;

  if (!row) return null;

  try {
    const salt = Buffer.from(row.salt, "hex");
    const iv = Buffer.from(row.iv, "hex");
    const authTag = Buffer.from(row.auth_tag, "hex");
    const derivedKey = deriveKey(passphrase, salt);

    const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(row.encrypted_key, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch {
    // Wrong passphrase or corrupted data
    return null;
  }
}

/**
 * Check if a key exists for a provider (without decrypting).
 */
export function hasApiKey(userId: string, provider: string): boolean {
  const db = getDb();
  const row = db.prepare(
    "SELECT 1 FROM api_keys WHERE user_id = ? AND provider = ?"
  ).get(userId, provider);
  return !!row;
}

/**
 * Delete a stored API key.
 */
export function deleteApiKey(userId: string, provider: string): void {
  const db = getDb();
  db.prepare(
    "DELETE FROM api_keys WHERE user_id = ? AND provider = ?"
  ).run(userId, provider);
}
