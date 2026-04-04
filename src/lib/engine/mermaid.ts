import type { MemoryNode, MemoryEdge, MemoryTier } from "@/lib/types/core";

/**
 * Convert a memory graph (nodes + edges) into a Mermaid diagram string.
 * This is how we render the knowledge web in the UI.
 *
 * Tier determines node styling:
 *   1 = dotted (ephemeral)
 *   2 = thin border (familiar)
 *   3 = normal (established)
 *   4 = bold border (core)
 *   5 = filled (permanent)
 */
export function memoryGraphToMermaid(
  nodes: MemoryNode[],
  edges: MemoryEdge[]
): string {
  if (nodes.length === 0) return "graph TD\n    empty[No memories yet]";

  const lines: string[] = ["graph TD"];

  // Define nodes with tier-based styling
  for (const node of nodes) {
    const safeLabel = node.label.replace(/"/g, "'");
    const tierLabel = `T${node.tier}`;
    lines.push(`    ${node.id}["${safeLabel} (${tierLabel}, xp:${Math.round(node.xp)})"]`);
  }

  // Define edges
  for (const edge of edges) {
    const safeLabel = edge.label ? edge.label.replace(/"/g, "'") : edge.relation;
    lines.push(`    ${edge.source_id} -->|"${safeLabel}"| ${edge.target_id}`);
  }

  // Tier-based styling classes
  lines.push("");
  lines.push("    %% Tier styling");

  const tierClasses: Record<MemoryTier, string[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
  };

  for (const node of nodes) {
    tierClasses[node.tier as MemoryTier].push(node.id);
  }

  if (tierClasses[1].length > 0)
    lines.push(`    classDef tier1 stroke-dasharray: 5 5,opacity:0.5`);
  if (tierClasses[2].length > 0)
    lines.push(`    classDef tier2 stroke-width:1px`);
  if (tierClasses[3].length > 0)
    lines.push(`    classDef tier3 stroke-width:2px`);
  if (tierClasses[4].length > 0)
    lines.push(`    classDef tier4 stroke-width:3px,stroke:#4C6EF5`);
  if (tierClasses[5].length > 0)
    lines.push(`    classDef tier5 fill:#4C6EF5,stroke:#364FC7,color:#fff,stroke-width:3px`);

  for (const [tier, nodeIds] of Object.entries(tierClasses)) {
    if (nodeIds.length > 0) {
      lines.push(`    class ${nodeIds.join(",")} tier${tier}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate a JSON event for live Mermaid updates in the UI.
 * Emitted when memory is modified during a chat/session.
 */
export interface MemoryUpdateEvent {
  type: "memory_update";
  action: "add_node" | "bump_node" | "add_edge" | "prune_node" | "demote_node";
  node?: {
    id: string;
    label: string;
    tier: MemoryTier;
    xp: number;
  };
  edge?: {
    from: string;
    to: string;
    relation: string;
    weight: number;
  };
  scope: "global" | "contact";
  contactId?: string;
}

export function createNodeEvent(
  node: MemoryNode,
  action: "add_node" | "bump_node" | "prune_node" | "demote_node"
): MemoryUpdateEvent {
  return {
    type: "memory_update",
    action,
    node: {
      id: node.id,
      label: node.label,
      tier: node.tier as MemoryTier,
      xp: node.xp,
    },
    scope: node.scope,
    contactId: node.contact_id ?? undefined,
  };
}

export function createEdgeEvent(edge: MemoryEdge): MemoryUpdateEvent {
  return {
    type: "memory_update",
    action: "add_edge",
    edge: {
      from: edge.source_id,
      to: edge.target_id,
      relation: edge.relation,
      weight: edge.weight,
    },
    scope: "global",
  };
}
