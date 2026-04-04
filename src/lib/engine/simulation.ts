// ============================================================
// Force Simulation Engine
//
// A configurable Newtonian sandbox. Start with a clean surface,
// add constants and variables that affect ΔN and vectors.
//
// Base state: surface exists, no air, no friction.
// The student/AI layers physics rules on top:
//   addConstant("gravity", { ... })
//   addVariable("friction", { ... })
//   addVariable("air_resistance", { ... })
//
// Each rule is a force function. The simulation sums all active
// forces per node per frame → ΔN → acceleration → velocity → position.
// ============================================================

import type { GraphNode } from "@/lib/types/core";

type Vec3 = [number, number, number];

// -----------------------------------------------------------
// Force Rules — constants and variables the student adds
// -----------------------------------------------------------

export type ForceType =
  | "gravity"
  | "friction"
  | "air_resistance"
  | "spring"
  | "coulomb"
  | "drag"
  | "buoyancy"
  | "magnetic"
  | "centripetal"
  | "applied"     // custom force vector the student places
  | "custom";     // arbitrary function

export interface ForceRule {
  id: string;
  name: string;
  type: ForceType;
  enabled: boolean;
  is_constant: boolean;  // true = constant (gravity), false = variable (friction depends on velocity)
  params: Record<string, number>;
  compute: (node: SimNode, env: SimEnvironment, dt: number) => Vec3;
}

// -----------------------------------------------------------
// Simulation State
// -----------------------------------------------------------

export interface SimNode extends GraphNode {
  force_accumulator: Vec3;    // ΣF for this frame
  acceleration: Vec3;
  net_force_magnitude: number; // |ΔN| — displayed to student
}

export interface Surface {
  y: number;           // surface height (default 0)
  normal: Vec3;        // surface normal (default [0, 1, 0])
  enabled: boolean;
}

export interface SimEnvironment {
  surface: Surface;
  bounds: Vec3 | null;
  active_rules: ForceRule[];
  time: number;        // total elapsed simulation time
  dt: number;          // time step
  paused: boolean;
}

export interface SimState {
  nodes: SimNode[];
  edges: { source: string; target: string; stiffness: number; rest_length: number }[];
  environment: SimEnvironment;
}

// -----------------------------------------------------------
// Built-in Force Functions (the student picks from these)
// -----------------------------------------------------------

