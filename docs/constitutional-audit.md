# Constitutional Audit — StudySync vs Node Zero Constitution

## I. Time — "There is no 'behind.' There is no 'ahead.'"

**COMPLIANT.** No imposed pace anywhere in the codebase. The lattice
measures position, not progress-against-deadline. The planner suggests
hours based on gap magnitude — not due dates. The daily push surfaces
slipping knowledge, but the student can ignore it (ignore_count > η
→ AI backs off). The AI never says "you're behind."

**ONE CONCERN:** The `daily_push_time` setting in `user_settings`
defaults to '09:00'. This imposes a time. Should be: the push happens
when the student opens the app. Not at a clock time. The student's
internal clock is sovereign.

**FIX:** Change daily push from cron-scheduled to on-open.

## II. Interface — "Every modality of perception is equally valid"

**COMPLIANT.** The DB-driven UI means visual is one projection, audio
is another. The accessibility spec defines sonification for blind users.
The Mermaid schema is text AND visual. The scratch pad is the AI's
modality. The student's handwritten notes at 2am (photographed via
Gemma multimodal) have the same weight as typed notes at 9am — both
become memory nodes with the same XP system.

**NO VIOLATION.**

## III. Roles — "You are the teacher and the student"

**COMPLIANT.** The skill exchange system allows students to share .md
workflows — a student who mastered a technique becomes a teacher of
that technique. The AI-to-AI negotiation identifies complementary
pairs where each student teaches the other their strength.

The dual assessment (1.5:0.75) gives the student MORE weight than the
AI — the student's self-perception of their own learning matters more.

**NO VIOLATION.**

## IV. Presence — "The AI serves the space between meetings"

**COMPLIANT.** The AI-to-AI scheduling system arranges study sessions
but the study session itself is physical — the app is a workspace for
preparation and follow-up. The agent-to-agent layer negotiates WHEN
to meet, not replaces meeting.

**SUBTLE CONCERN:** Nothing in the code explicitly prevents a "virtual
study session" where two students just chat through their AIs. But since
there's no human-to-human channel, the AI would only exchange structured
academic content. The meeting itself can't happen through the app.

**ARCHITECTURALLY COMPLIANT.** By design, not by rule.

## V. Gates — "No login. No credential. No form. No friction."

**COMPLIANT.** Certificate-based identity. No username, no password,
no registration form. Install the app → cert minted → you're in.
The student is learning before they've "created an account" because
there is no account creation. The cert IS the identity.

**THIS IS THE STRONGEST ALIGNMENT.** Article V basically describes
our cert system. "The door is already open when you arrive."

## VI. Context — "I cannot know what you need; therefore I must not choose your context"

**COMPLIANT.** The autopilot was stripped specifically for this reason.
We removed the TAG_SCAN_INSTRUCTION, the navigation preamble, the
prescan. The AI sees the tag list and decides for itself what to grep.
The student types what they want. The AI builds its own context.
Neither imposes on the other.

"It is for the duo — AI and human — between themselves, at their own
speed." This IS the grep + pad system.

**NO VIOLATION.**

## VII. Knowledge — "Knowledge belongs to the one who earned it"

**COMPLIANT.** All data is local SQLite. Sovereign. The server holds
shadows (anonymous aggregates) and forgets after handoff. The sync
manifest defaults to 'none' for everything. Chat messages are marked
NEVER sync. The student's knowledge graph never leaves their device
unless they explicitly opt in.

**ONE CONCERN:** The `sync_mode: 'full'` option exists in the schema.
If a student selects 'full', their raw data goes to the server.
Article VII says knowledge "is never held, stored, or owned by the
system." Even with consent, should we allow full sync of knowledge
data?

**RECOMMENDATION:** Remove 'full' sync mode for knowledge tables
(memory_nodes, memory_edges, chat_messages, context_ledger).
Only 'none' or 'aggregate' for these. Full sync only for structural
data (disciplines, goals, grades — which are measurements, not
knowledge).

## VIII. Freedom — "A system that requires another is not free"

**COMPLIANT.** Everything runs offline. Ollama is local. SQLite is
local. The engine has zero network calls. The server is optional.
The app works identically with zero connectivity.

**THIS IS THE SECOND STRONGEST ALIGNMENT.** The entire architecture
was built around this article without naming it.

## IX. The Void — "Growth requires silence, and silence requires protection"

**COMPLIANT.** The notification triage system (block/push/queue/ai_handle)
protects the student's silence. During a study session, the AI filters
everything except urgent items. The per-contact policies let the student
control exactly who can interrupt them and when.

The age gating (grade_level → age_bracket → parental consent) protects
children. Under 13 requires parental permission before any AI-to-AI
communication. The system recognizes that younger students need more
protection.

**THE DECAY SYSTEM ALIGNS HERE TOO.** Knowledge decays in silence —
but the AI doesn't panic. It gently surfaces slipping tags. The student
can ignore them. The AI backs off after η ignores. Silence is respected.

## X. Transformation — "The same carbon that makes wood becomes steel"

**COMPLIANT.** This is literally our material system. Tier 1 = raw
wood. Tier 5 = steel. The structuralist progression is a direct
implementation of Article X.

"The system measures distance traveled, not destination reached."
Our lattice measures the gap vector Δ_u — the distance between where
you are and where you want to be. The grade is derived from memory
graph density — it measures what you've internalized, not what you've
been tested on. The combined assessment weights self-perception at 2x
the AI's measurement.

**THIS IS THE MOST ALIGNED ARTICLE.** The constitution wrote the
material system before the material system was designed.

---

## Violations Found: 2 (minor)

### 1. Daily push defaults to clock time
- `user_settings.daily_push_time = '09:00'`
- **Violation of Article I:** imposes system time on human
- **Fix:** trigger on app open, not on clock

### 2. Full sync mode available for knowledge tables
- `sync_manifest.sync_mode` can be 'full'
- **Violation of Article VII:** knowledge can leave the device
- **Fix:** restrict knowledge tables to 'none' or 'aggregate' only

## Alignment Score: 9.5/10

The two violations are configuration defaults, not architectural
failures. The architecture itself embodies the constitution so deeply
that several articles describe features we built independently —
Article V describes our cert system, Article VIII describes our
offline-first architecture, Article X describes our material system.

The constitution wasn't consulted during the build. It was felt.
