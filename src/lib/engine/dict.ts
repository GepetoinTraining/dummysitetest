// ============================================================
// Dictionary Engine — reference layer for AI object construction
//
// The AI looks up entries here when building graph objects.
// "Build me a water molecule" →
//   lookup("chemistry", "oxygen")  → mass:16, charge:6, bonds:2, color:#FF0000
//   lookup("chemistry", "hydrogen") → mass:1, charge:1, bonds:1, color:#FFFFFF
//   AI constructs blob with correct properties + edge rules
//
// Three entry sources:
//   system — shipped with the app (periodic table, biology terms...)
//   user   — student adds custom entries
//   ai     — AI creates entries during study sessions
// ============================================================

import { getDb } from "@/lib/db/connection";
import { generateId } from "@/lib/utils/id";
import type {
  DictEntry,
  DictSource,
  NodeProperties,
  EdgeRule,
  SkinOverrides,
  GraphNode,
  GraphEdge,
} from "@/lib/types/core";

/**
 * Look up a term in a domain.
 * This is what the AI calls when it needs to build an object.
 */
export function lookup(domain: string, term: string): DictEntry | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM dict_entries WHERE domain = ? AND term = ?"
  ).get(domain, term) as RawDictRow | undefined;

  if (!row) return null;
  return deserializeEntry(row);
}

/**
 * Search for terms by prefix (autocomplete / AI fuzzy lookup).
 */
export function search(domain: string, prefix: string, limit: number = 10): DictEntry[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM dict_entries WHERE domain = ? AND term LIKE ? LIMIT ?"
  ).all(domain, `${prefix}%`, limit) as RawDictRow[];

  return rows.map(deserializeEntry);
}

/**
 * List all entries in a category within a domain.
 * e.g., listCategory("chemistry", "element") → all elements
 */
export function listCategory(domain: string, category: string): DictEntry[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM dict_entries WHERE domain = ? AND category = ? ORDER BY term"
  ).all(domain, category) as RawDictRow[];

  return rows.map(deserializeEntry);
}

/**
 * Add or update a dict entry.
 */
export function upsertEntry(entry: Omit<DictEntry, "id" | "created_at">): DictEntry {
  const db = getDb();
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO dict_entries (id, domain, term, category, properties, edge_rules, skin_overrides, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(domain, term)
    DO UPDATE SET category = ?, properties = ?, edge_rules = ?, skin_overrides = ?, source = ?
  `).run(
    id, entry.domain, entry.term, entry.category,
    JSON.stringify(entry.properties),
    JSON.stringify(entry.edge_rules),
    JSON.stringify(entry.skin_overrides),
    entry.source, now,
    entry.category,
    JSON.stringify(entry.properties),
    JSON.stringify(entry.edge_rules),
    JSON.stringify(entry.skin_overrides),
    entry.source
  );

  return { ...entry, id, created_at: now };
}

/**
 * Convert a dict entry into a GraphNode ready for a blob.
 * The AI calls this to materialize a term into the 3D workspace.
 */
export function entryToNode(
  entry: DictEntry,
  position?: [number, number, number]
): GraphNode {
  return {
    id: generateId(),
    label: entry.properties.label ?? entry.term,
    dict_term: entry.term,
    position: position ?? [0, 0, 0],
    velocity: [0, 0, 0],
    mass: entry.properties.mass,
    charge: entry.properties.charge,
    pinned: false,
    skin: entry.domain,
    data: { ...entry.properties, _domain: entry.domain, _category: entry.category },
  };
}

/**
 * Given two nodes with dict entries, determine valid edges between them.
 * Checks edge_rules of both entries for compatible connections.
 */
export function validEdges(
  entryA: DictEntry,
  entryB: DictEntry
): GraphEdge[] {
  const edges: GraphEdge[] = [];

  for (const rule of entryA.edge_rules) {
    if (rule.target_category === entryB.category) {
      edges.push({
        id: generateId(),
        source: "", // caller fills with actual node IDs
        target: "",
        label: rule.label_template,
        relation: rule.relation,
        stiffness: rule.stiffness,
        rest_length: rule.rest_length,
        data: {},
      });
    }
  }

  // Check reverse rules too
  for (const rule of entryB.edge_rules) {
    if (rule.target_category === entryA.category) {
      const exists = edges.some((e) => e.relation === rule.relation);
      if (!exists) {
        edges.push({
          id: generateId(),
          source: "",
          target: "",
          label: rule.label_template,
          relation: rule.relation,
          stiffness: rule.stiffness,
          rest_length: rule.rest_length,
          data: {},
        });
      }
    }
  }

  return edges;
}

/**
 * Check if adding an edge respects max_connections rule.
 */
export function canConnect(
  entry: DictEntry,
  targetCategory: string,
  currentConnectionCount: number
): boolean {
  const rule = entry.edge_rules.find((r) => r.target_category === targetCategory);
  if (!rule) return false;
  return currentConnectionCount < rule.max_connections;
}

// --- Internal ---

interface RawDictRow {
  id: string;
  domain: string;
  term: string;
  category: string;
  properties: string;
  edge_rules: string;
  skin_overrides: string;
  source: string;
  created_at: number;
}

function deserializeEntry(row: RawDictRow): DictEntry {
  return {
    id: row.id,
    domain: row.domain,
    term: row.term,
    category: row.category,
    properties: JSON.parse(row.properties) as NodeProperties,
    edge_rules: JSON.parse(row.edge_rules) as EdgeRule[],
    skin_overrides: JSON.parse(row.skin_overrides) as SkinOverrides,
    source: row.source as DictSource,
    created_at: row.created_at,
  };
}