export const FORCE_LIBRARY: Record<ForceType, {
  name: string;
  is_constant: boolean;
  default_params: Record<string, number>;
  compute: (node: SimNode, env: SimEnvironment, dt: number, params: Record<string, number>) => Vec3;
}> = {

  gravity: {
    name: "Gravity",
    is_constant: true,
    default_params: { g: 9.81, direction_x: 0, direction_y: -1, direction_z: 0 },
    compute: (node, _env, _dt, p) => [
      node.mass * p.g * p.direction_x,
      node.mass * p.g * p.direction_y,
      node.mass * p.g * p.direction_z,
    ],
  },

  friction: {
    name: "Kinetic Friction",
    is_constant: false, // depends on velocity and normal force
    default_params: { mu: 0.3 },
    compute: (node, env, _dt, p) => {
      // Only applies when on surface
      if (!env.surface.enabled) return [0, 0, 0];
      if (node.position[1] > env.surface.y + 0.01) return [0, 0, 0];

      const speed = magnitude(node.velocity);
      if (speed < 0.001) return [0, 0, 0];

      // F_friction = -μ * N * v̂
      // Normal force = mass * g (simplified)
      const N = node.mass * (node.force_accumulator[1] < 0 ? Math.abs(node.force_accumulator[1]) / node.mass : 9.81);
      const friction_mag = p.mu * N;

      return [
        -friction_mag * node.velocity[0] / speed,
        0,
        -friction_mag * node.velocity[2] / speed,
      ];
    },
  },

  air_resistance: {
    name: "Air Resistance (Drag)",
    is_constant: false, // depends on velocity²
    default_params: { cd: 0.47, rho: 1.225, area: 0.1 },
    compute: (node, _env, _dt, p) => {
      // F_drag = -½ρCdAv² * v̂
      const speed = magnitude(node.velocity);
      if (speed < 0.001) return [0, 0, 0];

      const drag_mag = 0.5 * p.rho * p.cd * p.area * speed * speed;

      return [
        -drag_mag * node.velocity[0] / speed,
        -drag_mag * node.velocity[1] / speed,
        -drag_mag * node.velocity[2] / speed,
      ];
    },
  },

  spring: {
    name: "Spring (Hooke's Law)",
    is_constant: true,
    default_params: { k: 10, rest_length: 2.0 },
    compute: (_node, _env, _dt, _p) => {
      // Handled in edge processing, not per-node
      return [0, 0, 0];
    },
  },

  coulomb: {
    name: "Coulomb Repulsion",
    is_constant: true,
    default_params: { k: 50 },
    compute: (_node, _env, _dt, _p) => {
      // Handled in pairwise processing
      return [0, 0, 0];
    },
  },

  drag: {
    name: "Linear Drag",
    is_constant: false,
    default_params: { coefficient: 0.1 },
    compute: (node, _env, _dt, p) => [
      -p.coefficient * node.velocity[0],
      -p.coefficient * node.velocity[1],
      -p.coefficient * node.velocity[2],
    ],
  },

  buoyancy: {
    name: "Buoyancy",
    is_constant: false, // depends on position relative to fluid surface
    default_params: { fluid_density: 1000, fluid_y: 0 },
    compute: (node, _env, _dt, p) => {
      if (node.position[1] >= p.fluid_y) return [0, 0, 0];
      // Simplified: F_b = ρ_fluid * V * g (V approximated from mass/density)
      const submerged_depth = p.fluid_y - node.position[1];
      const volume = node.mass / 1000; // approximate
      return [0, p.fluid_density * volume * 9.81 * Math.min(1, submerged_depth), 0];
    },
  },

  magnetic: {
    name: "Magnetic Field",
    is_constant: true,
    default_params: { Bx: 0, By: 0, Bz: 1, charge_factor: 1 },
    compute: (node, _env, _dt, p) => {
      // F = q(v × B)
      const q = node.charge * p.charge_factor;
      return [
        q * (node.velocity[1] * p.Bz - node.velocity[2] * p.By),
        q * (node.velocity[2] * p.Bx - node.velocity[0] * p.Bz),
        q * (node.velocity[0] * p.By - node.velocity[1] * p.Bx),
      ];
    },
  },

  centripetal: {
    name: "Centripetal Force",
    is_constant: false,
    default_params: { center_x: 0, center_y: 0, center_z: 0, omega: 1 },
    compute: (node, _env, _dt, p) => {
      const dx = node.position[0] - p.center_x;
      const dz = node.position[2] - p.center_z;
      const r = Math.sqrt(dx * dx + dz * dz);
      if (r < 0.01) return [0, 0, 0];
      // F = -mω²r toward center
      const f = -node.mass * p.omega * p.omega * r;
      return [f * dx / r, 0, f * dz / r];
    },
  },

  applied: {
    name: "Applied Force",
    is_constant: true,
    default_params: { fx: 0, fy: 0, fz: 0, target_node: 0 },
    compute: (_node, _env, _dt, p) => [p.fx, p.fy, p.fz],
  },

  custom: {
    name: "Custom Force",
    is_constant: false,
    default_params: {},
    compute: () => [0, 0, 0], // overridden by user
  },
};

// -----------------------------------------------------------
// Simulation Loop
// -----------------------------------------------------------

/**
 * Create initial simulation state from a graph blob.
 */
