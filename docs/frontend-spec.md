# Frontend Spec — No State, Only DB

## Principle

The frontend doesn't exist. The database is the state.
Mantine primitives are the view. SQL queries are the controller.

```
DB (truth) → Query → Mantine primitive → User action → DB write → Re-query
```

No useState. No useReducer. No context providers.
No state management library. No prop drilling.
No hydration mismatches. No stale state.
No re-render cascades.

## Architecture

### Table 1: Mantine Primitives Registry

Every UI element is a row. HTML + CSS burned into a table.

| id | component | props_schema | css_overrides |
|----|-----------|-------------|---------------|
| btn_start_session | Button | { label, onClick, variant } | {} |
| tab_discipline | Tabs.Tab | { value, label, color, icon } | {} |
| ... | ... | ... | ... |

### Table 2: View State

Each row is a view. The current view is a query.

| id | view_name | layout | components | active |
|----|-----------|--------|------------|--------|
| v_dashboard | Dashboard | AppShell | [tabs, chat, planner] | 1 |
| v_session | Study Session | Split | [editor, chat, clock] | 0 |
| v_memory | Memory Web | Canvas | [graph_editor] | 0 |

### Why This Works

1. **Lazy loading is free** — nothing to hydrate, just query when needed
2. **Workers share truth** — AI worker writes to DB, UI re-queries
3. **Offline-first** — SQLite is local, no network dependency
4. **Undo is free** — DB transactions, rollback
5. **Multi-tab is free** — all tabs read same DB
6. **Testing is free** — seed DB, assert queries, no DOM

## Component Pattern

```tsx
// No state. Query, render, done.
async function DisciplineTab({ disciplineId }: { disciplineId: string }) {
  const tab = await db.query('SELECT * FROM disciplines WHERE id = ?', disciplineId)
  const tags = await db.query('SELECT tag, tier FROM memory_nodes WHERE discipline_id = ?', disciplineId)
  const grade = await db.query('SELECT value FROM grades WHERE discipline_id = ? ORDER BY recorded_at DESC LIMIT 1', disciplineId)

  return (
    <Stack>
      <Title>{tab.name}</Title>
      <Progress value={grade.value * 100} />
      <Group>{tags.map(t => <Badge key={t.tag}>{t.tag} T{t.tier}</Badge>)}</Group>
    </Stack>
  )
}
```

## Worker Architecture

```
┌─────────────┐     ┌─────────────┐
│   UI Thread  │     │  AI Worker  │
│              │     │             │
│  Reads DB    │     │  Reads DB   │
│  Renders     │     │  Runs Gemma │
│  Writes DB   │     │  Writes DB  │
│              │     │             │
└──────┬───────┘     └──────┬──────┘
       │                     │
       └─────────┬───────────┘
                 │
          ┌──────┴──────┐
          │   SQLite    │
          │  (WAL mode) │
          └─────────────┘
```

WAL mode allows concurrent reads. One writer at a time
(SQLite handles this). UI reads are never blocked.

## Lazy Loading Strategy

- **Dashboard shell**: loads immediately (static Mantine AppShell)
- **Discipline tab content**: lazy loaded on tab click (query + render)
- **3D graph editor**: lazy loaded on workspace open (Three.js bundle)
- **Chat panel**: lazy loaded on first message
- **Planner views**: lazy loaded on planner open
- **Memory web**: lazy loaded on memory view click
- **Map layer**: lazy loaded only for geography disciplines
- **Code editor**: lazy loaded only for CS disciplines
- **PDF decomposer**: lazy loaded on file import

Everything is `dynamic(() => import(...), { ssr: false })` or
React Server Components that query on demand.

## Mantine Primitives Used

Core layout: AppShell, Tabs, Stack, Group, Grid, Paper
Data: Table, Badge, Progress, RingProgress, Timeline
Input: TextInput, Select, Slider, NumberInput, Switch
Feedback: Notification, Modal, Drawer, Tooltip
Navigation: Tabs, NavLink, ActionIcon
Dates: Calendar, DatePicker (for planner)

No custom components until Mantine can't do it.
Then one custom component, as thin as possible.
