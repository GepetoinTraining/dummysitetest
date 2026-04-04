# Context Solidity — Hyperspheroid Proximity Function

## Overview

The AI needs to know if the context it assembled on its scratch pad
is solid enough to respond confidently. We measure this as proximity
to a hyperspheroid in the tag/knowledge space.

## TODO: Define locally with full math context

- Hyperspheroid construction from tag dimensions
- Distance function from assembled context to surface
- Threshold for "solid" vs "thin" context
- How this feeds back into the AI's decision to grep more or respond

## Integration Point

`src/lib/engine/autopilot.ts` — new function `contextSolidity()`
that reads the scratch pad and tag state, returns a [0,1] score.

The AI can call this as a registered function to self-evaluate
before responding.
