# Accessibility — every projection of the same DB

## Principle

The visual layer is one rendering. The audio layer is another.
Same DB, same queries, different output format.
The "no frontend, only DB" architecture makes this free.

## TTS Layer — Sarvam AI

Every phrase in the app gets read aloud. Not just for blind users —
for everyone. Students studying on the bus. Students who learn
better by listening.

- Provider: Sarvam (Indian frontier model)
- Cost: free tier, API key
- Integration: thin wrapper, reads any text node
- Multilingual: Sarvam supports 10+ Indian languages + English
- Every UI primitive with text content gets a "read" action

## Blind User Experience

### What already works (text-based, screen reader compatible)

| Feature | Accessibility | Notes |
|---------|--------------|-------|
| Tag list | ✅ Pure text | Screen reader reads directly |
| Chat | ✅ Pure text | Standard chat accessibility |
| Scratch pad | ✅ Pure text | AI's self-built context is text |
| Grep results | ✅ Pure text | Search results are text |
| Session clock | ✅ Numeric | "45 minutes elapsed" |
| Planner | ✅ Table data | "Monday: Linear Algebra 2 hours" |
| Notifications | ✅ Text + priority | Read by urgency order |
| Daily challenges | ✅ Text questions | Read question, voice answer |
| Grades/goals | ✅ Numeric | "Linear Algebra: 68% toward goal of 85%" |
| Tab metadata | ✅ Text | "Teacher: Dr. Vasquez, office hours Tue/Thu" |

### What needs audio projection

| Feature | Audio projection | Implementation |
|---------|-----------------|----------------|
| Memory web (3D graph) | Spatial audio graph traversal | Sonification engine |
| 3D simulation | Sonic force feedback | Force → frequency mapping |
| Connection pills | Spoken connections | "Linear Algebra connects to Statistics via matrix methods" |
| Lattice position | Spoken position report | "You are at 68% in a 4-dimension space, closest to goal in Data Structures" |
| Mermaid workflows | Spoken step-by-step | "Step 1: assess current level. Step 2: generate question..." |
| Material progression | Tonal shift | Wood = warm low tone, Steel = clear high tone |

### Sonification Engine

The 3D graph becomes a sonic space:

- **Node position** → stereo panning (left/right) + pitch (up/down)
- **Node tier** → timbre (wood=warm, steel=bright)
- **Node XP** → volume (higher XP = louder)
- **Edges** → connecting tones when traversing
- **Force magnitude** → vibration/pulse rate
- **Decay** → tone fading over time (literally hear knowledge fading)
- **Bump** → chime (hear knowledge strengthening)

Navigation: arrow keys traverse the graph. Each node announces
itself via TTS + spatial audio position. The student builds
a mental map from sound.

### Voice Input

Blind users can:
- Voice chat with the AI (speech-to-text → Gemma → TTS response)
- Voice-navigate: "go to eigenvalues" → traverse graph to that node
- Voice-create: "add a note about Jordan form" → AI creates memory node
- Voice-assess: "I'd rate this session 7 out of 10" → self-assessment

### Implementation

1. **TTS wrapper** — calls Sarvam API for any text string
2. **Sonification module** — maps graph/simulation state to audio
3. **Spatial audio** — Web Audio API, panning + 3D positioning
4. **Voice input** — Web Speech API (browser native, no dep)
5. **Screen reader ARIA** — Mantine components already support this
6. **Audio primitives** — new UI primitive type: `AudioNode`
   that renders sound instead of visuals from the same DB row

### The key insight

We don't build a "blind mode." We build an audio renderer
that reads the same DB as the visual renderer. The student
chooses their projection. Some students will use both —
visual graph on screen, TTS reading the chat.

The DB doesn't care how it's rendered. That's the point.

## Colorblind Safety

Naturhaus palette is inherently colorblind-safe:
- Wood, stone, copper differentiate by **luminance**, not hue
- No meaning is carried by red vs green alone
- Tier progression (wood → steel) is a luminance + texture shift
- Every color distinction is doubled by shape, size, or position
- Moss (growth) and copper (warmth) are distinguishable even
  in deuteranopia/protanopia because they differ in luminance

If we ever need to add color coding (charts, etc.), use:
- Blue + Orange (safe for all common types)
- Luminance steps within one hue family (our existing approach)
- Always add a shape/pattern/label as secondary signal

## Autism-Friendly Design

- **No bright saturated colors** — Naturhaus is muted by design
- **No sudden transitions** — all animations are slow, eased, optional
- **Predictable layout** — DB-driven, same structure every time
- **No flashing** — zero blinking elements, notifications are static
- **Low sensory load** — golden ratio spacing creates breathing room
- **User controls everything** — notifications are filtered by AI,
  student sets their own pace, no urgency in the UI
- **Dark mode** — reduces visual stimulation (stone/obsidian palette)
- **Minimal motion** — 3D graph uses damping, no sudden movement
- **Consistent sounds** — same tone for same action, always

## Sound Design

The sound palette matches Naturhaus — warm, organic, soothing.
Every sound is designed to be comfortable for extended study sessions.

| Event | Sound | Character |
|-------|-------|-----------|
| Tag bump (knowledge strengthened) | Soft wooden chime | Low warm resonance, like a marimba |
| Tier promotion | Ascending gentle bell | Deeper as tier increases (wood→steel = low→clear) |
| Tier demotion | Soft descending tone | Not alarming — a gentle fade |
| New memory node | Soft pluck | Like a raindrop on wood |
| Session start | Low warm hum, fading in | Settles the space, signals focus |
| Session end | Gentle resolution chord | Completion, not interruption |
| Notification (push) | Single soft knock | Like someone at a wooden door |
| Daily challenge | Three gentle ascending notes | Morning, not alarm |
| Connection discovered | Two tones harmonizing | Two ideas meeting |
| AI thinking | Quiet ambient hum | Barely perceptible, not anxious |
| Error | Low soft buzz | Not jarring, informational |

Principles:
- **No sharp attacks** — all sounds have soft onset (5-20ms fade in)
- **Low frequency dominant** — 200-800Hz range, nothing piercing
- **Short duration** — 200-500ms max, never loops
- **Volume ceiling** — never above 60% of system volume
- **Silence is default** — sounds are opt-in, not opt-out
- **Consistent** — same action = same sound, always, everywhere

## TODO: Build locally

- [ ] Sarvam TTS wrapper (API key integration)
- [ ] Sonification module (Web Audio API)
- [ ] Graph traversal via keyboard (arrow keys + announce)
- [ ] Voice input pipeline (Web Speech → text → AI)
- [ ] AudioNode UI primitive type
- [ ] ARIA labels on all Mantine primitives
