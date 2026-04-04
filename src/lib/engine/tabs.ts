// ============================================================
// Discipline Tab Creation — structured action
//
// Student provides:
//   1. Discipline name (searchable dropdown)
//   2. Teacher name
//
// Everything else is derived:
//   - Tab color (auto-assigned from palette)
//   - Tab icon (mapped from discipline category)
//   - Goal (default 0.8, student adjusts later)
//   - Initial lattice dimension (added to their R^n)
//   - Scoped context (this tab's tags, pad, grep are ISOLATED)
//   - Teacher profile (created, personality filled over time by AI)
//
// Each tab IS a context scope. When the student is in a tab,
// the AI sees only that tab's tags + the generalist tags (T5).
// This prevents context overcrowding.
// ============================================================

import { getDb } from "@/lib/db/connection";
import { generateId } from "@/lib/utils/id";
import type { Discipline, Professor, Goal, DisciplineMetadata, ProfessorMetadata } from "@/lib/types/core";

// -----------------------------------------------------------
// Discipline categories + auto-mapping
// -----------------------------------------------------------

export interface DisciplineCategory {
  name: string;
  icon: string;
  defaultColor: string;
  domain: string; // maps to dict domain
}

export const DISCIPLINE_CATEGORIES: DisciplineCategory[] = [
  { name: "Mathematics", icon: "math", defaultColor: "#4C6EF5", domain: "math" },
  { name: "Physics", icon: "atom", defaultColor: "#FA5252", domain: "physics" },
  { name: "Chemistry", icon: "flask", defaultColor: "#40C057", domain: "chemistry" },
  { name: "Biology", icon: "dna", defaultColor: "#BE4BDB", domain: "biology" },
  { name: "Computer Science", icon: "code", defaultColor: "#FD7E14", domain: "cs" },
  { name: "Statistics", icon: "chart-bar", defaultColor: "#20C997", domain: "math" },
  { name: "History", icon: "book", defaultColor: "#868E96", domain: "history" },
  { name: "Geography", icon: "map", defaultColor: "#15AABF", domain: "geography" },
  { name: "Literature", icon: "writing", defaultColor: "#E64980", domain: "humanities" },
  { name: "Philosophy", icon: "brain", defaultColor: "#7950F2", domain: "humanities" },
  { name: "Economics", icon: "trending-up", defaultColor: "#82C91E", domain: "economics" },
  { name: "Law", icon: "gavel", defaultColor: "#495057", domain: "law" },
  { name: "Engineering", icon: "tool", defaultColor: "#F76707", domain: "engineering" },
  { name: "Medicine", icon: "stethoscope", defaultColor: "#E03131", domain: "biology" },
  { name: "Psychology", icon: "users", defaultColor: "#9C36B5", domain: "psychology" },
  { name: "Art", icon: "palette", defaultColor: "#F06595", domain: "art" },
  { name: "Music", icon: "music", defaultColor: "#845EF7", domain: "music" },
  { name: "Languages", icon: "language", defaultColor: "#339AF0", domain: "languages" },
];

// Color palette for auto-assignment (avoids duplicates)
const COLOR_PALETTE = [
  "#4C6EF5", "#FA5252", "#40C057", "#FD7E14", "#BE4BDB",
  "#20C997", "#E64980", "#7950F2", "#15AABF", "#82C91E",
  "#F76707", "#339AF0", "#845EF7", "#F06595", "#495057",
  "#E03131", "#1098AD", "#5C940D",
];

// -----------------------------------------------------------
// Tab creation
// -----------------------------------------------------------

export interface CreateTabInput {
  userId: string;
  disciplineName: string;       // from searchable dropdown
  teacherName: string;          // free text
  metadata?: DisciplineMetadata; // optional on creation, student fills over time
  professorMetadata?: ProfessorMetadata;
}

export interface CreateTabResult {
  discipline: Discipline;
  professor: Professor;
  goal: Goal;
  category: DisciplineCategory;
}

/**
 * Create a new discipline tab.
 *
 * Student provides discipline name + teacher name.
 * Everything else is derived:
 *   - Category matched from DISCIPLINE_CATEGORIES
 *   - Color auto-assigned (next unused from palette)
 *   - Icon from category
 *   - Goal defaults to 0.8
 *   - Professor created with name, personality starts blank
 *     (AI fills it from interactions over time)
 *   - Scoped context initialized (empty tags, empty pad)
 */
