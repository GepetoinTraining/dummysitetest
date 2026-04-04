// ============================================================
// Autopilot — tags + grep + scratch pad
//
// The AI sees a flat tag list. That's it.
// It has a grep skill to search .md files, memory, ledger.
// It has a scratch pad to build its own context.
//
// The AI builds its own context window. Every turn, it decides
// what's relevant, greps for it, and adds to the pad.
// The pad is what it reads before responding.
//
// This is the killer feature: self-assembled context.
// ============================================================

import { getDb } from "@/lib/db/connection";
import type { MemoryTier } from "@/lib/types/core";

// -----------------------------------------------------------
// Tag list — just names and tiers, nothing more
// -----------------------------------------------------------

/**
 * Flat tag list for the system prompt.
 * Gemma sees this and decides what to grep.
 */
export function buildTagList(userId: string): string {
  const db = getDb();

  const tags = db.prepare(`
    SELECT tag, tier FROM memory_nodes
    WHERE user_id = ? AND scope = 'global'
    ORDER BY tier DESC, xp DESC
  `).all(userId) as { tag: string; tier: number }[];

  if (tags.length === 0) return "";

  // Group by tier for scannability
  const byTier = new Map<number, string[]>();
  for (const t of tags) {
    if (!byTier.has(t.tier)) byTier.set(t.tier, []);
    byTier.get(t.tier)!.push(t.tag);
  }

  const lines: string[] = ["## Tags"];
  for (const tier of [5, 4, 3, 2, 1]) {
    const tierTags = byTier.get(tier);
    if (!tierTags) continue;
    lines.push(`T${tier}: ${tierTags.join(", ")}`);
  }

  return lines.join("\n");
}

// -----------------------------------------------------------
// Scratch pad — the AI's self-built context
// -----------------------------------------------------------

const scratchPads = new Map<string, string[]>();

/**
 * Get the scratch pad key for a user + session.
 */
function padKey(userId: string, sessionId?: string): string {
  return `${userId}:${sessionId ?? "global"}`;
}

/**
 * Read the scratch pad. This is what the AI sees.
 */
export function readPad(userId: string, sessionId?: string): string {
  const pad = scratchPads.get(padKey(userId, sessionId));
  if (!pad || pad.length === 0) return "";
  return "## Pad\n" + pad.join("\n---\n");
}

/**
 * Write to the scratch pad. AI calls this to save
 * grep results, notes, whatever it wants in context.
 */
export function writeToPad(
  userId: string,
  content: string,
  sessionId?: string
): void {
  const key = padKey(userId, sessionId);
  if (!scratchPads.has(key)) scratchPads.set(key, []);
  scratchPads.get(key)!.push(content);
}

/**
 * Clear a specific entry or the whole pad.
 */
export function clearPad(
  userId: string,
  sessionId?: string,
  index?: number
): void {
  const key = padKey(userId, sessionId);
  if (index !== undefined) {
    const pad = scratchPads.get(key);
    if (pad) pad.splice(index, 1);
  } else {
    scratchPads.set(key, []);
  }
}

/**
 * Get pad size (so AI can manage its own context budget).
 */
export function padSize(userId: string, sessionId?: string): number {
  const pad = scratchPads.get(padKey(userId, sessionId));
  if (!pad) return 0;
  return pad.join("\n").length;
}

// -----------------------------------------------------------
// Grep — the AI's search skill
// -----------------------------------------------------------

export interface GrepResult {
  source: string;   // where it was found
  match: string;    // the matched content
}

/**
 * Grep across all knowledge sources.
 *
 * Sources searched:
 *   - Memory nodes (tags, labels)
 *   - Memory edges (relations, labels)
 *   - Context ledger (past turns)
 *   - Chat messages (raw history)
 *   - Notes (.md content via DB if indexed, else tag match)
 *   - Dict entries (terms, properties)
 *
 * Returns matches the AI can add to its scratch pad.
 */
