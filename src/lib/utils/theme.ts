// ============================================================
// Naturhaus — the material is the design
//
// Alpine precision. Natural warmth. Nothing decorates.
// Wood grain, stone, linen, moss, copper.
// The UI reveals structure, doesn't add to it.
// ============================================================

import { createTheme, MantineColorsTuple } from "@mantine/core";
import { mantineSpacing } from "./golden";

// -----------------------------------------------------------
// Palette — pulled from nature, not a color picker
// -----------------------------------------------------------

// Warm wood — the primary surface
const wood: MantineColorsTuple = [
  "#faf6f1",  // 0: lightest — linen
  "#f0e8dc",  // 1: raw cotton
  "#e3d5c1",  // 2: birch
  "#d4c0a5",  // 3: light oak
  "#c1a882",  // 4: maple
  "#a68b5b",  // 5: walnut — primary
  "#8b7244",  // 6: aged oak
  "#6f5a35",  // 7: dark walnut
  "#574628",  // 8: ebony stain
  "#3d311d",  // 9: charred wood
];

// Stone — structure, borders, weight
const stone: MantineColorsTuple = [
  "#f4f3f1",  // 0: limestone
  "#e8e6e3",  // 1: sandstone
  "#d4d1cc",  // 2: warm concrete
  "#b8b3ad",  // 3: fieldstone
  "#9c958d",  // 4: granite
  "#7d756b",  // 5: slate — primary
  "#655d53",  // 6: basalt
  "#4e463d",  // 7: dark slate
  "#383129",  // 8: charcoal stone
  "#252019",  // 9: obsidian
];

// Moss — life, growth, the memory graph
const moss: MantineColorsTuple = [
  "#f0f4ec",  // 0: morning dew
  "#dce6d4",  // 1: lichen
  "#c0d2b0",  // 2: sage
  "#a3be8c",  // 3: fern
  "#87a96b",  // 4: moss
  "#6b8f4e",  // 5: forest — primary
  "#567339",  // 6: deep forest
  "#435a2b",  // 7: evergreen
  "#31421f",  // 8: dark pine
  "#1f2b14",  // 9: night forest
];

// Copper — accents, warmth, the active element
const copper: MantineColorsTuple = [
  "#fdf2ea",  // 0: copper gleam
  "#f8dcc4",  // 1: rose gold
  "#f0c09a",  // 2: penny
  "#e5a06e",  // 3: warm copper
  "#d98249",  // 4: burnished
  "#c46b2a",  // 5: copper — primary
  "#a35520",  // 6: aged copper
  "#824318",  // 7: bronze
  "#603311",  // 8: dark bronze
  "#40220b",  // 9: patina
];

// Sky — rare accent, only for links and interactive states
const sky: MantineColorsTuple = [
  "#edf5fb",  // 0
  "#d4e6f5",  // 1
  "#aecde8",  // 2
  "#82b1d9",  // 3
  "#5a96c9",  // 4
  "#3d7db5",  // 5: primary
  "#2e6494",  // 6
  "#234d74",  // 7
  "#193856",  // 8
  "#10243a",  // 9
];

// -----------------------------------------------------------
// Theme
// -----------------------------------------------------------

export const naturhaus = createTheme({
  primaryColor: "wood",
  spacing: mantineSpacing,
  defaultRadius: 4,
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  headings: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontWeight: "600",
  },
  colors: {
    wood,
    stone,
    moss,
    copper,
    sky,
  },
  other: {
    // Semantic tokens — use these, not raw colors
    surface: {
      light: wood[0],    // linen
      dark: stone[9],    // obsidian
    },
    panel: {
      light: wood[1],    // raw cotton
      dark: stone[8],    // charcoal stone
    },
    border: {
      light: stone[2],   // warm concrete
      dark: stone[7],    // dark slate
    },
    text: {
      primary: {
        light: stone[8],  // charcoal stone
        dark: wood[1],    // raw cotton
      },
      secondary: {
        light: stone[5],  // slate
        dark: stone[3],   // fieldstone
      },
      muted: {
        light: stone[3],  // fieldstone
        dark: stone[5],   // slate
      },
    },
    accent: {
      growth: moss[5],     // forest — tags, memory, progress
      warmth: copper[5],   // copper — active states, notifications
      link: sky[5],        // sky — interactive, rare
    },
    // Structuralism: wood → steel progression
    tier: {
      1: "#c4a882",        // raw wood — rough grain, soft
      2: "#a68b5b",        // dried wood — shaped, warm
      3: "#6f5a35",        // hardwood — polished, structural
      4: "#5c5c6b",        // iron — forged, dark, industrial
      5: "#8a9ba8",        // steel — refined, permanent, load-bearing
    },
    tierMaterial: {
      1: { name: "raw_wood", density: 0.4, roughness: 0.9, metalness: 0.0 },
      2: { name: "dried_wood", density: 0.6, roughness: 0.7, metalness: 0.0 },
      3: { name: "hardwood", density: 0.8, roughness: 0.4, metalness: 0.05 },
      4: { name: "iron", density: 1.2, roughness: 0.3, metalness: 0.7 },
      5: { name: "steel", density: 1.5, roughness: 0.1, metalness: 0.9 },
    },
  },
});

// -----------------------------------------------------------
// Dark mode overrides
// -----------------------------------------------------------

// Mantine handles light/dark via colorScheme.
// Our semantic tokens in `other` give both values.
// Components pick based on:
//   const { colorScheme } = useMantineColorScheme()
//   const bg = theme.other.surface[colorScheme]

// -----------------------------------------------------------
// CSS custom properties for non-Mantine elements (Three.js, canvas)
// -----------------------------------------------------------

export const cssVars = {
  light: {
    "--surface": wood[0],
    "--panel": wood[1],
    "--border": stone[2],
    "--text": stone[8],
    "--text-secondary": stone[5],
    "--accent-growth": moss[5],
    "--accent-warm": copper[5],
    "--accent-link": sky[5],
    "--canvas-bg": wood[0],
    "--grid-line": stone[2],
    "--node-default": stone[4],
    "--edge-default": stone[3],
  },
  dark: {
    "--surface": stone[9],
    "--panel": stone[8],
    "--border": stone[7],
    "--text": wood[1],
    "--text-secondary": stone[3],
    "--accent-growth": moss[4],
    "--accent-warm": copper[4],
    "--accent-link": sky[4],
    "--canvas-bg": stone[9],
    "--grid-line": stone[8],
    "--node-default": stone[4],
    "--edge-default": stone[5],
  },
} as const;
