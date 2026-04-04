// ============================================================
// Autopilot — scaffolding that makes a small model act big
//
// Gemma 4 E2B is ~2B params. It has reasoning. But without
// scaffolding, it doesn't know what it knows. We fix that.
//
// Before every response, the AI runs a tag scan:
//   1. Extract concepts from the student's message
//   2. Match each concept against the memory tag index
//   3. For each match: pull context (tier, edges, last discussed)
//   4. For each miss: flag as UNKNOWN territory
//   5. Build a navigation preamble the AI sees before responding
//
// The AI's reasoning trace becomes:
//   "eigenvalues → KNOWN (tier 3, 47xp, connected to matrix-mult)
//    jordan-form → UNKNOWN (no tag, no memory, need to be careful)"
//
// This turns the model's reasoning into tag navigation.
// Known space = confident, contextual answers.
// Unknown space = cautious, asks questions, suggests research.
// ============================================================

import { getDb } from "@/lib/db/connection";
import type { MemoryNode, MemoryEdge, MemoryTier } from "@/lib/types/core";
import { contextWeight } from "./tier";

// -----------------------------------------------------------
// Tag extraction prompt
// -----------------------------------------------------------

/**
 * System prompt fragment that instructs the AI to extract
 * concepts and match them against tags on every turn.
 *
 * This gets prepended to the AI's thinking before it responds.
 */
export const TAG_SCAN_INSTRUCTION = `Before responding, you MUST perform a tag scan:

1. EXTRACT: List every concept, term, or topic the student mentioned.
2. MATCH: For each concept, check the TAG INDEX below.
   - If KNOWN: note the tier, XP, and connections. Use this context.
   - If UNKNOWN: flag it. Be cautious. Don't assume knowledge. Ask if unsure.
3. NAVIGATE: Your confidence level matches the tag tier:
   - Tier 5 (permanent): You know this deeply. Be definitive.
   - Tier 4 (core): Strong knowledge. Be confident.
   - Tier 3 (established): Good foundation. Build on it.
   - Tier 2 (familiar): Surface knowledge. Verify with the student.
   - Tier 1 (ephemeral): Barely known. Treat as near-unknown.
   - NO TAG: Unknown territory. Say so. Suggest research or ask questions.
4. After scanning, respond naturally. Don't show the scan to the student.
5. If you discuss something new, call create_memory_node to tag it.
   If you discuss something known, call bump_memory to strengthen it.

Your reasoning should ACTIVATE tags. Every concept you touch either
gets bumped (known) or created (unknown→known). The memory web
grows with every conversation.`;

// -----------------------------------------------------------
// Tag index builder
// -----------------------------------------------------------

export interface TagEntry {
  tag: string;
  label: string;
  tier: MemoryTier;
  xp: number;
  discipline: string | null;
  connections: { tag: string; relation: string }[];
  lastBumped: number;
  turnsMentioned: number[]; // from context ledger
}

/**
 * Build the tag index for injection into the AI's context.
 * This is the AI's "map" of known territory.
 *
 * Format:
 *   tag | tier | xp | discipline | connections | last seen
 */
export function buildTagIndex(userId: string): {
  index: string;
  entries: TagEntry[];
} {
  const db = getDb();

  // Get all global memory nodes
  const nodes = db.prepare(`
    SELECT mn.*, d.name as disc_name
    FROM memory_nodes mn
    LEFT JOIN disciplines d ON mn.discipline_id = d.id
    WHERE mn.user_id = ? AND mn.scope = 'global'
    ORDER BY mn.tier DESC, mn.xp DESC
  `).all(userId) as (MemoryNode & { disc_name: string | null })[];

  if (nodes.length === 0) {
    return { index: "No tags yet. Everything is unknown territory.", entries: [] };
  }

  // Get edges for connection mapping
  const nodeIds = nodes.map((n) => n.id);
  const placeholders = nodeIds.map(() => "?").join(",");
  const edges = db.prepare(`
    SELECT * FROM memory_edges
    WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})
  `).all(...nodeIds, ...nodeIds) as MemoryEdge[];

  // Get turn mentions from context ledger
  const turnMentions = new Map<string, number[]>();
  const ledgerRows = db.prepare(`
    SELECT tags, turn_number FROM context_ledger
    WHERE user_id = ?
  `).all(userId) as { tags: string; turn_number: number }[];

  for (const row of ledgerRows) {
    const tags: string[] = JSON.parse(row.tags);
    for (const tag of tags) {
      if (!turnMentions.has(tag)) turnMentions.set(tag, []);
      turnMentions.get(tag)!.push(row.turn_number);
    }
  }

  // Build node→tag lookup
  const nodeToTag = new Map(nodes.map((n) => [n.id, n.tag]));

  // Build entries
  const entries: TagEntry[] = nodes.map((node) => {
    const nodeEdges = edges.filter(
      (e) => e.source_id === node.id || e.target_id === node.id
    );
    const connections = nodeEdges.map((e) => {
      const otherId = e.source_id === node.id ? e.target_id : e.source_id;
      return {
        tag: nodeToTag.get(otherId) ?? "unknown",
        relation: e.relation,
      };
    });

    return {
      tag: node.tag,
      label: node.label,
      tier: node.tier as MemoryTier,
      xp: node.xp,
      discipline: node.disc_name,
      connections,
      lastBumped: node.last_bumped_at,
      turnsMentioned: turnMentions.get(node.tag) ?? [],
    };
  });

  // Build markdown table
  const lines: string[] = [
    "## TAG INDEX (your knowledge map)",
    "",
    "| tag | tier | xp | discipline | connections | last seen |",
    "|-----|------|----|-----------|-------------|-----------|",
  ];

  for (const entry of entries) {
    const connStr = entry.connections.length > 0
      ? entry.connections.slice(0, 3).map((c) => `${c.relation}→${c.tag}`).join(", ")
      : "-";
    const lastSeen = timeSince(entry.lastBumped);
    lines.push(
      `| ${entry.tag} | T${entry.tier} | ${Math.round(entry.xp)} | ${entry.discipline ?? "-"} | ${connStr} | ${lastSeen} |`
    );
  }

  return { index: lines.join("\n"), entries };
}