export function grep(
  userId: string,
  query: string,
  sources?: ("memory" | "ledger" | "chat" | "dict")[],
  limit: number = 10
): GrepResult[] {
  const db = getDb();
  const results: GrepResult[] = [];
  const pattern = `%${query}%`;
  const searchSources = sources ?? ["memory", "ledger", "chat", "dict"];

  if (searchSources.includes("memory")) {
    // Search memory nodes
    const nodes = db.prepare(`
      SELECT tag, label, tier, xp, discipline_id FROM memory_nodes
      WHERE user_id = ? AND (tag LIKE ? OR label LIKE ?)
      ORDER BY tier DESC LIMIT ?
    `).all(userId, pattern, pattern, limit) as {
      tag: string; label: string; tier: number; xp: number; discipline_id: string | null;
    }[];

    for (const n of nodes) {
      results.push({
        source: `memory:${n.tag}`,
        match: `[T${n.tier} ${Math.round(n.xp)}xp] ${n.label}`,
      });
    }

    // Search edges for this node's connections
    if (nodes.length > 0) {
      for (const n of nodes.slice(0, 3)) {
        const edges = db.prepare(`
          SELECT me.relation, me.label, mn2.tag as other_tag, mn2.label as other_label
          FROM memory_edges me
          JOIN memory_nodes mn1 ON me.source_id = mn1.id
          JOIN memory_nodes mn2 ON me.target_id = mn2.id
          WHERE mn1.user_id = ? AND mn1.tag = ?
          UNION
          SELECT me.relation, me.label, mn1.tag as other_tag, mn1.label as other_label
          FROM memory_edges me
          JOIN memory_nodes mn1 ON me.source_id = mn1.id
          JOIN memory_nodes mn2 ON me.target_id = mn2.id
          WHERE mn2.user_id = ? AND mn2.tag = ?
        `).all(userId, n.tag, userId, n.tag) as {
          relation: string; label: string | null; other_tag: string; other_label: string;
        }[];

        for (const e of edges) {
          results.push({
            source: `edge:${n.tag}→${e.other_tag}`,
            match: `${e.relation}: ${e.label ?? e.other_label}`,
          });
        }
      }
    }
  }

  if (searchSources.includes("ledger")) {
    const turns = db.prepare(`
      SELECT turn_number, role, central_idea, mermaid_schema FROM context_ledger
      WHERE user_id = ? AND (central_idea LIKE ? OR raw_content LIKE ?)
      ORDER BY turn_number DESC LIMIT ?
    `).all(userId, pattern, pattern, limit) as {
      turn_number: number; role: string; central_idea: string; mermaid_schema: string;
    }[];

    for (const t of turns) {
      results.push({
        source: `turn:${t.turn_number}:${t.role}`,
        match: t.central_idea,
      });
    }
  }

  if (searchSources.includes("chat")) {
    const msgs = db.prepare(`
      SELECT role, content, created_at FROM chat_messages
      WHERE user_id = ? AND content LIKE ?
      ORDER BY created_at DESC LIMIT ?
    `).all(userId, pattern, limit) as {
      role: string; content: string; created_at: number;
    }[];

    for (const m of msgs) {
      // Return a snippet, not the full message
      const idx = m.content.toLowerCase().indexOf(query.toLowerCase());
      const start = Math.max(0, idx - 80);
      const end = Math.min(m.content.length, idx + query.length + 80);
      const snippet = (start > 0 ? "..." : "") +
        m.content.substring(start, end) +
        (end < m.content.length ? "..." : "");

      results.push({
        source: `chat:${m.role}`,
        match: snippet,
      });
    }
  }

  if (searchSources.includes("dict")) {
    const entries = db.prepare(`
      SELECT domain, term, category, properties FROM dict_entries
      WHERE term LIKE ? OR properties LIKE ?
      LIMIT ?
    `).all(pattern, pattern, limit) as {
      domain: string; term: string; category: string; properties: string;
    }[];

    for (const e of entries) {
      results.push({
        source: `dict:${e.domain}:${e.term}`,
        match: `[${e.category}] ${e.term}: ${e.properties.substring(0, 120)}`,
      });
    }
  }

  return results.slice(0, limit);
}

// -----------------------------------------------------------
// System prompt — tags + pad, that's it
// -----------------------------------------------------------

/**
 * Build the system prompt. Tags + pad.
 * Gemma greps and fills the pad itself.
 */
export function buildSystemPrompt(params: {
  userId: string;
  sessionId?: string;
  disciplineName?: string;
}): string {
  const parts: string[] = [
    "You are the student's study assistant.",
  ];

  if (params.disciplineName) {
    parts.push(`Current discipline: ${params.disciplineName}`);
  }

  const tags = buildTagList(params.userId);
  if (tags) {
    parts.push("");
    parts.push(tags);
  }

  const pad = readPad(params.userId, params.sessionId);
  if (pad) {
    parts.push("");
    parts.push(pad);
  }

  return parts.join("\n");
}
