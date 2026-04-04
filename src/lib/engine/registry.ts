// ============================================================
// Function Call Registry
//
// Every function the AI can invoke is registered here.
// The AI queries the index to find what tool to use, then
// issues a Gemma function call.
//
// The registry generates a single .MD index file that gets
// injected into the AI's context. Format per entry:
//
//   skill name | location | usage | last used | AI comment
//
// Usage count + last_used auto-update on every call.
// The AI can also write its own comments about when to use
// a function — these persist and improve over time.
// ============================================================

import { getDb } from "@/lib/db/connection";
import { generateId } from "@/lib/utils/id";
import type { FunctionDef } from "@/lib/ai/provider";

export interface RegistryEntry {
  id: string;
  name: string;
  category: string;
  location: string;
  description: string;
  params_schema: Record<string, unknown>;
  returns: string;
  usage_count: number;
  last_used_at: number | null;
  ai_comment: string;
  enabled: boolean;
}

// -----------------------------------------------------------
// Registration
// -----------------------------------------------------------

/**
 * Register a function in the registry.
 * Called at app init to populate from code.
 */
export function register(entry: Omit<RegistryEntry, "id" | "usage_count" | "last_used_at" | "enabled">): void {
  const db = getDb();
  const id = generateId();

  db.prepare(`
    INSERT INTO function_registry (id, name, category, location, description, params_schema, returns, ai_comment)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      category = ?, location = ?, description = ?, params_schema = ?, returns = ?
  `).run(
    id, entry.name, entry.category, entry.location, entry.description,
    JSON.stringify(entry.params_schema), entry.returns, entry.ai_comment,
    entry.category, entry.location, entry.description,
    JSON.stringify(entry.params_schema), entry.returns
  );
}

/**
 * Register all built-in functions.
 * Called once at startup.
 */
export function registerAll(): void {
  for (const entry of BUILTIN_FUNCTIONS) {
    register(entry);
  }
}

// -----------------------------------------------------------
// Query
// -----------------------------------------------------------

/**
 * Query the registry by category.
 */
export function queryByCategory(category: string): RegistryEntry[] {
  const db = getDb();
  return (db.prepare(
    "SELECT * FROM function_registry WHERE category = ? AND enabled = 1 ORDER BY usage_count DESC"
  ).all(category) as RawRow[]).map(deserialize);
}

/**
 * Query by name (exact or prefix).
 */
export function queryByName(name: string): RegistryEntry | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM function_registry WHERE name = ? AND enabled = 1"
  ).get(name) as RawRow | undefined;
  return row ? deserialize(row) : null;
}

/**
 * Full text search across name + description + ai_comment.
 */
export function search(query: string): RegistryEntry[] {
  const db = getDb();
  const pattern = `%${query}%`;
  return (db.prepare(`
    SELECT * FROM function_registry
    WHERE enabled = 1 AND (name LIKE ? OR description LIKE ? OR ai_comment LIKE ?)
    ORDER BY usage_count DESC
  `).all(pattern, pattern, pattern) as RawRow[]).map(deserialize);
}

/**
 * Get all enabled entries.
 */
export function getAll(): RegistryEntry[] {
  const db = getDb();
  return (db.prepare(
    "SELECT * FROM function_registry WHERE enabled = 1 ORDER BY category, name"
  ).all() as RawRow[]).map(deserialize);
}

// -----------------------------------------------------------
// Usage Tracking
// -----------------------------------------------------------

/**
 * Record that a function was called.
 * Increments usage_count, updates last_used_at.
 */