export function createSimState(
  nodes: GraphNode[],
  edges: { source: string; target: string; stiffness: number; rest_length: number }[]
): SimState {
  return {
    nodes: nodes.map((n) => ({
      ...n,
      force_accumulator: [0, 0, 0],
      acceleration: [0, 0, 0],
      net_force_magnitude: 0,
    })),
    edges,
    environment: {
      surface: { y: 0, normal: [0, 1, 0], enabled: true },
      bounds: null,
      active_rules: [],
      time: 0,
      dt: 1 / 60,
      paused: false,
    },
  };
}

/**
 * Add a force rule to the simulation.
 * Student clicks "add gravity" → this is called.
 */
export function addRule(state: SimState, type: ForceType, paramOverrides?: Record<string, number>): ForceRule {
  const template = FORCE_LIBRARY[type];
  const params = { ...template.default_params, ...paramOverrides };

  const rule: ForceRule = {
    id: `rule_${state.environment.active_rules.length}`,
    name: template.name,
    type,
    enabled: true,
    is_constant: template.is_constant,
    params,
    compute: (node, env, dt) => template.compute(node, env, dt, params),
  };

  state.environment.active_rules.push(rule);
  return rule;
}

/**
 * Remove a force rule.
 */
export function removeRule(state: SimState, ruleId: string): void {
  state.environment.active_rules = state.environment.active_rules.filter((r) => r.id !== ruleId);
}

/**
 * Toggle a rule on/off.
 */
export function toggleRule(state: SimState, ruleId: string): void {
  const rule = state.environment.active_rules.find((r) => r.id === ruleId);
  if (rule) rule.enabled = !rule.enabled;
}

/**
 * Update a rule's parameters.
 */
export function updateRuleParams(state: SimState, ruleId: string, params: Record<string, number>): void {
  const rule = state.environment.active_rules.find((r) => r.id === ruleId);
  if (!rule) return;

  const template = FORCE_LIBRARY[rule.type];
  rule.params = { ...rule.params, ...params };
  rule.compute = (node, env, dt) => template.compute(node, env, dt, rule.params);
}

/**
 * Step the simulation forward by dt.
 *
 * 1. Reset force accumulators
 * 2. Apply all active force rules (per-node)
 * 3. Apply pairwise forces (coulomb, spring)
 * 4. Surface collision
 * 5. Integrate: a = ΣF/m, v += a·dt, p += v·dt
 */
