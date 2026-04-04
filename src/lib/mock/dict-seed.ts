// ============================================================
// System Dictionary Seed — ships with the app
//
// These are the reference entries the AI uses to construct
// objects in the 3D workspace. Covers core domains.
// ============================================================

import type { DictEntry, NodeProperties, EdgeRule, SkinOverrides } from "@/lib/types/core";

// Helper to reduce boilerplate
function entry(
  domain: string,
  term: string,
  category: string,
  properties: NodeProperties,
  edge_rules: EdgeRule[],
  skin_overrides: SkinOverrides = {}
): Omit<DictEntry, "id" | "created_at"> {
  return { domain, term, category, properties, edge_rules, skin_overrides, source: "system" };
}

// -----------------------------------------------------------
// CHEMISTRY — Elements + Bond Rules
// -----------------------------------------------------------

const BOND_RULE = (max: number): EdgeRule => ({
  target_category: "element",
  relation: "bond",
  max_connections: max,
  stiffness: 50,
  rest_length: 1.5,
  label_template: "bond",
});

export const CHEMISTRY_DICT: Omit<DictEntry, "id" | "created_at">[] = [
  entry("chemistry", "hydrogen", "element",
    { mass: 1, charge: 1, label: "H", atomic_number: 1, electronegativity: 2.2 },
    [BOND_RULE(1)],
    { color: "#FFFFFF", shape: "sphere", scale: 0.6 }
  ),
  entry("chemistry", "carbon", "element",
    { mass: 12, charge: 4, label: "C", atomic_number: 6, electronegativity: 2.55 },
    [BOND_RULE(4)],
    { color: "#333333", shape: "sphere", scale: 1.0 }
  ),
  entry("chemistry", "nitrogen", "element",
    { mass: 14, charge: 5, label: "N", atomic_number: 7, electronegativity: 3.04 },
    [BOND_RULE(3)],
    { color: "#3050F8", shape: "sphere", scale: 0.9 }
  ),
  entry("chemistry", "oxygen", "element",
    { mass: 16, charge: 6, label: "O", atomic_number: 8, electronegativity: 3.44 },
    [BOND_RULE(2)],
    { color: "#FF0D0D", shape: "sphere", scale: 0.85 }
  ),
  entry("chemistry", "phosphorus", "element",
    { mass: 31, charge: 5, label: "P", atomic_number: 15, electronegativity: 2.19 },
    [BOND_RULE(5)],
    { color: "#FF8000", shape: "sphere", scale: 1.0 }
  ),
  entry("chemistry", "sulfur", "element",
    { mass: 32, charge: 6, label: "S", atomic_number: 16, electronegativity: 2.58 },
    [BOND_RULE(6)],
    { color: "#FFFF30", shape: "sphere", scale: 1.0 }
  ),
  entry("chemistry", "iron", "element",
    { mass: 56, charge: 2, label: "Fe", atomic_number: 26, electronegativity: 1.83 },
    [BOND_RULE(6)],
    { color: "#E06633", shape: "sphere", scale: 1.1 }
  ),
];

// -----------------------------------------------------------
// BIOLOGY — Organelles + Pathway Rules
// -----------------------------------------------------------

const PATHWAY_RULE: EdgeRule = {
  target_category: "organelle",
  relation: "pathway",
  max_connections: 10,
  stiffness: 5,
  rest_length: 4.0,
  label_template: "metabolic pathway",
};

const SIGNAL_RULE: EdgeRule = {
  target_category: "molecule",
  relation: "signal",
  max_connections: 20,
  stiffness: 2,
  rest_length: 3.0,
  label_template: "signal",
};

export const BIOLOGY_DICT: Omit<DictEntry, "id" | "created_at">[] = [
  entry("biology", "mitochondria", "organelle",
    { mass: 50, charge: 3, label: "Mitochondria", function: "ATP production via oxidative phosphorylation" },
    [PATHWAY_RULE, SIGNAL_RULE],
    { color: "#E64980", shape: "sphere", scale: 2.0, opacity: 0.8 }
  ),
  entry("biology", "ribosome", "organelle",
    { mass: 20, charge: 2, label: "Ribosome", function: "Protein synthesis from mRNA" },
    [PATHWAY_RULE],
    { color: "#7950F2", shape: "sphere", scale: 0.8 }
  ),
  entry("biology", "nucleus", "organelle",
    { mass: 100, charge: 5, label: "Nucleus", function: "DNA storage and transcription" },
    [PATHWAY_RULE, SIGNAL_RULE],
    { color: "#4C6EF5", shape: "sphere", scale: 3.0 }
  ),
  entry("biology", "cell_membrane", "organelle",
    { mass: 30, charge: 1, label: "Cell Membrane", function: "Selective barrier, signal transduction" },
    [PATHWAY_RULE, SIGNAL_RULE],
    { color: "#40C057", shape: "sphere", scale: 4.0, opacity: 0.4 }
  ),
  entry("biology", "atp", "molecule",
    { mass: 5, charge: 3, label: "ATP", function: "Energy currency" },
    [{ target_category: "organelle", relation: "produced_by", max_connections: 5, stiffness: 8, rest_length: 2.0, label_template: "produced by" }],
    { color: "#FFD43B", shape: "sphere", scale: 0.5, glow: true }
  ),
];