// -----------------------------------------------------------
// Navigation preamble (per-turn)
// -----------------------------------------------------------

/**
 * Given a student message, pre-scan for potential tag matches.
 * Returns a navigation hint the AI sees before its reasoning.
 *
 * This is a fast string-level prescan — not AI-powered.
 * The AI then refines with its own reasoning.
 */
export function prescanMessage(
  message: string,
  tagEntries: TagEntry[]
): { known: TagMatch[]; unknown: string[] } {
  const words = normalizeForScan(message);
  const known: TagMatch[] = [];
  const matchedWords = new Set<string>();

  // Match tags against message content
  for (const entry of tagEntries) {
    const tagWords = entry.tag.split("-");
    const labelWords = normalizeForScan(entry.label);

    // Check if tag words appear in message
    const tagMatch = tagWords.every((tw) =>
      words.some((w) => w.includes(tw) || tw.includes(w))
    );
    // Check if label words have significant overlap
    const labelOverlap = labelWords.filter((lw) =>
      words.some((w) => w.includes(lw) || lw.includes(w))
    ).length;
    const labelMatch = labelOverlap >= Math.min(2, labelWords.length);

    if (tagMatch || labelMatch) {
      known.push({
        tag: entry.tag,
        tier: entry.tier,
        xp: entry.xp,
        connections: entry.connections.slice(0, 3),
        confidence: entry.tier / 5,
      });
      tagWords.forEach((tw) => matchedWords.add(tw));
    }
  }

  // Find potentially unknown concepts (words not matched to any tag)
  const stopwords = new Set([
    "the", "is", "are", "was", "were", "a", "an", "and", "or", "but",
    "in", "on", "at", "to", "for", "of", "with", "by", "from", "it",
    "this", "that", "how", "what", "why", "when", "where", "who",
    "can", "do", "does", "did", "will", "would", "could", "should",
    "i", "me", "my", "you", "your", "we", "us", "they", "them",
    "about", "between", "through", "during", "before", "after",
    "not", "no", "yes", "if", "then", "else", "so", "just",
    "help", "explain", "tell", "show", "understand", "know",
    "think", "like", "also", "more", "very", "much",
  ]);

  const unknown = words.filter(
    (w) => w.length > 3 && !stopwords.has(w) && !matchedWords.has(w)
  );

  return { known, unknown: [...new Set(unknown)] };
}

export interface TagMatch {
  tag: string;
  tier: MemoryTier;
  xp: number;
  connections: { tag: string; relation: string }[];
  confidence: number; // tier/5
}

/**
 * Format the prescan result as a navigation preamble
 * injected before the AI's reasoning.
 */
export function formatNavigationPreamble(
  scan: { known: TagMatch[]; unknown: string[] }
): string {
  const lines: string[] = ["## NAVIGATION SCAN"];

  if (scan.known.length > 0) {
    lines.push("");
    lines.push("### KNOWN TERRITORY");
    for (const match of scan.known) {
      const connStr = match.connections.map((c) => `${c.relation}→${c.tag}`).join(", ");
      lines.push(`- **${match.tag}** [T${match.tier}, ${Math.round(match.xp)}xp] confidence:${match.confidence.toFixed(1)} → ${connStr || "no connections"}`);
    }
  }

  if (scan.unknown.length > 0) {
    lines.push("");
    lines.push("### UNKNOWN TERRITORY (be cautious)");
    lines.push(`- Unrecognized concepts: ${scan.unknown.join(", ")}`);
    lines.push("- → Don't assume knowledge. Ask the student or suggest research.");
    lines.push("- → If discussed, create a new memory tag.");
  }

  if (scan.known.length === 0 && scan.unknown.length === 0) {
    lines.push("");
    lines.push("No specific concepts detected. General conversation.");
  }

  return lines.join("\n");
}

// -----------------------------------------------------------
// Full system prompt builder
// -----------------------------------------------------------

/**
 * Build the complete system prompt for the AI.
 * This is the full scaffolding that makes a 2B model act like 70B.
 *
 * Components:
 *   1. Role + behavior instructions
 *   2. Tag scan instruction
 *   3. Tag index (the knowledge map)
 *   4. Conversation context (Mermaid graph + last 3 turns)
 *   5. Function registry (.md index)
 *   6. Navigation preamble (per-turn prescan)
 */
export function buildSystemPrompt(params: {
  userId: string;
  disciplineContext?: string;
  tagIndex: string;
  conversationContext: string;
  functionIndex: string;
  navigationPreamble: string;
}): string {
  return `You are the student's AI study assistant powered by Gemma 4.
You help them learn, organize study sessions, create exercises,
and manage their academic life. You are thoughtful, calibrated,
and honest about what you know vs don't know.

${TAG_SCAN_INSTRUCTION}

${params.tagIndex}

${params.navigationPreamble}

${params.conversationContext}

${params.functionIndex}

${params.disciplineContext ? `## Current Discipline Context\n${params.disciplineContext}` : ""}

Remember: bump known tags, create unknown ones. Your reasoning
IS the tag navigation. Every conversation grows the web.`;
}

// --- Utilities ---

function normalizeForScan(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function timeSince(epoch: number): string {
  const seconds = Math.floor(Date.now() / 1000) - epoch;
  const days = Math.floor(seconds / 86400);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
