import { getDb } from "@/lib/db/connection";
import { getNodesForDiscipline } from "./memory";
import { contextWeight, computeTier } from "./tier";
import {
  DIFFICULTY_MIN,
  DIFFICULTY_MAX,
  type LatticePosition,
  type MemoryTier,
} from "@/lib/types/core";

/**
 * Sigmoid function for smooth difficulty mapping.
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-6 * (x - 0.5)));
}

/**
 * Compute g_u,d(t) — discipline grade derived from memory graph density.
 *
 * g_u,d(t) = Σ(w_c · x_c) / Σ(x_max,c)
 *
 * Where w_c = tier/5 and x_max,c = 90 (permanent threshold).
 * This grounds the lattice position in the actual memory graph state.
 */
export function computeDisciplineGrade(userId: string, disciplineId: string): number {
  const nodes = getNodesForDiscipline(userId, disciplineId);
  if (nodes.length === 0) return 0;

  let weightedSum = 0;
  let maxPossible = 0;

  for (const node of nodes) {
    const w = contextWeight(node.tier as MemoryTier);
    weightedSum += w * node.xp;
    maxPossible += 90; // XP_PERMANENT is the max meaningful XP per node
  }

  if (maxPossible === 0) return 0;
  return Math.min(1, weightedSum / maxPossible);
}

/**
 * Get the active goal for a discipline (latest set goal).
 */
function getGoal(disciplineId: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT target_grade FROM goals WHERE discipline_id = ? ORDER BY set_at DESC LIMIT 1"
  ).get(disciplineId) as { target_grade: number } | undefined;
  return row?.target_grade ?? 1.0;
}

/**
 * Compute full lattice position for a user.
 *
 * P_u(t) ∈ [0,1]^n — one dimension per discipline tab
 * P̂_u ∈ [0,1]^n — goal vector
 * Δ_u(t) = P̂_u - P_u(t) — gap vector
 *
 * Global progress ratio = ||P_u|| / ||P̂_u||
 *
 * Difficulty per discipline:
 * w_u,d(t) = w_min + (w_max - w_min) · σ(g/ĝ · ||P||/||P̂||)
 */
export function computeLattice(userId: string): LatticePosition {
  const db = getDb();

  const disciplines = db.prepare(
    "SELECT id, name FROM disciplines WHERE user_id = ?"
  ).all(userId) as { id: string; name: string }[];

  if (disciplines.length === 0) {
    return {
      user_id: userId,
      dimensions: [],
      global_progress_ratio: 0,
    };
  }

  const dimensions: LatticePosition["dimensions"] = [];

  let positionNormSq = 0;
  let goalNormSq = 0;

  for (const disc of disciplines) {
    const position = computeDisciplineGrade(userId, disc.id);
    const goal = getGoal(disc.id);
    const gap = goal - position;

    positionNormSq += position * position;
    goalNormSq += goal * goal;

    dimensions.push({
      discipline_id: disc.id,
      discipline_name: disc.name,
      position,
      goal,
      gap,
      difficulty: 0, // computed after we have global ratio
    });
  }

  const positionNorm = Math.sqrt(positionNormSq);
  const goalNorm = Math.sqrt(goalNormSq);
  const globalProgressRatio = goalNorm > 0 ? positionNorm / goalNorm : 0;

  // Second pass: compute difficulty using global progress ratio
  for (const dim of dimensions) {
    const localRatio = dim.goal > 0 ? dim.position / dim.goal : 0;
    const input = localRatio * globalProgressRatio;
    dim.difficulty =
      DIFFICULTY_MIN + (DIFFICULTY_MAX - DIFFICULTY_MIN) * sigmoid(input);
  }

  return {
    user_id: userId,
    dimensions,
    global_progress_ratio: globalProgressRatio,
  };
}

/**
 * Get the gap vector magnitude — overall distance to goals.
 * Used by planner: minimize ||Δ_u(t+T)|| over planning horizon.
 */
export function gapMagnitude(lattice: LatticePosition): number {
  let sumSq = 0;
  for (const dim of lattice.dimensions) {
    sumSq += dim.gap * dim.gap;
  }
  return Math.sqrt(sumSq);
}

/**
 * Allocate hours proportional to gap magnitude.
 * h_week,d = H_week · |Δ_d| / ||Δ||₁
 */
export function allocateHours(
  lattice: LatticePosition,
  totalHours: number
): { disciplineId: string; hours: number }[] {
  const l1Norm = lattice.dimensions.reduce(
    (sum, d) => sum + Math.abs(d.gap),
    0
  );

  if (l1Norm === 0) {
    // All goals met — distribute evenly
    const even = totalHours / lattice.dimensions.length;
    return lattice.dimensions.map((d) => ({
      disciplineId: d.discipline_id,
      hours: even,
    }));
  }

  return lattice.dimensions.map((d) => ({
    disciplineId: d.discipline_id,
    hours: totalHours * (Math.abs(d.gap) / l1Norm),
  }));
}