export function step(state: SimState): void {
  if (state.environment.paused) return;

  const { nodes, edges, environment } = state;
  const dt = environment.dt;

  // 1. Reset
  for (const node of nodes) {
    node.force_accumulator = [0, 0, 0];
  }

  // 2. Per-node forces (gravity, friction, drag, applied, etc.)
  for (const node of nodes) {
    if (node.pinned) continue;

    for (const rule of environment.active_rules) {
      if (!rule.enabled) continue;
      if (rule.type === "spring" || rule.type === "coulomb") continue; // pairwise

      const f = rule.compute(node, environment, dt);
      node.force_accumulator[0] += f[0];
      node.force_accumulator[1] += f[1];
      node.force_accumulator[2] += f[2];
    }
  }

  // 3a. Pairwise: Coulomb repulsion
  const coulombRule = environment.active_rules.find((r) => r.type === "coulomb" && r.enabled);
  if (coulombRule) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (a.pinned && b.pinned) continue;

        const dx = a.position[0] - b.position[0];
        const dy = a.position[1] - b.position[1];
        const dz = a.position[2] - b.position[2];
        const distSq = Math.max(0.01, dx * dx + dy * dy + dz * dz);
        const dist = Math.sqrt(distSq);

        const force = coulombRule.params.k * (a.charge * b.charge) / distSq;
        const fx = force * dx / dist;
        const fy = force * dy / dist;
        const fz = force * dz / dist;

        if (!a.pinned) {
          a.force_accumulator[0] += fx;
          a.force_accumulator[1] += fy;
          a.force_accumulator[2] += fz;
        }
        if (!b.pinned) {
          b.force_accumulator[0] -= fx;
          b.force_accumulator[1] -= fy;
          b.force_accumulator[2] -= fz;
        }
      }
    }
  }

  // 3b. Edge forces: Spring (Hooke's law)
  const springRule = environment.active_rules.find((r) => r.type === "spring" && r.enabled);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const edge of edges) {
    const a = nodeMap.get(edge.source);
    const b = nodeMap.get(edge.target);
    if (!a || !b) continue;
    if (a.pinned && b.pinned) continue;

    const k = springRule ? springRule.params.k : edge.stiffness;
    const rest = springRule ? springRule.params.rest_length : edge.rest_length;

    const dx = b.position[0] - a.position[0];
    const dy = b.position[1] - a.position[1];
    const dz = b.position[2] - a.position[2];
    const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));

    const displacement = dist - rest;
    const force = k * displacement;
    const fx = force * dx / dist;
    const fy = force * dy / dist;
    const fz = force * dz / dist;

    if (!a.pinned) {
      a.force_accumulator[0] += fx;
      a.force_accumulator[1] += fy;
      a.force_accumulator[2] += fz;
    }
    if (!b.pinned) {
      b.force_accumulator[0] -= fx;
      b.force_accumulator[1] -= fy;
      b.force_accumulator[2] -= fz;
    }
  }

  // 4. Surface collision + normal force
  if (environment.surface.enabled) {
    for (const node of nodes) {
      if (node.pinned) continue;
      if (node.position[1] <= environment.surface.y) {
        node.position[1] = environment.surface.y;
        // Cancel downward velocity
        if (node.velocity[1] < 0) node.velocity[1] = 0;
        // Normal force cancels downward force component
        if (node.force_accumulator[1] < 0) node.force_accumulator[1] = 0;
      }
    }
  }

  // 5. Integrate (semi-implicit Euler)
  for (const node of nodes) {
    if (node.pinned) {
      node.net_force_magnitude = 0;
      continue;
    }

    // ΔN — net force magnitude for display
    node.net_force_magnitude = magnitude(node.force_accumulator);

    // a = F / m
    node.acceleration = [
      node.force_accumulator[0] / node.mass,
      node.force_accumulator[1] / node.mass,
      node.force_accumulator[2] / node.mass,
    ];

    // v += a · dt
    node.velocity[0] += node.acceleration[0] * dt;
    node.velocity[1] += node.acceleration[1] * dt;
    node.velocity[2] += node.acceleration[2] * dt;

    // p += v · dt
    node.position[0] += node.velocity[0] * dt;
    node.position[1] += node.velocity[1] * dt;
    node.position[2] += node.velocity[2] * dt;

    // Bounds check
    if (environment.bounds) {
      for (let axis = 0; axis < 3; axis++) {
        const limit = environment.bounds[axis];
        if (Math.abs(node.position[axis]) > limit) {
          node.position[axis] = Math.sign(node.position[axis]) * limit;
          node.velocity[axis] *= -0.5; // bounce with energy loss
        }
      }
    }
  }

  environment.time += dt;
}

/**
 * Get a snapshot of all forces acting on a node.
 * For the student to see what each rule contributes.
 */
export function getForceBreakdown(
  node: SimNode,
  env: SimEnvironment
): { rule: string; force: Vec3; magnitude: number }[] {
  const breakdown: { rule: string; force: Vec3; magnitude: number }[] = [];

  for (const rule of env.active_rules) {
    if (!rule.enabled) continue;
    if (rule.type === "spring" || rule.type === "coulomb") continue;

    const f = rule.compute(node, env, env.dt);
    breakdown.push({
      rule: rule.name,
      force: f,
      magnitude: magnitude(f),
    });
  }

  return breakdown;
}

// --- Vector math ---

function magnitude(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}
