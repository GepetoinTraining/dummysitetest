// ============================================================
// UI Primitives Engine
//
// The workspace is rows in a table. This engine:
//   1. Seeds the base dashboard (light/dark)
//   2. Provides CRUD for primitives
//   3. Resolves the primitive tree for rendering
//   4. The AI has a skill to manipulate primitives
//
// Mantine components mapped: Stack, Group, Paper, Tabs, Text,
// Badge, Button, TextInput, Progress, ActionIcon, Canvas3D
//
// Canvas3D is the escape hatch — when it renders, it loads
// Three.js and hands off to R3F.
// ============================================================

import { getDb } from "@/lib/db/connection";
import { generateId } from "@/lib/utils/id";

export interface UIPrimitive {
  id: string;
  user_id: string;
  parent_id: string | null;
  component: string;
  slot: string;
  sort_order: number;
  props: Record<string, unknown>;
  style: Record<string, unknown>;
  data_source: string | null;
  on_action: Record<string, unknown> | null;
  visible: boolean;
  scope: string;
  created_by: string;
  children?: UIPrimitive[];  // resolved at render time
}

export interface UIView {
  id: string;
  user_id: string;
  name: string;
  root_primitive_id: string;
  is_active: boolean;
  theme: string;
}

// -----------------------------------------------------------
// CRUD
// -----------------------------------------------------------

export function createPrimitive(params: {
  userId: string;
  parentId?: string;
  component: string;
  slot?: string;
  sortOrder?: number;
  props?: Record<string, unknown>;
  style?: Record<string, unknown>;
  dataSource?: string;
  onAction?: Record<string, unknown>;
  scope?: string;
  createdBy?: string;
}): string {
  const db = getDb();
  const id = generateId();

  db.prepare(`
    INSERT INTO ui_primitives (id, user_id, parent_id, component, slot, sort_order, props, style, data_source, on_action, visible, scope, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id, params.userId, params.parentId ?? null, params.component,
    params.slot ?? "children", params.sortOrder ?? 0,
    JSON.stringify(params.props ?? {}), JSON.stringify(params.style ?? {}),
    params.dataSource ?? null, params.onAction ? JSON.stringify(params.onAction) : null,
    params.scope ?? "global", params.createdBy ?? "system"
  );

  return id;
}

export function updatePrimitive(id: string, updates: Partial<{
  props: Record<string, unknown>;
  style: Record<string, unknown>;
  visible: boolean;
  sort_order: number;
  data_source: string;
  on_action: Record<string, unknown>;
}>): void {
  const db = getDb();

  if (updates.props !== undefined)
    db.prepare("UPDATE ui_primitives SET props = ? WHERE id = ?").run(JSON.stringify(updates.props), id);
  if (updates.style !== undefined)
    db.prepare("UPDATE ui_primitives SET style = ? WHERE id = ?").run(JSON.stringify(updates.style), id);
  if (updates.visible !== undefined)
    db.prepare("UPDATE ui_primitives SET visible = ? WHERE id = ?").run(updates.visible ? 1 : 0, id);
  if (updates.sort_order !== undefined)
    db.prepare("UPDATE ui_primitives SET sort_order = ? WHERE id = ?").run(updates.sort_order, id);
  if (updates.data_source !== undefined)
    db.prepare("UPDATE ui_primitives SET data_source = ? WHERE id = ?").run(updates.data_source, id);
  if (updates.on_action !== undefined)
    db.prepare("UPDATE ui_primitives SET on_action = ? WHERE id = ?").run(JSON.stringify(updates.on_action), id);
}

export function deletePrimitive(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM ui_primitives WHERE id = ?").run(id);
}

// -----------------------------------------------------------
// Tree resolution — turns flat rows into nested tree
// -----------------------------------------------------------

export function resolveTree(userId: string, scope: string): UIPrimitive[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT * FROM ui_primitives
    WHERE user_id = ? AND (scope = ? OR scope = 'global') AND visible = 1
    ORDER BY sort_order
  `).all(userId, scope) as RawPrimitiveRow[];

  const all = rows.map(deserialize);
  const byParent = new Map<string | null, UIPrimitive[]>();

  for (const p of all) {
    const key = p.parent_id;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(p);
  }

  function buildChildren(parentId: string | null): UIPrimitive[] {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      child.children = buildChildren(child.id);
    }
    return children;
  }

  return buildChildren(null);
}

/**
 * Resolve a specific view by name.
 */