// -----------------------------------------------------------
// PHYSICS — Particles + Force Rules
// -----------------------------------------------------------

const FORCE_RULE: EdgeRule = {
  target_category: "particle",
  relation: "force",
  max_connections: 100,
  stiffness: 1,
  rest_length: 5.0,
  label_template: "force interaction",
};

export const PHYSICS_DICT: Omit<DictEntry, "id" | "created_at">[] = [
  entry("physics", "point_mass", "particle",
    { mass: 1, charge: 0, label: "Point Mass", unit: "kg" },
    [FORCE_RULE],
    { color: "#868E96", shape: "sphere", scale: 1.0 }
  ),
  entry("physics", "positive_charge", "particle",
    { mass: 0.001, charge: 1, label: "+q", unit: "C" },
    [FORCE_RULE],
    { color: "#FF0000", shape: "sphere", scale: 0.8, glow: true }
  ),
  entry("physics", "negative_charge", "particle",
    { mass: 0.001, charge: -1, label: "-q", unit: "C" },
    [FORCE_RULE],
    { color: "#0000FF", shape: "sphere", scale: 0.8, glow: true }
  ),
  entry("physics", "spring", "connector",
    { mass: 0, charge: 0, label: "Spring", k: 10, natural_length: 2 },
    [{ target_category: "particle", relation: "spring_connection", max_connections: 2, stiffness: 10, rest_length: 2.0, label_template: "spring" }],
    { color: "#CED4DA", shape: "cylinder", scale: 0.3 }
  ),
];

// -----------------------------------------------------------
// HISTORY — Events + Causation Rules
// -----------------------------------------------------------

const CAUSATION_RULE: EdgeRule = {
  target_category: "event",
  relation: "caused",
  max_connections: 20,
  stiffness: 3,
  rest_length: 6.0,
  label_template: "led to",
};

const CONTEMPORARY_RULE: EdgeRule = {
  target_category: "event",
  relation: "contemporary",
  max_connections: 50,
  stiffness: 1,
  rest_length: 3.0,
  label_template: "same period",
};

export const HISTORY_DICT: Omit<DictEntry, "id" | "created_at">[] = [
  entry("history", "event", "event",
    { mass: 10, charge: 2, label: "Event", year: 0, era: "" },
    [CAUSATION_RULE, CONTEMPORARY_RULE],
    { color: "#4C6EF5", shape: "cube", scale: 1.0 }
  ),
  entry("history", "person", "actor",
    { mass: 5, charge: 1, label: "Person", birth_year: 0, death_year: 0 },
    [{ target_category: "event", relation: "participated", max_connections: 50, stiffness: 5, rest_length: 3.0, label_template: "participated in" }],
    { color: "#FA5252", shape: "sphere", scale: 0.8 }
  ),
  entry("history", "nation", "entity",
    { mass: 50, charge: 5, label: "Nation", founded: 0 },
    [{ target_category: "event", relation: "involved", max_connections: 100, stiffness: 2, rest_length: 5.0, label_template: "involved in" }],
    { color: "#40C057", shape: "cube", scale: 2.0, opacity: 0.6 }
  ),
];

// -----------------------------------------------------------
// GEOGRAPHY — Locations + Connection Rules
// -----------------------------------------------------------

const GEO_ROUTE_RULE: EdgeRule = {
  target_category: "location",
  relation: "route",
  max_connections: 50,
  stiffness: 2,
  rest_length: 5.0,
  label_template: "connected to",
};

export const GEOGRAPHY_DICT: Omit<DictEntry, "id" | "created_at">[] = [
  entry("geography", "city", "location",
    { mass: 20, charge: 3, label: "City", lat: 0, lon: 0, population: 0 },
    [GEO_ROUTE_RULE],
    { color: "#FD7E14", shape: "sphere", scale: 1.0 }
  ),
  entry("geography", "country", "location",
    { mass: 100, charge: 5, label: "Country", lat: 0, lon: 0, area_km2: 0 },
    [GEO_ROUTE_RULE],
    { color: "#4C6EF5", shape: "cube", scale: 3.0, opacity: 0.5 }
  ),
  entry("geography", "river", "feature",
    { mass: 10, charge: 1, label: "River", length_km: 0 },
    [{ target_category: "location", relation: "flows_through", max_connections: 20, stiffness: 1, rest_length: 4.0, label_template: "flows through" }],
    { color: "#339AF0", shape: "cylinder", scale: 0.5 }
  ),
];

// -----------------------------------------------------------
// ALL SYSTEM ENTRIES
// -----------------------------------------------------------

export const ALL_SYSTEM_DICT = [
  ...CHEMISTRY_DICT,
  ...BIOLOGY_DICT,
  ...PHYSICS_DICT,
  ...HISTORY_DICT,
  ...GEOGRAPHY_DICT,
];