export function recordUsage(name: string): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    UPDATE function_registry
    SET usage_count = usage_count + 1, last_used_at = ?
    WHERE name = ?
  `).run(now, name);
}

/**
 * AI writes a comment about a function.
 * Persists across sessions — the AI learns when to use each tool.
 */
export function setAiComment(name: string, comment: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE function_registry SET ai_comment = ? WHERE name = ?"
  ).run(comment, name);
}

// -----------------------------------------------------------
// .MD Index Generation
// -----------------------------------------------------------

/**
 * Generate the single .MD index file.
 * This is what gets injected into the AI's context window.
 *
 * Format:
 * | skill name | location | usage | last used | AI comment |
 */
export function generateIndex(): string {
  const entries = getAll();

  const lines: string[] = [
    "# StudySync Function Registry",
    "",
    "Available functions the AI can call via Gemma function calling.",
    "",
    "| skill name | location | usage | last used | AI comment |",
    "|------------|----------|-------|-----------|------------|",
  ];

  for (const entry of entries) {
    const lastUsed = entry.last_used_at
      ? new Date(entry.last_used_at * 1000).toISOString().split("T")[0]
      : "never";

    lines.push(
      `| ${entry.name} | ${entry.location} | ${entry.usage_count} | ${lastUsed} | ${entry.ai_comment || "-"} |`
    );
  }

  // Add detailed sections per category
  const categories = [...new Set(entries.map((e) => e.category))];

  for (const cat of categories) {
    const catEntries = entries.filter((e) => e.category === cat);
    lines.push("");
    lines.push(`## ${cat}`);
    lines.push("");

    for (const entry of catEntries) {
      lines.push(`### ${entry.name}`);
      lines.push(`> ${entry.description}`);
      lines.push(`> Returns: ${entry.returns || "void"}`);
      lines.push("```json");
      lines.push(JSON.stringify(entry.params_schema, null, 2));
      lines.push("```");
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Convert registry entries to Gemma function definitions.
 * These are what get passed to the AI provider's `functions` option.
 */
export function toFunctionDefs(entries?: RegistryEntry[]): FunctionDef[] {
  const all = entries ?? getAll();
  return all.map((entry) => ({
    name: entry.name,
    description: entry.description,
    parameters: entry.params_schema,
  }));
}

/**
 * Convert registry entries for a specific category to function defs.
 */
export function categoryToFunctionDefs(category: string): FunctionDef[] {
  return toFunctionDefs(queryByCategory(category));
}

// -----------------------------------------------------------
// Built-in function definitions
// -----------------------------------------------------------

const BUILTIN_FUNCTIONS: Omit<RegistryEntry, "id" | "usage_count" | "last_used_at" | "enabled">[] = [
  // --- Memory ---
  {
    name: "create_memory_node",
    category: "memory",
    location: "src/lib/engine/memory.ts",
    description: "Extract a central idea from chat and create a new memory node with tag",
    params_schema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "Unique tag for this concept (kebab-case)" },
        label: { type: "string", description: "Human-readable description of the central idea" },
        discipline_id: { type: "string", description: "Which discipline this belongs to" },
        scope: { type: "string", enum: ["global", "contact"], description: "Memory scope" },
        contact_id: { type: "string", description: "Contact ID if scope is contact" },
      },
      required: ["tag", "label", "scope"],
    },
    returns: "MemoryNode",
    ai_comment: "Use when extracting a new concept from conversation. Always check if tag exists first with find_memory_by_tag.",
  },
  {
    name: "find_memory_by_tag",
    category: "memory",
    location: "src/lib/engine/memory.ts",
    description: "Find existing memory node by tag for bump-or-create decisions",
    params_schema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "Tag to search for" },
      },
      required: ["tag"],
    },
    returns: "MemoryNode | null",
    ai_comment: "Always call before create_memory_node to avoid duplicates. If found, use bump_memory instead.",
  },
  {
    name: "bump_memory",
    category: "memory",
    location: "src/lib/engine/memory.ts",
    description: "Bump XP on an existing memory node when its tag appears in chat",
    params_schema: {
      type: "object",
      properties: {
        node_id: { type: "string", description: "Memory node ID" },
        delta_xp: { type: "number", description: "XP to add (default 3)" },
      },
      required: ["node_id"],
    },
    returns: "MemoryNode",
    ai_comment: "Call whenever a topic the student already knows reappears. This is how knowledge gets promoted through tiers.",
  },
  {
    name: "create_memory_edge",
    category: "memory",
    location: "src/lib/engine/memory.ts",
    description: "Create a relationship edge between two memory nodes",
    params_schema: {
      type: "object",
      properties: {
        source_id: { type: "string", description: "Source node ID" },
        target_id: { type: "string", description: "Target node ID" },
        relation: { type: "string", enum: ["supports", "clarifies", "method", "contradicts", "prerequisite", "applies_to"] },
        weight: { type: "number", description: "Edge weight [0,1]" },
        label: { type: "string", description: "Edge annotation" },
      },
      required: ["source_id", "target_id", "relation"],
    },
    returns: "MemoryEdge",
    ai_comment: "Use to connect supporting ideas to central ideas. Build the scaffolding around each concept.",
  },
  {
    name: "get_memory_graph",
    category: "memory",
    location: "src/lib/engine/memory.ts",
    description: "Get full memory graph for a user (or scoped to a contact)",
    params_schema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["global", "contact"] },
        contact_id: { type: "string", description: "Required if scope is contact" },
      },
    },
    returns: "{ nodes: MemoryNode[], edges: MemoryEdge[] }",
    ai_comment: "Use to review what the student knows before generating exercises or answering questions.",
  },

  // --- Session ---
  {
    name: "start_session",
    category: "session",
    location: "src/lib/engine/session.ts",
    description: "Start a clocked study session for a discipline",
    params_schema: {
      type: "object",
      properties: {
        discipline_id: { type: "string" },
        skill_file: { type: "string", description: "Optional .md workflow to use" },
      },
      required: ["discipline_id"],
    },
    returns: "StudySession",
    ai_comment: "Clock starts. Notifications get filtered. Only one active session at a time.",
  },
  {
    name: "end_session",
    category: "session",
    location: "src/lib/engine/session.ts",
    description: "End session with dual assessment. Combined score: (1.5·self + 0.75·ai) / 2.25",
    params_schema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        self_assessment: { type: "number", description: "Student self-assessment [0,1]" },
        ai_assessment: { type: "number", description: "AI assessment [0,1]" },
      },
      required: ["session_id", "self_assessment", "ai_assessment"],
    },
    returns: "StudySession",
    ai_comment: "Triggers lattice update. Bump relevant memory tags. Be honest in ai_assessment but weight is only 0.75.",
  },

  // --- Workspace ---
  {
    name: "generate_exercise",
    category: "workspace",
    location: "src/lib/engine/skills.ts",
    description: "Generate an exercise calibrated to the student's lattice position for a discipline",
    params_schema: {
      type: "object",
      properties: {
        discipline_id: { type: "string" },
        difficulty_override: { type: "number", description: "Override auto-calibrated difficulty [0,1]" },
      },
      required: ["discipline_id"],
    },
    returns: "{ question: string, skill_used: string, difficulty: number }",
    ai_comment: "Difficulty is auto-calibrated from lattice. Only override if student explicitly asks for harder/easier.",
  },
  {
    name: "search_and_create_sources",
    category: "workspace",
    location: "src/lib/engine/skills.ts",
    description: "Search for study materials on a topic and create structured .md source files",
    params_schema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        discipline_id: { type: "string" },
        depth: { type: "string", enum: ["overview", "detailed", "deep_dive"] },
      },
      required: ["topic"],
    },
    returns: "{ files_created: string[], summary: string }",
    ai_comment: "Uses external API if available for deeper research. Creates .md files in the discipline's notes folder.",
  },

  // --- Graph ---
  {
    name: "create_graph_blob",
    category: "graph",
    location: "src/lib/engine/simulation.ts",
    description: "Create a new 3D workspace with physics configuration",
    params_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        discipline_id: { type: "string" },
        skin: { type: "string", description: "Visual preset: chemistry, biology, physics, history, default" },
      },
      required: ["name"],
    },
    returns: "GraphBlob",
    ai_comment: "Initializes empty workspace with discipline-appropriate physics preset.",
  },
  {
    name: "add_node_from_dict",
    category: "graph",
    location: "src/lib/engine/dict.ts",
    description: "Look up a term in the dictionary and add it as a 3D node to a workspace",
    params_schema: {
      type: "object",
      properties: {
        blob_id: { type: "string" },
        domain: { type: "string" },
        term: { type: "string" },
        position: { type: "array", items: { type: "number" }, description: "[x, y, z]" },
      },
      required: ["blob_id", "domain", "term"],
    },
    returns: "GraphNode",
    ai_comment: "Always use dict lookup. If term not in dict, create a dict entry first with register_dict_term.",
  },
  {
    name: "register_dict_term",
    category: "dict",
    location: "src/lib/engine/dict.ts",
    description: "Register a new term in the dictionary for future use in graph construction",
    params_schema: {
      type: "object",
      properties: {
        domain: { type: "string" },
        term: { type: "string" },
        category: { type: "string" },
        properties: { type: "object", description: "NodeProperties: mass, charge, label, + domain-specific" },
        edge_rules: { type: "array", description: "EdgeRule[] — what this can connect to" },
        skin_overrides: { type: "object", description: "SkinOverrides: color, shape, scale" },
      },
      required: ["domain", "term", "category", "properties"],
    },
    returns: "DictEntry",
    ai_comment: "Use when the student mentions a concept that isn't in the dict. Source will be 'ai'.",
  },
  {
    name: "add_simulation_rule",
    category: "graph",
    location: "src/lib/engine/simulation.ts",
    description: "Add a physics force rule (constant or variable) to a simulation",
    params_schema: {
      type: "object",
      properties: {
        blob_id: { type: "string" },
        force_type: { type: "string", enum: ["gravity", "friction", "air_resistance", "spring", "coulomb", "drag", "buoyancy", "magnetic", "centripetal", "applied", "custom"] },
        params: { type: "object", description: "Force-specific parameters" },
      },
      required: ["blob_id", "force_type"],
    },
    returns: "ForceRule",
    ai_comment: "Student says 'add friction' → use this. Each rule changes the ΔN visible to the student.",
  },

  // --- Planner ---
  {
    name: "create_plan",
    category: "planner",
    location: "src/lib/engine/planner.ts",
    description: "Create a study plan with auto-allocated hours based on gap vector",
    params_schema: {
      type: "object",
      properties: {
        granularity: { type: "string", enum: ["monthly", "weekly", "daily"] },
        total_hours: { type: "number", description: "Total available study hours" },
        period_start: { type: "number", description: "Epoch timestamp" },
        period_end: { type: "number", description: "Epoch timestamp" },
      },
      required: ["granularity", "total_hours", "period_start", "period_end"],
    },
    returns: "{ plan: Plan, allocations: PlanAllocation[] }",
    ai_comment: "Hours auto-distribute proportional to gap magnitude. Let student override if they ask.",
  },
  {
    name: "schedule_task",
    category: "planner",
    location: "src/lib/engine/planner.ts",
    description: "Schedule a specific study task within a daily plan",
    params_schema: {
      type: "object",
      properties: {
        discipline_id: { type: "string" },
        start_time: { type: "number" },
        end_time: { type: "number" },
        skill_file: { type: "string" },
        description: { type: "string" },
      },
      required: ["discipline_id", "start_time", "end_time"],
    },
    returns: "void",
    ai_comment: "Use when student asks to schedule something specific or AI proposes a session slot.",
  },

  // --- Notification ---
  {
    name: "evaluate_notification",
    category: "notification",
    location: "src/lib/engine/notifications.ts",
    description: "Evaluate whether to push, queue, block, or AI-handle a notification",
    params_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        action: { type: "string", enum: ["schedule_session", "share_notes", "ask_question", "skill_exchange", "study_invite"] },
        content: { type: "string" },
        urgency: { type: "number", description: "[0,1]" },
      },
      required: ["contact_id", "action", "content", "urgency"],
    },
    returns: "NotificationDelivery",
    ai_comment: "Check contact policy first. During active session, only push if urgency > threshold.",
  },

  // --- Assessment ---
  {
    name: "assess_student",
    category: "assessment",
    location: "src/lib/engine/session.ts",
    description: "AI assesses the student's performance during a session based on chat quality",
    params_schema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        chat_quality: { type: "number", description: "Depth and accuracy of responses [0,1]" },
        exercise_scores: { type: "array", items: { type: "number" }, description: "Scores from exercises [0,1]" },
        engagement: { type: "number", description: "How actively the student engaged [0,1]" },
      },
      required: ["session_id"],
    },
    returns: "number",
    ai_comment: "Weighted avg: 0.4*chat_quality + 0.4*exercises + 0.2*engagement. Be calibrated, not generous.",
  },

  // --- Lattice ---
  {
    name: "get_lattice",
    category: "lattice",
    location: "src/lib/engine/lattice.ts",
    description: "Compute the student's current position in the n-dimensional discipline space",
    params_schema: {
      type: "object",
      properties: {},
    },
    returns: "LatticePosition",
    ai_comment: "Call before generating exercises to calibrate difficulty. Shows gap vector across all disciplines.",
  },
  {
    name: "get_connections",
    category: "lattice",
    location: "src/lib/engine/similarity.ts",
    description: "Get cross-discipline connections from the latest nightly evaluation",
    params_schema: {
      type: "object",
      properties: {
        epsilon: { type: "number", description: "Minimum similarity threshold (default 0.15)" },
      },
    },
    returns: "SimilarityScore[]",
    ai_comment: "Use to suggest bridges: 'Your strength in X can help with Y'. Read from persisted scores, never compute live.",
  },

  // --- Context ---
  {
    name: "query_turns",
    category: "context",
    location: "src/lib/engine/context.ts",
    description: "Retrieve raw content of specific conversation turns by number range",
    params_schema: {
      type: "object",
      properties: {
        from_turn: { type: "number", description: "Start turn number (inclusive)" },
        to_turn: { type: "number", description: "End turn number (inclusive)" },
      },
      required: ["from_turn", "to_turn"],
    },
    returns: "LedgerEntry[]",
    ai_comment: "Use when you need to re-read something specific from earlier. The Mermaid graph shows you what happened, this gives you the raw text.",
  },
  {
    name: "query_by_tag",
    category: "context",
    location: "src/lib/engine/context.ts",
    description: "Find all conversation turns where a specific topic/tag was discussed",
    params_schema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "Memory tag to search for" },
      },
      required: ["tag"],
    },
    returns: "LedgerEntry[]",
    ai_comment: "Use when student references something discussed earlier. Find the turns where that topic came up.",
  },
  {
    name: "get_conversation_stats",
    category: "context",
    location: "src/lib/engine/context.ts",
    description: "Get summary stats: total turns, unique tags, most discussed topics",
    params_schema: {
      type: "object",
      properties: {},
    },
    returns: "{ totalTurns, uniqueTags, topTags[] }",
    ai_comment: "Quick overview of what the conversation has covered.",
  },

  // --- Tab Metadata ---
  {
    name: "update_discipline_context",
    category: "tab",
    location: "src/lib/engine/tabs.ts",
    description: "Add or update context metadata for a discipline tab (syllabus, schedule, resources, anything)",
    params_schema: {
      type: "object",
      properties: {
        discipline_id: { type: "string" },
        updates: { type: "object", description: "Key-value pairs to merge into metadata. Open schema — any field accepted." },
      },
      required: ["discipline_id", "updates"],
    },
    returns: "void",
    ai_comment: "",
  },
  {
    name: "update_teacher_profile",
    category: "tab",
    location: "src/lib/engine/tabs.ts",
    description: "Update teacher metadata (personality, teaching style, grading tendency, anything observed)",
    params_schema: {
      type: "object",
      properties: {
        professor_id: { type: "string" },
        updates: { type: "object", description: "Key-value pairs to merge. Open schema." },
      },
      required: ["professor_id", "updates"],
    },
    returns: "void",
    ai_comment: "",
  },

  // --- UI Primitives ---
  {
    name: "create_ui_element",
    category: "ui",
    location: "src/lib/engine/primitives.ts",
    description: "Create a new UI element in the workspace. Component can be any Mantine primitive or Canvas3D for 3D.",
    params_schema: {
      type: "object",
      properties: {
        parent_id: { type: "string", description: "Parent element ID" },
        component: { type: "string", description: "Mantine component: Stack, Group, Paper, Text, Badge, Button, TextInput, Progress, Tabs, Canvas3D" },
        props: { type: "object", description: "Component props" },
        style: { type: "object", description: "CSS overrides" },
        data_source: { type: "string", description: "API endpoint or SQL query for dynamic data" },
        scope: { type: "string", description: "global or discipline_id" },
      },
      required: ["component"],
    },
    returns: "string (element id)",
    ai_comment: "",
  },
  {
    name: "update_ui_element",
    category: "ui",
    location: "src/lib/engine/primitives.ts",
    description: "Update an existing UI element's props, style, or visibility",
    params_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        props: { type: "object" },
        style: { type: "object" },
        visible: { type: "boolean" },
      },
      required: ["id"],
    },
    returns: "void",
    ai_comment: "",
  },
  {
    name: "delete_ui_element",
    category: "ui",
    location: "src/lib/engine/primitives.ts",
    description: "Remove a UI element and all its children",
    params_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    },
    returns: "void",
    ai_comment: "",
  },

  // --- Grep + Scratch Pad ---
  {
    name: "grep",
    category: "context",
    location: "src/lib/engine/autopilot.ts",
    description: "Search across memory, ledger, chat history, and dictionary. Returns matching snippets.",
    params_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term" },
        sources: {
          type: "array",
          items: { type: "string", enum: ["memory", "ledger", "chat", "dict"] },
          description: "Which sources to search (default: all)",
        },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
    returns: "GrepResult[]",
    ai_comment: "",
  },
  {
    name: "pad_write",
    category: "context",
    location: "src/lib/engine/autopilot.ts",
    description: "Write content to the scratch pad. This persists in your context for the session.",
    params_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Content to add to the pad" },
      },
      required: ["content"],
    },
    returns: "void",
    ai_comment: "",
  },
  {
    name: "pad_read",
    category: "context",
    location: "src/lib/engine/autopilot.ts",
    description: "Read the current scratch pad contents.",
    params_schema: {
      type: "object",
      properties: {},
    },
    returns: "string",
    ai_comment: "",
  },
  {
    name: "pad_clear",
    category: "context",
    location: "src/lib/engine/autopilot.ts",
    description: "Clear the scratch pad or a specific entry by index.",
    params_schema: {
      type: "object",
      properties: {
        index: { type: "number", description: "Specific entry to remove (omit to clear all)" },
      },
    },
    returns: "void",
    ai_comment: "",
  },
  {
    name: "pad_size",
    category: "context",
    location: "src/lib/engine/autopilot.ts",
    description: "Get the current scratch pad size in characters.",
    params_schema: {
      type: "object",
      properties: {},
    },
    returns: "number",
    ai_comment: "",
  },

  // --- Daily Push ---
  {
    name: "get_slipping_knowledge",
    category: "daily_push",
    location: "src/lib/engine/daily-push.ts",
    description: "Get memory nodes at demotion risk for daily mini-challenges",
    params_schema: {
      type: "object",
      properties: {
        max_challenges: { type: "number", description: "Max challenges to return (default 5)" },
      },
    },
    returns: "DailyChallenge[]",
    ai_comment: "Call during morning push. Generates challenges for tier 2-4 nodes about to demote.",
  },
];

// --- Internal ---

interface RawRow {
  id: string;
  name: string;
  category: string;
  location: string;
  description: string;
  params_schema: string;
  returns: string;
  usage_count: number;
  last_used_at: number | null;
  ai_comment: string;
  enabled: number;
}

function deserialize(row: RawRow): RegistryEntry {
  return {
    ...row,
    params_schema: JSON.parse(row.params_schema),
    enabled: !!row.enabled,
  };
}
