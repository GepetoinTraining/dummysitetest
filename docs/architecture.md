# StudySync Architecture — The Trefoil

## One knot, three loops

The backend is a trefoil knot. Three loops — Knowledge, Workspace,
AI — form one continuous curve. They cannot be separated without
breaking the system.

```
        Knowledge
       ╱    ╲
      ╱      ╲
     ╱   knot  ╲
    AI ────────── Workspace
```

### Loop 1: Knowledge

The student's learning state machine.

memory → tier → lattice → similarity → daily-push → mermaid

What it tracks: what the student knows, how well, how it connects,
what's decaying.

### Loop 2: Workspace

The tools the student uses.

simulation → dict → skills → session → planner → tabs

What it provides: 3D sandbox, calculators, study sessions,
scheduling, discipline structure.

### Loop 3: AI

The model's self-assembly system.

autopilot → context → registry → grep → scratch pad

What it does: builds its own context from the tag index,
searches knowledge, writes its own working memory.

## The crossings

A trefoil has three crossings. These are the files where
loops pass through each other:

### Crossing 1: Session (Knowledge × Workspace)

A study session is a workspace tool (clock, notebook).
When it ends, the dual assessment (1.5:0.75) updates
the knowledge lattice. The workspace writes to knowledge.

### Crossing 2: Tabs (Workspace × AI)

A discipline tab is workspace structure (UI, metadata, tools).
It's also the AI's context scope — each tab constrains what
the AI sees. The workspace shapes the AI.

### Crossing 3: Memory extraction (Knowledge × AI)

The AI extracts central ideas from chat → creates memory nodes
→ bumps tags → updates tiers → changes the tag index the AI
reads next turn. Knowledge feeds AI feeds knowledge.

## Why flat

The engine directory is flat because the trefoil is one
continuous curve. Splitting into subdirectories would create
artificial boundaries at the crossings, forcing files to
import across boundaries that don't exist in the topology.

The flat structure IS the architecture.

## The invariant

Every function in the engine eventually participates in
this cycle:

```
Student acts
  → Session captures
    → Memory extracts
      → Tags promote/decay
        → Lattice shifts
          → Difficulty recalibrates
            → AI selects exercise
              → Student acts
```

If you can trace any function back to this cycle, it belongs.
If you can't, it doesn't.
