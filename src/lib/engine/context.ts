// ============================================================
// Context Ledger — Mermaid-compressed conversation memory
//
// Problem: 128K context is tiny when you fill it with raw chat.
// Solution: compress each turn into a Mermaid schema node.
//
// Raw turn: ~500 tokens
// Mermaid extraction: ~50 tokens
// 350 turns raw = 175K tokens (blown)
// 350 turns Mermaid = 17.5K tokens (fits easily)
//
// The AI's context window at any point:
//   1. System prompt + function registry (~5K)
//   2. Full conversation Mermaid graph (~17.5K max)
//   3. Last 3 raw turns (~1.5K)
//   4. Current turn
//   = ~24K tokens, leaving 104K for thinking + output
//
// The AI can also query deeper into the ledger by turn number
// or tag, pulling specific raw turns when needed.
// ============================================================

import { getDb } from "@/lib/db/connection";
import { generateId } from "@/lib/utils/id";

const LEDGER_SIZE = 350;
const RAW_WINDOW = 3; // last N turns kept as raw text in context

export interface LedgerEntry {
  id: string;
  user_id: string;
  session_id: string | null;
  slot: number;
  turn_number: number;
  role: "user" | "assistant";
  raw_content: string;
  mermaid_schema: string;
  central_idea: string;
  tags: string[];
  created_at: number;
}

// -----------------------------------------------------------
// Write to ledger
// -----------------------------------------------------------

/**
 * Record a conversation turn.
 * Compresses the turn into a Mermaid schema node and writes
 * to the rolling buffer. Slot wraps at LEDGER_SIZE.
 *
 * The Mermaid extraction + central_idea come from the AI itself —
 * after each turn, the AI is asked to compress it.
 */
export function recordTurn(params: {
  userId: string;
  sessionId?: string;
  role: "user" | "assistant";
  rawContent: string;
  mermaidSchema: string;
  centralIdea: string;
  tags: string[];
}): LedgerEntry {
  const db = getDb();
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);
  const sessionId = params.sessionId ?? null;

  // Get current turn number
  const lastTurn = db.prepare(`
    SELECT COALESCE(MAX(turn_number), -1) as last
    FROM context_ledger
    WHERE user_id = ? AND (session_id = ? OR (session_id IS NULL AND ? IS NULL))
  `).get(params.userId, sessionId, sessionId) as { last: number };

  const turnNumber = lastTurn.last + 1;
  const slot = turnNumber % LEDGER_SIZE;

  // Upsert into slot (overwrites oldest when buffer wraps)
  db.prepare(`
    INSERT INTO context_ledger (id, user_id, session_id, slot, turn_number, role, raw_content, mermaid_schema, central_idea, tags, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, session_id, slot)
    DO UPDATE SET id = ?, turn_number = ?, role = ?, raw_content = ?, mermaid_schema = ?, central_idea = ?, tags = ?, created_at = ?
  `).run(
    id, params.userId, sessionId, slot, turnNumber, params.role,
    params.rawContent, params.mermaidSchema, params.centralIdea,
    JSON.stringify(params.tags), now,
    id, turnNumber, params.role,
    params.rawContent, params.mermaidSchema, params.centralIdea,
    JSON.stringify(params.tags), now
  );

  return {
    id,
    user_id: params.userId,
    session_id: sessionId,
    slot,
    turn_number: turnNumber,
    role: params.role,
    raw_content: params.rawContent,
    mermaid_schema: params.mermaidSchema,
    central_idea: params.centralIdea,
    tags: params.tags,
    created_at: now,
  };
}

// -----------------------------------------------------------
// Build AI context
// -----------------------------------------------------------

/**
 * Build the full context for the AI's context window.
 *
 * Returns:
 *   1. Mermaid graph of the entire conversation history
 *   2. Last N raw turns
 *
 * This is what gets injected into the system prompt.
 */
export function buildContext(
  userId: string,
  sessionId?: string
): { mermaidGraph: string; rawTurns: string[]; turnCount: number } {
  const db = getDb();
  const sid = sessionId ?? null;

  // Get all ledger entries for this session, ordered by turn
  const entries = db.prepare(`
    SELECT * FROM context_ledger
    WHERE user_id = ? AND (session_id = ? OR (session_id IS NULL AND ? IS NULL))
    ORDER BY turn_number ASC
  `).all(userId, sid, sid) as RawLedgerRow[];

  if (entries.length === 0) {
    return { mermaidGraph: "", rawTurns: [], turnCount: 0 };
  }

  const deserialized = entries.map(deserialize);

  // 1. Build composite Mermaid graph from all turn schemas
  const mermaidGraph = buildMermaidGraph(deserialized);

  // 2. Get last N raw turns
  const lastN = deserialized.slice(-RAW_WINDOW);
  const rawTurns = lastN.map(
    (e) => `[${e.role} | turn ${e.turn_number}]\n${e.raw_content}`
  );

  return {
    mermaidGraph,
    rawTurns,
    turnCount: deserialized.length,
  };
}

/**
 * Compose all turn Mermaid schemas into one conversation graph.
 *
 * Each turn becomes a node. Edges connect sequential turns.
 * Tags create edges to memory nodes (cross-referencing).
 */