export function resolveView(userId: string, viewName: string): {
  view: UIView;
  tree: UIPrimitive;
} | null {
  const db = getDb();

  const view = db.prepare(
    "SELECT * FROM ui_views WHERE user_id = ? AND name = ?"
  ).get(userId, viewName) as RawViewRow | undefined;

  if (!view) return null;

  const root = db.prepare(
    "SELECT * FROM ui_primitives WHERE id = ?"
  ).get(view.root_primitive_id) as RawPrimitiveRow | undefined;

  if (!root) return null;

  const rootPrim = deserialize(root);
  const scope = rootPrim.scope;

  // Get all descendants
  const allRows = db.prepare(`
    SELECT * FROM ui_primitives
    WHERE user_id = ? AND (scope = ? OR scope = 'global') AND visible = 1
    ORDER BY sort_order
  `).all(userId, scope) as RawPrimitiveRow[];

  const all = allRows.map(deserialize);
  const byParent = new Map<string | null, UIPrimitive[]>();

  for (const p of all) {
    if (!byParent.has(p.parent_id)) byParent.set(p.parent_id, []);
    byParent.get(p.parent_id)!.push(p);
  }

  function attach(node: UIPrimitive): UIPrimitive {
    node.children = (byParent.get(node.id) ?? []).map(attach);
    return node;
  }

  return {
    view: {
      id: view.id,
      user_id: view.user_id,
      name: view.name,
      root_primitive_id: view.root_primitive_id,
      is_active: !!view.is_active,
      theme: view.theme,
    },
    tree: attach(rootPrim),
  };
}

// -----------------------------------------------------------
// Seed base dashboard
// -----------------------------------------------------------

/**
 * Reset and re-seed the dashboard. Clears existing primitives.
 */
export function resetDashboard(userId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM ui_views WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM ui_primitives WHERE user_id = ?").run(userId);
  seedDashboard(userId);
}

/**
 * Seed the default dashboard for a new user.
 * Full topology — every element that needs to render is a row.
 * The worker and DB hydrate this into a live app.
 */
export function seedDashboard(userId: string): void {
  const db = getDb();

  // Check if already seeded
  const existing = db.prepare(
    "SELECT 1 FROM ui_views WHERE user_id = ? AND name = 'dashboard'"
  ).get(userId);
  if (existing) return;

  // Root: AppShell
  const root = createPrimitive({
    userId,
    component: "AppShell",
    props: { padding: "md", headerHeight: 55, navWidth: 260 },
  });

  // ── HEADER ──────────────────────────────────────────────

  // Left side: logo + badge
  const headerLeft = createPrimitive({
    userId,
    parentId: root,
    component: "Group",
    slot: "header",
    props: { gap: "sm" },
    sortOrder: 0,
  });

  createPrimitive({
    userId,
    parentId: headerLeft,
    component: "Text",
    props: { children: "StudySync", fw: 700, size: "lg" },
    sortOrder: 0,
  });

  createPrimitive({
    userId,
    parentId: headerLeft,
    component: "Badge",
    props: { children: "Gemma 4 E2B", variant: "light", size: "sm" },
    sortOrder: 1,
  });

  // Right side: action icons
  const headerRight = createPrimitive({
    userId,
    parentId: root,
    component: "Group",
    slot: "header",
    props: { gap: "xs" },
    sortOrder: 1,
  });

  createPrimitive({
    userId,
    parentId: headerRight,
    component: "ActionIcon",
    props: { variant: "subtle", size: "lg", icon: "bell" },
    onAction: { type: "navigate", view: "notifications" },
    sortOrder: 0,
  });

  createPrimitive({
    userId,
    parentId: headerRight,
    component: "ActionIcon",
    props: { variant: "subtle", size: "lg", icon: "calendar" },
    onAction: { type: "navigate", view: "planner" },
    sortOrder: 1,
  });

  createPrimitive({
    userId,
    parentId: headerRight,
    component: "ActionIcon",
    props: { variant: "subtle", size: "lg", icon: "network" },
    onAction: { type: "navigate", view: "memory_web" },
    sortOrder: 2,
  });

  // ── NAVBAR ──────────────────────────────────────────────

  // Disciplines section header + add button
  const navHeader = createPrimitive({
    userId,
    parentId: root,
    component: "Group",
    slot: "navbar",
    props: { justify: "space-between" },
    sortOrder: 0,
  });

  createPrimitive({
    userId,
    parentId: navHeader,
    component: "Text",
    props: { children: "DISCIPLINES", size: "xs", fw: 600, c: "dimmed" },
    sortOrder: 0,
  });

  createPrimitive({
    userId,
    parentId: navHeader,
    component: "ActionIcon",
    props: { variant: "subtle", size: "sm", icon: "plus" },
    onAction: { type: "modal", modal: "create_tab" },
    sortOrder: 1,
  });

  // Discipline tabs (populated dynamically from disciplines table)
  const navTabs = createPrimitive({
    userId,
    parentId: root,
    component: "Tabs",
    slot: "navbar",
    props: { orientation: "vertical", variant: "pills", defaultValue: "welcome" },
    dataSource: "/api/tabs?user_id=" + userId,
    sortOrder: 1,
  });

  createPrimitive({
    userId,
    parentId: navTabs,
    component: "TabItem",
    props: { value: "welcome", label: "Get Started" },
    sortOrder: 0,
  });

  // Divider
  createPrimitive({
    userId,
    parentId: root,
    component: "Divider",
    slot: "navbar",
    props: { my: "sm" },
    sortOrder: 2,
  });

  // AI Assistant link
  const navAI = createPrimitive({
    userId,
    parentId: root,
    component: "Group",
    slot: "navbar",
    props: { gap: "xs", style: { cursor: "pointer" } },
    onAction: { type: "navigate", view: "chat" },
    sortOrder: 3,
  });

  createPrimitive({
    userId,
    parentId: navAI,
    component: "ActionIcon",
    props: { variant: "subtle", size: "sm", icon: "chat" },
    sortOrder: 0,
  });

  createPrimitive({
    userId,
    parentId: navAI,
    component: "Text",
    props: { children: "AI Assistant", size: "sm" },
    sortOrder: 1,
  });

  // ── MAIN CONTENT ────────────────────────────────────────

  const main = createPrimitive({
    userId,
    parentId: root,
    component: "Stack",
    slot: "main",
    props: { gap: "lg", align: "center", justify: "center", mih: 400 },
    sortOrder: 0,
  });

  createPrimitive({
    userId,
    parentId: main,
    component: "Text",
    props: { children: "Welcome to StudySync", size: "xl", fw: 700 },
    sortOrder: 0,
  });

  createPrimitive({
    userId,
    parentId: main,
    component: "Text",
    props: {
      children: "Add your first discipline tab to begin. Your AI assistant will help you build a study plan, track your progress, and connect ideas across subjects.",
      c: "dimmed", maw: 500, ta: "center",
    },
    sortOrder: 1,
  });

  createPrimitive({
    userId,
    parentId: main,
    component: "Button",
    props: { children: "Add Discipline", variant: "filled", size: "md", icon: "plus" },
    onAction: { type: "modal", modal: "create_tab" },
    sortOrder: 2,
  });

  // ── DAILY CHALLENGES SECTION (hidden until challenges exist) ──

  const challengeSection = createPrimitive({
    userId,
    parentId: root,
    component: "Paper",
    slot: "main",
    props: { p: "md", withBorder: true },
    dataSource: "/api/challenges?user_id=" + userId,
    sortOrder: 1,
  });

  createPrimitive({
    userId,
    parentId: challengeSection,
    component: "Text",
    props: { children: "Daily Challenges", fw: 600, size: "sm" },
    sortOrder: 0,
  });

  createPrimitive({
    userId,
    parentId: challengeSection,
    component: "Text",
    props: { children: "Knowledge slipping? Quick challenges to keep it sharp.", c: "dimmed", size: "xs" },
    sortOrder: 1,
  });

  // Create the view
  const viewId = generateId();
  db.prepare(`
    INSERT INTO ui_views (id, user_id, name, root_primitive_id, is_active, theme)
    VALUES (?, ?, 'dashboard', ?, 1, 'auto')
  `).run(viewId, userId, root);
}

