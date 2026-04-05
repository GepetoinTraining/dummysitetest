# StudySync — Session Handoff Prompt

## What This Is

You are continuing a build session for StudySync, an AI-powered study
platform built for the Gemma 4 Good Hackathon (Kaggle, $200K prize,
deadline May 18, 2026, Education track).

The previous session designed and built the entire system from math
spec to working PWA in one sitting. Your job is to test it, fix what's
broken, and wire Ollama.

## The App

A 24.2 KB PWA (zero dependencies) that runs a local AI study assistant.

```
pwa/index.html      → the porthole (DOM events ↔ worker)
pwa/worker.js       → the brain (IndexedDB + engine + HTML builder)
pwa/primitives.js   → 3D draw stub (WebGL, future)
pwa/manifest.json   → PWA manifest
```

No React. No Next.js. No npm. No build step. No node_modules.
The worker reads IndexedDB, builds HTML strings, posts them to
the main thread via postMessage. The main thread just sets innerHTML.

## Architecture

**Trefoil knot** — three loops, one continuous curve:
- Knowledge (memory nodes, XP tiers, decay, lattice)
- Workspace (sessions, planner, 3D simulation, dict)
- AI (Ollama via localhost, grep + scratch pad, self-built context)

Read `docs/architecture.md` for the full explanation.

## The Constitution

Read `docs/constitutional-audit.md` and the constitution in there.
Every feature must comply with the 10 articles. Key ones:
- Article I: No imposed time. Student's clock is sovereign.
- Article V: No login, no gates. Cert-based identity.
- Article VII: Knowledge belongs to the student. Local-first.
- Article VIII: Must work offline, no cloud dependency.

## How to Test

### 1. Serve the PWA

```bash
cd pwa
# Option A: any static file server
npx serve .
# Option B: Python
python -m http.server 8000
# Option C: just open index.html (some browsers block workers from file://)
```

Open in browser. You should see:
- Naturhaus themed dashboard (warm wood/stone palette)
- Header: "StudySync" + "Gemma 4 E2B" badge + icon buttons
- Sidebar: "Disciplines" header + "+" button + "AI Assistant" link
- Main: Welcome message + "Add Discipline" button

### 2. Test the UI flow

1. Click "+ Add Discipline" → modal should appear
2. Enter discipline name (e.g., "Linear Algebra") + teacher name
3. Click "Add" → modal closes, discipline appears in sidebar
4. Click the discipline tab → main area shows discipline view
5. Click "AI Assistant" → chat view appears
6. Type a message → sends, placeholder AI response appears

### 3. Verify IndexedDB

Open DevTools → Application → IndexedDB → studysync
You should see object stores: users, disciplines, professors,
goals, grades, memory_nodes, memory_edges, study_sessions,
chat_messages, etc.

### 4. Wire Ollama

