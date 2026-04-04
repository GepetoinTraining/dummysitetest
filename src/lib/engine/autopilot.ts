// ============================================================
// Autopilot — the map, not the driver
//
// We don't inject navigation preambles. We don't force tag scans.
// We don't pre-chew reasoning. We give Gemma:
//
//   1. The tag index (the map of known territory)
//   2. The function registry (the tools)
//   3. The context ledger (compressed conversation)
//
// And we let it drive.
//
// Small models self-regulate when given freedom + structure.
// They know their limits. They'll pull from the map when they
// need it. They'll call tools when they need them. They'll
// use <|channel>thought to reason however they want.
//
// The scaffolding is AVAILABLE, not IMPOSED.
// Maximum freedom + maximum infrastructure = optimal output.
// ============================================================

import { getDb } from "@/lib/db/connection";
import type { MemoryNode, MemoryEdge, MemoryTier } from "@/lib/types/core";

// -----------------------------------------------------------
// Tag index — the map
// -----------------------------------------------------------

export interface TagEntry {
  tag: string;
  label: string;
  tier: MemoryTier;
  xp: number;
  discipline: string | null;
  connections: { tag: string; relation: string }[];
  lastBumped: number;
}

/**
 * Build the tag index. This is the map Gemma can read.
 * It's in the system prompt. Gemma decides when to use it.
 */
export function buildTagIndex(userId: string): string {
  const db = getDb();

  const nodes = db.prepare(`
    SELECT mn.*, d.name as disc_name
    FROM memory_nodes mn
    LEFT JOIN disciplines d ON mn.discipline_id = d.id
    WHERE mn.user_id = ? AND mn.scope = 'global'
    ORDER BY mn.tier DESC, mn.xp DESC
  `).all(userId) as (MemoryNode & { disc_name: string | null })[];

  if (nodes.length === 0) return "";

  const nodeIds = nodes.map((n) => n.id);
  const placeholders = nodeIds.map(() => "?").join(",");
  const edges = db.prepare(`
    SELECT * FROM memory_edges
    WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})
  `).all(...nodeIds, ...nodeIds) as MemoryEdge[];

  const nodeToTag = new Map(nodes.map((n) => [n.id, n.tag]));

  const lines: string[] = [
    "## Tags",
    "| tag | T | xp | disc | connections |",
    "|-----|---|----|------|-------------|",
  ];

  for (const node of nodes) {
    const nodeEdges = edges.filter(
      (e) => e.source_id === node.id || e.target_id === node.id
    );
    const conns = nodeEdges
      .slice(0, 3)
      .map((e) => {
        const otherId = e.source_id === node.id ? e.target_id : e.source_id;
        return `${e.relation}→${nodeToTag.get(otherId) ?? "?"}`;
      })
      .join(", ") || "-";

    lines.push(
      `| ${node.tag} | ${node.tier} | ${Math.round(node.xp)} | ${node.disc_name ?? "-"} | ${conns} |`
    );
  }

  return lines.join("\n");
}

// -----------------------------------------------------------
// System prompt — minimal, structural, free
// -----------------------------------------------------------

/**
 * Build the system prompt. Minimal. No behavioral directives
 * about HOW to think. Just the infrastructure.
 */
export function buildSystemPrompt(params: {
  tagIndex: string;
  conversationContext: string;
  functionIndex: string;
  disciplineName?: string;
}): string {
  const parts: string[] = [
    "You are the student's study assistant.",
  ];

  if (params.disciplineName) {
    parts.push(`Current discipline: ${params.disciplineName}`);
  }

  parts.push("");

  if (params.tagIndex) {
    parts.push(params.tagIndex);
    parts.push("");
  }

  if (params.conversationContext) {
    parts.push(params.conversationContext);
    parts.push("");
  }

  if (params.functionIndex) {
    parts.push(params.functionIndex);
  }

  return parts.join("\n");
}