// -----------------------------------------------------------
// View switching
// -----------------------------------------------------------

export function setActiveView(userId: string, viewName: string): void {
  const db = getDb();
  db.prepare("UPDATE ui_views SET is_active = 0 WHERE user_id = ?").run(userId);
  db.prepare("UPDATE ui_views SET is_active = 1 WHERE user_id = ? AND name = ?").run(userId, viewName);
}

export function getActiveView(userId: string): UIView | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM ui_views WHERE user_id = ? AND is_active = 1"
  ).get(userId) as RawViewRow | undefined;

  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    root_primitive_id: row.root_primitive_id,
    is_active: true,
    theme: row.theme,
  };
}

// --- Internal ---

interface RawPrimitiveRow {
  id: string;
  user_id: string;
  parent_id: string | null;
  component: string;
  slot: string;
  sort_order: number;
  props: string;
  style: string;
  data_source: string | null;
  on_action: string | null;
  visible: number;
  scope: string;
  created_by: string;
  created_at: number;
}

interface RawViewRow {
  id: string;
  user_id: string;
  name: string;
  root_primitive_id: string;
  is_active: number;
  theme: string;
  created_at: number;
}

function deserialize(row: RawPrimitiveRow): UIPrimitive {
  return {
    id: row.id,
    user_id: row.user_id,
    parent_id: row.parent_id,
    component: row.component,
    slot: row.slot,
    sort_order: row.sort_order,
    props: JSON.parse(row.props),
    style: JSON.parse(row.style),
    data_source: row.data_source,
    on_action: row.on_action ? JSON.parse(row.on_action) : null,
    visible: !!row.visible,
    scope: row.scope,
    created_by: row.created_by,
  };
}