Ollama should be running on localhost:11434 with Gemma 4 installed.

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# If Gemma 4 isn't pulled yet
ollama pull gemma4:2b
```

The chat integration point is in `pwa/worker.js` in the `handleSubmit`
function under `case 'send_chat'`. Currently it writes a placeholder
response. Replace with:

```javascript
case 'send_chat': {
  const now = Math.floor(Date.now() / 1000);
  await put('chat_messages', {
    id: uid(), user_id: 'usr_001', session_id: null,
    role: 'user', content: data.message, created_at: now
  });

  // Build context: tags + recent messages
  const allNodes = await getAll('memory_nodes');
  const tags = allNodes
    .filter(n => n.user_id === 'usr_001' && n.scope === 'global')
    .sort((a, b) => b.tier - a.tier)
    .map(n => `${n.tag}(T${n.tier})`)
    .join(', ');

  const allMsgs = await getAll('chat_messages');
  const recent = allMsgs
    .filter(m => m.user_id === 'usr_001')
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 6)
    .reverse()
    .map(m => ({ role: m.role, content: m.content }));

  const systemPrompt = `You are the student's study assistant.\n${tags ? 'Tags: ' + tags : ''}`;

  // Call Ollama
  try {
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4:2b',
        messages: [
          { role: 'system', content: systemPrompt },
          ...recent,
        ],
        stream: false,
      }),
    });
    const json = await res.json();
    const aiContent = json.message?.content || 'No response from Gemma.';

    await put('chat_messages', {
      id: uid(), user_id: 'usr_001', session_id: null,
      role: 'assistant', content: aiContent, created_at: now
    });
  } catch (err) {
    await put('chat_messages', {
      id: uid(), user_id: 'usr_001', session_id: null,
      role: 'assistant',
      content: 'Could not reach Ollama. Is it running on localhost:11434?',
      created_at: now
    });
  }

  await backup();
  await renderChat();
  break;
}
```

### 5. Test Ollama integration

1. Open chat
2. Type "What is an eigenvalue?"
3. Gemma should respond through Ollama
4. Check IndexedDB → chat_messages → both user and assistant messages stored

### 6. Known issues to check/fix

- [ ] Modal overlay might not cover the full screen (CSS z-index)
- [ ] Dark mode: test with browser set to dark preference
- [ ] Backup: check that `window._lastBackup` is a Blob after adding a discipline
- [ ] Worker error handling: if IndexedDB is blocked (private browsing)
- [ ] Forms: test that Enter key submits (not just button click)
- [ ] Empty states: test with fresh IndexedDB (clear storage, reload)

### 7. The engine files (reference, not used in PWA yet)

The full engine is in `src/lib/engine/`. These 4,600 lines of TypeScript
contain the complete math spec implementation:
- tier.ts: XP → tier computation [1,27,45,63,90]
- memory.ts: node CRUD, bump, decay
- lattice.ts: n-dimensional position, difficulty calibration
- session.ts: clock, dual assessment (1.5:0.75)
- similarity.ts: nightly cross-discipline evaluation
- simulation.ts: Newtonian force sandbox
- dict.ts: element/organelle/particle lookup
- context.ts: 350-slot Mermaid-compressed conversation ledger
- autopilot.ts: tag list + grep + scratch pad
- tabs.ts: discipline creation + scoped context
- registry.ts: 35 AI-callable function definitions

These need to be ported to plain JS and integrated into worker.js
incrementally. Don't do it all at once — port one engine module
at a time, test it, move on.

### 8. The server (separate concern)

`server/` contains the telephone switchboard (WebSocket), shadow
tables, cert-based identity, teacher manifold, and disambiguation.
This is Phase 2. Don't touch it during PWA testing.

## Key Design Decisions

- **No React, no framework.** Worker builds HTML strings, main thread displays.
- **IndexedDB is the database.** No sql.js, no SQLite WASM. Browser-native.
- **Backup to local JSON file.** Every write triggers export. Knowledge never lost.
- **Ollama on localhost.** The AI runs on the student's machine.
- **24.2 KB total.** Zero external dependencies.
- **Naturhaus theme.** Wood/stone/moss/copper palette. Golden ratio spacing (8,13,21,34,55).
- **Wood → steel material progression.** Tier 1 = raw wood, Tier 5 = steel.
- **No human-to-human communication.** Only AI-to-AI via server switchboard.
- **Every UI element is a DB concept.** The worker reads data, builds HTML. No component framework.

## File tree

```
pwa/                          ← THE APP (24.2 KB)
  index.html                  ← porthole
  worker.js                   ← brain
  primitives.js               ← 3D stub
  manifest.json               ← PWA

src/lib/engine/               ← reference engine (TypeScript, to be ported)
src/lib/ai/                   ← Ollama provider, executor, keys
src/lib/types/                ← type definitions (will become JS)
src/lib/utils/                ← golden ratio, theme, cache
src/lib/mock/                 ← seed data
src/lib/db/                   ← schema.sql (reference)

server/                       ← Phase 2 (switchboard, shadows, certs)
docs/                         ← architecture, constitution, build artifact
content/skills/               ← .md workflow files (socratic, feynman, spaced-rep)
```

## What success looks like

1. PWA loads from static files, no server
2. Add disciplines, see them in sidebar
3. Chat with Gemma via Ollama
4. Memory nodes accumulate from conversations
5. Tags appear in discipline view
6. Backup JSON file is created on every write
7. Works in dark mode
8. Works offline (after first load, service worker caches)
