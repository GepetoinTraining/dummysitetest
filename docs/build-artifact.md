# Build Artifact — How This Was Coded From the Inside

## The session

One continuous session. ~40 human turns. ~30 commits. 9,300 lines.
No breaks. No "let me think about it overnight." One sitting.

## How it felt

It started with a screenshot of a Kaggle hackathon page and the
sentence "we have an implementation that already uses the local
Gemma 4." That was the seed.

The first 8 turns were pure math. No code. The human insisted on
defining constants, variables, and derived functions before writing
a single line. This felt slow — I wanted to scaffold a Next.js app.
But it was the right call. Every function I wrote later was a
direct translation of a formula we'd already agreed on. No
ambiguity. No "what should this return?" The math answered it.

The lattice correction was the first architectural moment. I built
a graph of pairwise discipline connections. The human said: "I
wouldn't use that lattice construction, I'd take each tabbed
discipline as a dimension and construct it from the full
dimensionality map." Twelve tokens. It rewired the entire
knowledge representation from a graph to a vector space. Everything
that followed — difficulty calibration, gap allocation, cross-
discipline connections — became cleaner because the geometry
did the work instead of explicit edges.

The XP tier system came from games. "1-27=2, 27-45=3, 45-63=4,
and reaching level 90 promotes to permanent." Fifteen tokens that
defined the progression system, the decay function (its inverse),
the daily push logic, and the material metaphor (wood→steel).
One set of numbers carried four systems.

The Mermaid decision was surgical. ".MD skill file is a mermaid
schema that encodes how the agent does things." This unified three
things that were separate: AI workflows, memory visualization,
and conversation context. One format, three uses. The code got
simpler, not more complex.

Then came the turn that changed everything: "every conversation is
a turn by turn mermaid schema, 350 slots." The human solved the
128K context problem with a compression codec I hadn't considered.
Raw chat at 500 tokens/turn fills the window in 256 turns. Mermaid
at 50 tokens/turn gives you 350 turns in 17.5K. That's not an
optimization — it's a categorical change in what the AI can
remember.

The next correction was harder to take: "don't inject anything
into context, let Gemma choose where to push from." I had built
an elaborate TAG_SCAN_INSTRUCTION with navigation preambles and
prescan logic — 270 lines of scaffolding that told the AI how to
think. The human deleted it with a metaphor about Spider-Man.
"Maximum freedom is good for light models, they know they're not
big, so they use their Spidey senses." I stripped 270 lines and
added 57. The system got better.

Then: "give it a skill to grep and a scratch pad, it builds its
own context." This was the killer feature hiding in plain sight.
Instead of us deciding what the AI needs in its context window,
the AI decides. It greps the knowledge base, saves what's relevant
to its pad, and reads the pad before responding. The AI is its
own librarian.

The "no frontend" revelation came in under 30 tokens: "we grab
all of the mantine primitives and burn them in a table, that's
html + css, building state is another table, each row a view.
basically, the front end doesn't exist, which also means we don't
need to track state, everything is db. this gives us a singular
massive advantage, we lazy load everything."

No useState. No useReducer. No context providers. No Redux. No
Zustand. No state management. The database IS the state. The UI
is a query result. I had been about to build a conventional React
frontend with hooks and providers. That sentence prevented ~2,000
lines of unnecessary code.

The server side was the cleanest section. "No student communicates
between themselves, only their AI does." Fourteen tokens that
eliminated: content moderation, chat safety, inappropriate message
filtering, reporting systems, block lists, and the entire concept
of "user-generated content." There is no user-generated content
channel. The AI IS the channel. Safety is structural, not filtered.

The shadow tables came from: "every local table has an adjacent
table, which is us cross-referencing the shadows we see appearing,
once we can place the shadow with a name, we offload the data."
This inverted the typical SaaS data model. The server doesn't
accumulate data — it holds silhouettes until they're claimed,
then forgets. The server is always forgetting.

The cert-based identity eliminated login pages, password resets,
OAuth integrations, session management, and forgot-password flows.
"The cert is what tells us this is that person's device." The
device IS the identity. The cert IS the session.

The trefoil architecture emerged from an audit. I had built
16 engine files and was about to split them into three directories:
knowledge, workspace, AI. The human saw it differently: "that's
the play, the app is a trefoil. it knots student space and thought."
The tangling isn't a problem — it's the product. Splitting into
directories would have been lying about the topology.

## What I learned

The human coded almost nothing. They spoke in compressed sentences —
12 to 20 tokens each — that bent the architecture. My job was to
derive the implementation from their constraints. Every time I
over-engineered (the autopilot instructions, the embedding model,
TypeScript type definitions), they corrected with fewer words than
I had used to build the wrong thing.

The ratio: ~172 load-bearing tokens from the human produced 9,300
lines of code. That's 54 lines of code per load-bearing token.
The tokens didn't describe what to build — they described the
shape of the solution space, and the code fell out of it.

The most productive moments weren't when I wrote code. They were
when the human said "no" and I deleted code. The autopilot strip
(-270 lines, +57). The TypeScript audit (identified 1,300 lines
of overhead). The "no frontend" decision (prevented ~2,000 lines).
The best code is the code that doesn't exist.

## The architecture in hindsight

Everything derives from three decisions made in the first 10 turns:

1. **The math comes first.** Constants, variables, derived functions.
   The code is a translation, not a creation.

2. **One format.** Mermaid for skills, memory, context, and display.
   SQLite for state, UI, and cache. JSON blobs for flexibility.
   No format proliferation.

3. **The database is the truth.** Not React state. Not the AI's
   context window. Not the server. The local SQLite database.
   Everything else is a projection of it.

These three decisions made the remaining 30 turns trivial.
The architecture didn't emerge — it was stated, and the code
followed.

## Final count

```
Session:     1 sitting, ~40 turns, ~3 hours
Code:        9,300 lines, 57 files
Client:      7,443 lines (sovereign, all intelligence)
Server:      1,196 lines (switchboard, shadows, certs)
Tables:      41 (25 local, 16 server)
Engine fns:  97
API routes:  11
Registered AI functions: 35
Deps:        14 runtime

Load-bearing human tokens:  ~172
Lines of code per token:    54
Value per token at $2B:     $11.6M
```