function buildMermaidGraph(entries: LedgerEntry[]): string {
  const lines: string[] = ["graph LR"];

  for (const entry of entries) {
    const safeSummary = entry.central_idea.replace(/"/g, "'").substring(0, 80);
    const prefix = entry.role === "user" ? "U" : "A";
    const nodeId = `T${entry.turn_number}`;

    lines.push(`    ${nodeId}["${prefix}: ${safeSummary}"]`);

    // Edge to next turn (sequential flow)
    if (entry.turn_number > 0) {
      const prevId = `T${entry.turn_number - 1}`;
      lines.push(`    ${prevId} --> ${nodeId}`);
    }
  }

  // Tag connections: if multiple turns share a tag, link them
  const tagMap = new Map<string, number[]>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag)!.push(entry.turn_number);
    }
  }

  for (const [tag, turns] of tagMap) {
    if (turns.length < 2) continue;
    // Link first and last mention of a tag (shows topic arc)
    const first = turns[0];
    const last = turns[turns.length - 1];
    if (first !== last) {
      const safeTag = tag.replace(/"/g, "'");
      lines.push(`    T${first} -.->|"${safeTag}"| T${last}`);
    }
  }

  // Styling
  const userTurns = entries.filter((e) => e.role === "user").map((e) => `T${e.turn_number}`);
  const aiTurns = entries.filter((e) => e.role === "assistant").map((e) => `T${e.turn_number}`);

  if (userTurns.length > 0) {
    lines.push(`    classDef user fill:#4C6EF5,color:#fff`);
    lines.push(`    class ${userTurns.join(",")} user`);
  }
  if (aiTurns.length > 0) {
    lines.push(`    classDef ai fill:#40C057,color:#fff`);
    lines.push(`    class ${aiTurns.join(",")} ai`);
  }

  return lines.join("\n");
}

// -----------------------------------------------------------
// Query ledger (AI can pull specific turns)
// -----------------------------------------------------------

/**
 * Query raw content of a specific turn range.
 * AI calls this when it needs to re-read something specific.
 */
export function queryTurns(
  userId: string,
  sessionId: string | null,
  fromTurn: number,
  toTurn: number
): LedgerEntry[] {
  const db = getDb();
  return (db.prepare(`
    SELECT * FROM context_ledger
    WHERE user_id = ? AND (session_id = ? OR (session_id IS NULL AND ? IS NULL))
      AND turn_number >= ? AND turn_number <= ?
    ORDER BY turn_number ASC
  `).all(userId, sessionId, sessionId, fromTurn, toTurn) as RawLedgerRow[]).map(deserialize);
}

/**
 * Query turns by tag — find all turns where a topic was discussed.
 */
export function queryByTag(
  userId: string,
  tag: string,
  sessionId?: string
): LedgerEntry[] {
  const db = getDb();
  const pattern = `%"${tag}"%`;

  if (sessionId) {
    return (db.prepare(`
      SELECT * FROM context_ledger
      WHERE user_id = ? AND session_id = ? AND tags LIKE ?
      ORDER BY turn_number ASC
    `).all(userId, sessionId, pattern) as RawLedgerRow[]).map(deserialize);
  }

  return (db.prepare(`
    SELECT * FROM context_ledger
    WHERE user_id = ? AND tags LIKE ?
    ORDER BY turn_number ASC
  `).all(userId, pattern) as RawLedgerRow[]).map(deserialize);
}

/**
 * Get summary stats for the current conversation.
 */
export function getConversationStats(
  userId: string,
  sessionId?: string
): { totalTurns: number; uniqueTags: number; topTags: { tag: string; count: number }[] } {
  const db = getDb();
  const sid = sessionId ?? null;

  const entries = db.prepare(`
    SELECT tags FROM context_ledger
    WHERE user_id = ? AND (session_id = ? OR (session_id IS NULL AND ? IS NULL))
  `).all(userId, sid, sid) as { tags: string }[];

  const tagCounts = new Map<string, number>();
  for (const row of entries) {
    const tags: string[] = JSON.parse(row.tags);
    for (const tag of tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const topTags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalTurns: entries.length,
    uniqueTags: tagCounts.size,
    topTags,
  };
}

// -----------------------------------------------------------
// Format for injection into AI system prompt
// -----------------------------------------------------------

/**
 * Build the full context block that gets injected into the AI's
 * system prompt before each call.
 */
export function buildSystemContextBlock(
  userId: string,
  sessionId?: string
): string {
  const { mermaidGraph, rawTurns, turnCount } = buildContext(userId, sessionId);

  if (turnCount === 0) {
    return "No prior conversation in this session.";
  }

  const lines: string[] = [
    `## Conversation Context (${turnCount} turns compressed)`,
    "",
    "### Conversation Graph",
    "```mermaid",
    mermaidGraph,
    "```",
    "",
    "### Recent Turns (raw)",
  ];

  for (const turn of rawTurns) {
    lines.push(turn);
    lines.push("");
  }

  lines.push(`> To recall earlier turns, use query_turns(from, to) or query_by_tag(tag).`);

  return lines.join("\n");
}

// --- Internal ---

interface RawLedgerRow {
  id: string;
  user_id: string;
  session_id: string | null;
  slot: number;
  turn_number: number;
  role: string;
  raw_content: string;
  mermaid_schema: string;
  central_idea: string;
  tags: string;
  created_at: number;
}

function deserialize(row: RawLedgerRow): LedgerEntry {
  return {
    ...row,
    role: row.role as "user" | "assistant",
    tags: JSON.parse(row.tags),
  };
}