export function createTab(input: CreateTabInput): CreateTabResult {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  // Match category
  const category = matchCategory(input.disciplineName);

  // Auto-assign color (avoid collisions with existing tabs)
  const existingColors = db.prepare(
    "SELECT color FROM disciplines WHERE user_id = ?"
  ).all(input.userId) as { color: string }[];

  const usedColors = new Set(existingColors.map((c) => c.color));
  const color = COLOR_PALETTE.find((c) => !usedColors.has(c)) ?? COLOR_PALETTE[0];

  // Create discipline with metadata blob
  const discId = generateId();
  const discMetadata = input.metadata ?? {};
  db.prepare(`
    INSERT INTO disciplines (id, user_id, name, color, icon, category, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(discId, input.userId, input.disciplineName, color, category.icon, category.domain, JSON.stringify(discMetadata), now);

  const discipline: Discipline = {
    id: discId,
    user_id: input.userId,
    name: input.disciplineName,
    color,
    icon: category.icon,
    category: category.domain,
    metadata: discMetadata,
    created_at: now,
  };

  // Create professor with metadata blob
  const profId = generateId();
  const profMetadata = input.professorMetadata ?? {};
  db.prepare(`
    INSERT INTO professors (id, discipline_id, name, email, metadata, notes)
    VALUES (?, ?, ?, NULL, ?, NULL)
  `).run(profId, discId, input.teacherName, JSON.stringify(profMetadata));

  const professor: Professor = {
    id: profId,
    discipline_id: discId,
    name: input.teacherName,
    email: null,
    metadata: profMetadata,
    notes: null,
  };

  // Create default goal
  const goalId = generateId();
  db.prepare(`
    INSERT INTO goals (id, discipline_id, target_grade, set_at)
    VALUES (?, ?, 0.8, ?)
  `).run(goalId, discId, now);

  const goal: Goal = {
    id: goalId,
    discipline_id: discId,
    target_grade: 0.8,
    set_at: now,
  };

  return { discipline, professor, goal, category };
}

/**
 * Match a discipline name to a category.
 * Fuzzy match — "Linear Algebra" → Mathematics,
 * "Organic Chemistry" → Chemistry, etc.
 */
function matchCategory(name: string): DisciplineCategory {
  const lower = name.toLowerCase();

  // Direct keyword matches
  const keywords: [string[], DisciplineCategory][] = DISCIPLINE_CATEGORIES.map((cat) => {
    const keys = generateKeywords(cat.name);
    return [keys, cat];
  });

  for (const [keys, cat] of keywords) {
    if (keys.some((k) => lower.includes(k))) {
      return cat;
    }
  }

  // Default to generic
  return { name: "General", icon: "book-2", defaultColor: "#868E96", domain: "general" };
}

function generateKeywords(categoryName: string): string[] {
  const map: Record<string, string[]> = {
    "Mathematics": ["math", "algebra", "calculus", "geometry", "topology", "number theory", "discrete", "trigonometry"],
    "Physics": ["physics", "mechanics", "thermodynamics", "electromagnetism", "quantum", "optics", "relativity"],
    "Chemistry": ["chemistry", "organic", "inorganic", "biochem", "analytical chem", "physical chem"],
    "Biology": ["biology", "genetics", "ecology", "microbiology", "anatomy", "physiology", "zoology", "botany", "cell"],
    "Computer Science": ["computer", "programming", "algorithm", "data structure", "software", "machine learning", "artificial intelligence", "database", "network", "operating system", "compiler"],
    "Statistics": ["statistics", "probability", "stochastic", "bayesian", "regression", "data analysis"],
    "History": ["history", "civilization", "ancient", "medieval", "modern history", "world war"],
    "Geography": ["geography", "cartography", "geopolitics", "climate", "geological"],
    "Literature": ["literature", "writing", "poetry", "novel", "literary", "rhetoric", "composition"],
    "Philosophy": ["philosophy", "ethics", "logic", "metaphysics", "epistemology", "existential"],
    "Economics": ["economics", "macroeconomics", "microeconomics", "finance", "accounting", "econometrics"],
    "Law": ["law", "legal", "constitutional", "criminal law", "civil law", "jurisprudence"],
    "Engineering": ["engineering", "mechanical eng", "electrical eng", "civil eng", "structural"],
    "Medicine": ["medicine", "medical", "pathology", "pharmacology", "clinical", "surgery", "nursing"],
    "Psychology": ["psychology", "cognitive", "behavioral", "neuropsychology", "developmental psych", "social psych"],
    "Art": ["art", "painting", "sculpture", "design", "visual art", "art history", "drawing"],
    "Music": ["music", "composition", "harmony", "counterpoint", "music theory", "instrument"],
    "Languages": ["language", "linguistics", "grammar", "translation", "english", "spanish", "french", "german", "chinese", "japanese", "portuguese", "italian"],
  };

  return map[categoryName] ?? [categoryName.toLowerCase()];
}

// -----------------------------------------------------------
// Metadata updates — student can always add more context
// -----------------------------------------------------------

/**
 * Update discipline metadata. Merges with existing.
 * Student can add syllabus, exam dates, notes, anything.
 */
export function updateDisciplineMetadata(
  disciplineId: string,
  updates: Partial<DisciplineMetadata>
): void {
  const db = getDb();
  const row = db.prepare(
    "SELECT metadata FROM disciplines WHERE id = ?"
  ).get(disciplineId) as { metadata: string } | undefined;

  const existing = row ? JSON.parse(row.metadata) : {};
  const merged = { ...existing, ...updates };

  db.prepare(
    "UPDATE disciplines SET metadata = ? WHERE id = ?"
  ).run(JSON.stringify(merged), disciplineId);
}

/**
 * Update professor metadata. Merges with existing.
 * AI can call this too — fills in personality, style from interactions.
 */
export function updateProfessorMetadata(
  professorId: string,
  updates: Partial<ProfessorMetadata>
): void {
  const db = getDb();
  const row = db.prepare(
    "SELECT metadata FROM professors WHERE id = ?"
  ).get(professorId) as { metadata: string } | undefined;

  const existing = row ? JSON.parse(row.metadata) : {};
  const merged = { ...existing, ...updates };

  db.prepare(
    "UPDATE professors SET metadata = ? WHERE id = ?"
  ).run(JSON.stringify(merged), professorId);
}

// -----------------------------------------------------------
// Scoped context — each tab is its own world
// -----------------------------------------------------------

/**
 * Build context for a specific tab.
 *
 * When student is in a tab, the AI sees:
 *   - This tab's tags only
 *   - T5 (permanent) tags from ALL tabs (cross-pollination)
 *   - This tab's scratch pad
 *   - Teacher profile
 *
 * This prevents overcrowding. Linear Algebra context
 * doesn't bleed into History context.
 */
export function buildTabContext(userId: string, disciplineId: string): string {
  const db = getDb();

  // Get discipline info + metadata
  const disc = db.prepare(
    "SELECT name, metadata FROM disciplines WHERE id = ?"
  ).get(disciplineId) as { name: string; metadata: string } | undefined;

  if (!disc) return "";

  const discMeta: DisciplineMetadata = JSON.parse(disc.metadata || "{}");

  // Get this tab's tags
  const tabTags = db.prepare(`
    SELECT tag, tier FROM memory_nodes
    WHERE user_id = ? AND discipline_id = ? AND scope = 'global'
    ORDER BY tier DESC, xp DESC
  `).all(userId, disciplineId) as { tag: string; tier: number }[];

  // Get T5 permanent tags from OTHER tabs (cross-pollination)
  const permanentTags = db.prepare(`
    SELECT mn.tag, mn.tier, d.name as disc_name FROM memory_nodes mn
    JOIN disciplines d ON mn.discipline_id = d.id
    WHERE mn.user_id = ? AND mn.discipline_id != ? AND mn.tier = 5 AND mn.scope = 'global'
    ORDER BY mn.xp DESC
  `).all(userId, disciplineId) as { tag: string; tier: number; disc_name: string }[];

  // Get teacher + metadata
  const prof = db.prepare(
    "SELECT name, metadata, notes FROM professors WHERE discipline_id = ?"
  ).get(disciplineId) as { name: string; metadata: string; notes: string | null } | undefined;

  const profMeta: ProfessorMetadata = prof ? JSON.parse(prof.metadata || "{}") : {};

  // Get current goal + latest grade
  const goal = db.prepare(
    "SELECT target_grade FROM goals WHERE discipline_id = ? ORDER BY set_at DESC LIMIT 1"
  ).get(disciplineId) as { target_grade: number } | undefined;

  const grade = db.prepare(
    "SELECT value FROM grades WHERE discipline_id = ? ORDER BY recorded_at DESC LIMIT 1"
  ).get(disciplineId) as { value: number } | undefined;

  // Build context
  const parts: string[] = [
    `Discipline: ${disc.name}`,
  ];

  if (prof) {
    parts.push(`Teacher: ${prof.name}`);
    // Include all professor metadata the student/AI has filled
    for (const [key, val] of Object.entries(profMeta)) {
      if (val) parts.push(`  ${key}: ${val}`);
    }
  }

  if (goal || grade) {
    const g = grade?.value ?? 0;
    const t = goal?.target_grade ?? 0.8;
    parts.push(`Grade: ${(g * 100).toFixed(0)}% → Goal: ${(t * 100).toFixed(0)}%`);
  }

  // Include all discipline metadata
  const metaEntries = Object.entries(discMeta).filter(([_, v]) => v != null && v !== "");
  if (metaEntries.length > 0) {
    parts.push("");
    parts.push("## Context");
    for (const [key, val] of metaEntries) {
      if (Array.isArray(val)) {
        parts.push(`${key}: ${val.join(", ")}`);
      } else {
        parts.push(`${key}: ${val}`);
      }
    }
  }

  // Tab tags
  if (tabTags.length > 0) {
    const byTier = new Map<number, string[]>();
    for (const t of tabTags) {
      if (!byTier.has(t.tier)) byTier.set(t.tier, []);
      byTier.get(t.tier)!.push(t.tag);
    }

    parts.push("");
    parts.push("## Tags");
    for (const tier of [5, 4, 3, 2, 1]) {
      const tags = byTier.get(tier);
      if (tags) parts.push(`T${tier}: ${tags.join(", ")}`);
    }
  }

  // Permanent tags from other disciplines (bridges)
  if (permanentTags.length > 0) {
    parts.push("");
    parts.push("## Permanent from other disciplines");
    parts.push(permanentTags.map((t) => `${t.tag} (${t.disc_name})`).join(", "));
  }

  return parts.join("\n");
}

/**
 * Build the generalist context (no tab selected).
 *
 * Shows T4+ tags across all disciplines.
 * The overview. The bird's eye view.
 */
export function buildGeneralistContext(userId: string): string {
  const db = getDb();

  const tags = db.prepare(`
    SELECT mn.tag, mn.tier, d.name as disc_name FROM memory_nodes mn
    LEFT JOIN disciplines d ON mn.discipline_id = d.id
    WHERE mn.user_id = ? AND mn.tier >= 4 AND mn.scope = 'global'
    ORDER BY mn.tier DESC, mn.xp DESC
  `).all(userId) as { tag: string; tier: number; disc_name: string | null }[];

  if (tags.length === 0) return "";

  const byDisc = new Map<string, { tag: string; tier: number }[]>();
  for (const t of tags) {
    const disc = t.disc_name ?? "General";
    if (!byDisc.has(disc)) byDisc.set(disc, []);
    byDisc.get(disc)!.push({ tag: t.tag, tier: t.tier });
  }

  const parts: string[] = ["## Overview (T4+ across all disciplines)"];
  for (const [disc, discTags] of byDisc) {
    parts.push(`**${disc}**: ${discTags.map((t) => `${t.tag}(T${t.tier})`).join(", ")}`);
  }

  return parts.join("\n");
}

// -----------------------------------------------------------
// List tabs for a user
// -----------------------------------------------------------

export interface TabSummary {
  id: string;
  name: string;
  color: string;
  icon: string;
  teacherName: string;
  tagCount: number;
  currentGrade: number | null;
  targetGrade: number | null;
}

export function listTabs(userId: string): TabSummary[] {
  const db = getDb();

  const discs = db.prepare(
    "SELECT * FROM disciplines WHERE user_id = ? ORDER BY created_at"
  ).all(userId) as Discipline[];

  return discs.map((d) => {
    const prof = db.prepare(
      "SELECT name FROM professors WHERE discipline_id = ? LIMIT 1"
    ).get(d.id) as { name: string } | undefined;

    const tagCount = db.prepare(
      "SELECT COUNT(*) as c FROM memory_nodes WHERE user_id = ? AND discipline_id = ? AND scope = 'global'"
    ).get(userId, d.id) as { c: number };

    const grade = db.prepare(
      "SELECT value FROM grades WHERE discipline_id = ? ORDER BY recorded_at DESC LIMIT 1"
    ).get(d.id) as { value: number } | undefined;

    const goal = db.prepare(
      "SELECT target_grade FROM goals WHERE discipline_id = ? ORDER BY set_at DESC LIMIT 1"
    ).get(d.id) as { target_grade: number } | undefined;

    return {
      id: d.id,
      name: d.name,
      color: d.color,
      icon: d.icon,
      teacherName: prof?.name ?? "",
      tagCount: tagCount.c,
      currentGrade: grade?.value ?? null,
      targetGrade: goal?.target_grade ?? null,
    };
  });
}
