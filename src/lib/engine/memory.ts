import { getDb } from "@/lib/db/connection";
import { generateId } from "@/lib/utils/id";
import { computeTier, tierBoundaryBelow } from "./tier";
import type { MemoryNode, MemoryEdge, MemoryEdgeRelation, MemoryScope } from "@/lib/types/core";
import { XP_PERMANENT } from "@/lib/types/core";

// -----------------------------------------------------------
// Memory Node Operations
// -----------------------------------------------------------

/**
 * Create a new memory node from a chat extraction.
 * Central idea becomes the node, supporting ideas become edges.
 */
export function createMemoryNode(params: {
  userId: string;
  scope: MemoryScope;
  contactId?: string;
  disciplineId?: string;
  tag: string;
  label: string;
}): MemoryNode {
  const db = getDb();
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO memory_nodes (id, user_id, scope, contact_id, discipline_id, tag, label, xp, tier, created_at, last_bumped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).run(id, params.userId, params.scope, params.contactId ?? null, params.disciplineId ?? null, params.tag, params.label, now, now);

  return {
    id,
    user_id: params.userId,
    scope: params.scope,
    contact_id: params.contactId ?? null,
    discipline_id: params.disciplineId ?? null,
    tag: params.tag,
    label: params.label,
    xp: 1,
    tier: 1,
    created_at: now,
    last_bumped_at: now,
  };
}

/**
 * Bump XP on tag match. Recalculate tier.
 * x_c(t+1) = x_c(t) + Δx
 */
export function bumpNode(nodeId: string, deltaXp: number = 3): MemoryNode | null {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const node = db.prepare("SELECT * FROM memory_nodes WHERE id = ?").get(nodeId) as MemoryNode | undefined;
  if (!node) return null;

  const newXp = node.xp + deltaXp;
  const newTier = computeTier(newXp);

  db.prepare(`
    UPDATE memory_nodes SET xp = ?, tier = ?, last_bumped_at = ? WHERE id = ?
  `).run(newXp, newTier, now, nodeId);

  return { ...node, xp: newXp, tier: newTier, last_bumped_at: now };
}

/**
 * Find existing node by tag for bump-or-create logic.
 * sim(c, c') > ε_m → merge (we use exact tag match here, semantic match is via Gemma)
 */
export function findNodeByTag(userId: string, tag: string): MemoryNode | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM memory_nodes WHERE user_id = ? AND tag = ? ORDER BY xp DESC LIMIT 1"
  ).get(userId, tag) as MemoryNode | undefined;
  return row ?? null;
}

/**
 * Apply decay to all non-permanent nodes for a user.
 * x_c(t+1) = x_c(t) - β · Δt_idle
 * Nodes that drop to xp ≤ 0 are pruned (archived).
 */
export function applyDecay(userId: string, beta: number = 0.5): {
  decayed: number;
  pruned: number;
  demoted: number;
} {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const nodes = db.prepare(`
    SELECT * FROM memory_nodes
    WHERE user_id = ? AND tier < 5
  `).all(userId) as MemoryNode[];

  let decayed = 0;
  let pruned = 0;
  let demoted = 0;

  const updateStmt = db.prepare(
    "UPDATE memory_nodes SET xp = ?, tier = ? WHERE id = ?"
  );
  const deleteStmt = db.prepare(
    "DELETE FROM memory_nodes WHERE id = ?"
  );

  const transaction = db.transaction(() => {
    for (const node of nodes) {
      const idleDays = (now - node.last_bumped_at) / 86400;
      if (idleDays < 1) continue;

      const decay = beta * idleDays;
      const newXp = Math.max(0, node.xp - decay);
      const newTier = computeTier(newXp);

      if (newXp <= 0) {
        deleteStmt.run(node.id);
        pruned++;
      } else {
        if (newTier < node.tier) demoted++;
        updateStmt.run(newXp, newTier, node.id);
        decayed++;
      }
    }
  });

  transaction();
  return { decayed, pruned, demoted };
}

// -----------------------------------------------------------
// Memory Edge Operations
// -----------------------------------------------------------

/**
 * Create an edge between two memory nodes.
 * Represents supporting idea → central idea relationship.
 */
export function createMemoryEdge(params: {
  sourceId: string;
  targetId: string;
  relation: MemoryEdgeRelation;
  weight?: number;
  label?: string;
}): MemoryEdge {
  const db = getDb();
  const id = generateId();

  db.prepare(`
    INSERT OR IGNORE INTO memory_edges (id, source_id, target_id, relation, weight, label)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, params.sourceId, params.targetId, params.relation, params.weight ?? 0.5, params.label ?? null);

  return {
    id,
    source_id: params.sourceId,
    target_id: params.targetId,
    relation: params.relation,
    weight: params.weight ?? 0.5,
    label: params.label ?? null,
  };
}

/**
 * Get the full memory graph for a user (or scoped to a contact).
 */
export function getMemoryGraph(
  userId: string,
  scope?: { type: "contact"; contactId: string } | { type: "global" }
): { nodes: MemoryNode[]; edges: MemoryEdge[] } {
  const db = getDb();

  let nodes: MemoryNode[];
  if (scope?.type === "contact") {
    nodes = db.prepare(
      "SELECT * FROM memory_nodes WHERE user_id = ? AND scope = 'contact' AND contact_id = ?"
    ).all(userId, scope.contactId) as MemoryNode[];
  } else if (scope?.type === "global") {
    nodes = db.prepare(
      "SELECT * FROM memory_nodes WHERE user_id = ? AND scope = 'global'"
    ).all(userId) as MemoryNode[];
  } else {
    nodes = db.prepare(
      "SELECT * FROM memory_nodes WHERE user_id = ?"
    ).all(userId) as MemoryNode[];
  }

  if (nodes.length === 0) return { nodes, edges: [] };

  const nodeIds = nodes.map((n) => n.id);
  const placeholders = nodeIds.map(() => "?").join(",");

  const edges = db.prepare(`
    SELECT * FROM memory_edges
    WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})
  `).all(...nodeIds, ...nodeIds) as MemoryEdge[];

  return { nodes, edges };
}

/**
 * Get nodes for a specific discipline (for lattice computation).
 */
export function getNodesForDiscipline(userId: string, disciplineId: string): MemoryNode[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM memory_nodes WHERE user_id = ? AND discipline_id = ? AND scope = 'global'"
  ).all(userId, disciplineId) as MemoryNode[];
}

/**
 * Get nodes at demotion risk (for daily slip detection).
 * Projects XP forward by lookahead days and finds tier 2-4 nodes that would demote.
 */
export function getSlippingNodes(userId: string, beta: number, lookaheadDays: number): MemoryNode[] {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const nodes = db.prepare(`
    SELECT * FROM memory_nodes
    WHERE user_id = ? AND tier >= 2 AND tier < 5
  `).all(userId) as MemoryNode[];

  return nodes.filter((node) => {
    const currentIdle = (now - node.last_bumped_at) / 86400;
    const projectedIdle = currentIdle + lookaheadDays;
    const projectedXp = Math.max(0, node.xp - beta * projectedIdle);
    return computeTier(node.xp) > computeTier(projectedXp);
  });
}
