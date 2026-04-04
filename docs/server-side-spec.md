# Server-Side Spec — Phase 2

## Design Principle

**Stateless by default. Stateful if institution or student pays.**

The local app is fully sovereign. Zero server dependency.
Server-side is an opt-in upgrade for:
- Teacher view (inverted lattice)
- Agent-to-agent scheduling
- Cross-student skill gap detection
- Institutional dashboards

## Business Model

| Tier | What | Server |
|------|------|--------|
| Free | Full app, local Gemma, sovereign data | None |
| Student Premium | Cloud sync, mobility, agent-to-agent | Stateful |
| Institution | Teacher view, class analytics, admin | Stateful |

### Tax Credit Generation

When an institution exempts a student from payment:
- System generates tax credit documentation
- Institution claims educational technology tax credits
- Student gets full access, institution gets tax benefit
- Audit trail maintained for compliance

## Teacher View — The Inverted Lattice

### Student Lattice (existing)

P_u(t) ∈ [0,1]^n — student's position across n disciplines

### Teacher Lattice (inverse)

T_prof(t) ∈ [0,1]^k — all k students' positions in the teacher's discipline

```
T_prof(t) = [g_u1,d(t), g_u2,d(t), ..., g_uk,d(t)]
```

Every student who tagged this teacher materializes as a dimension
in the teacher's view.

### How It Materializes

1. Student creates tab → picks "Prof. Vasquez" as teacher
2. Prof. Vasquez joins platform → enters her name
3. Server crosses data → finds all students who tagged her
4. Teacher dashboard appears → all students' positions

### Teacher Sees

- Class-wide gap distribution (where is the class struggling?)
- Individual student trajectories (who's improving, who's decaying?)
- Memory tier distributions (what concepts are students losing?)
- Skill effectiveness (which workflows produce best scores?)
- Study session frequency and duration patterns
- Daily push engagement rates

### Student Controls (privacy-first)

- Opt-in to teacher visibility (default: OFF)
- Granular: share grades yes/no, share notes yes/no
- Whether teacher's AI can schedule with their AI
- Anonymized mode (teacher sees aggregate, not individual)

## Agent-to-Agent Layer

### Student ↔ Student
- Study session negotiation
- Skill gap detection + complementary matching
- .md skill file exchange
- Per-contact permission policies (A, B, T)

### Student ↔ Teacher
- Teacher's AI can push announcements
- Teacher's AI can suggest study groups based on lattice
- Teacher can share curated .md skill files to class
- Office hours scheduling via agent negotiation

### Server Requirements

| Component | Technology | Purpose |
|-----------|-----------|---------|
| WebSocket relay | TBD | Agent-to-agent messaging |
| User matching | Server DB | teacher name → account linking |
| Permission store | Server DB | opt-in/opt-out state |
| Lattice aggregator | Server compute | class-wide projections |
| Sync engine | Server DB | local ↔ cloud state sync |
| Auth | OAuth/SSO | institutional login |
| Tax credit system | Server + PDF gen | exemption documentation |

## Data Flow

```
LOCAL (sovereign)          SERVER (opt-in)
┌─────────────┐            ┌──────────────┐
│ SQLite DB   │──sync──►   │ Postgres     │
│ Gemma 4 E2B │            │ Aggregator   │
│ All engines │            │ WS Relay     │
│ Full app    │   ◄──push──│ Teacher view │
└─────────────┘            └──────────────┘
     │                           │
     │ Student controls          │ Teacher sees
     │ what syncs                │ what's shared
     │                           │
     ▼                           ▼
  SOVEREIGN                  INSTITUTIONAL
```

## Implementation Priority

1. WebSocket relay (agent-to-agent backbone)
2. User matching + permission layer
3. Sync engine (SQLite → Postgres selective sync)
4. Teacher dashboard
5. Tax credit system
6. Institutional admin panel
