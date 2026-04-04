import { getDb } from "@/lib/db/connection";
import { generateId } from "@/lib/utils/id";
import { computeLattice, allocateHours, gapMagnitude } from "./lattice";
import type { Plan, PlanAllocation, PlanGranularity, LatticePosition } from "@/lib/types/core";

/**
 * Create a plan with auto-allocated hours based on gap vector.
 *
 * Monthly: min ||Δ_u(t+30)|| given H_month
 * Weekly:  h_d = H_week · |Δ_d| / ||Δ||₁
 * Daily:   concrete session slots
 */
export function createPlan(
  userId: string,
  granularity: PlanGranularity,
  periodStart: number,
  periodEnd: number,
  totalHours: number
): { plan: Plan; allocations: PlanAllocation[] } {
  const db = getDb();
  const lattice = computeLattice(userId);

  const planId = generateId();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO plans (id, user_id, granularity, period_start, period_end, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(planId, userId, granularity, periodStart, periodEnd, now);

  const hourAllocations = allocateHours(lattice, totalHours);
  const allocations: PlanAllocation[] = [];

  for (const alloc of hourAllocations) {
    const allocId = generateId();
    db.prepare(`
      INSERT INTO plan_allocations (id, plan_id, discipline_id, planned_hours, actual_hours)
      VALUES (?, ?, ?, ?, 0)
    `).run(allocId, planId, alloc.disciplineId, alloc.hours);

    allocations.push({
      id: allocId,
      plan_id: planId,
      discipline_id: alloc.disciplineId,
      planned_hours: alloc.hours,
      actual_hours: 0,
      skill_file: null,
    });
  }

  const plan: Plan = {
    id: planId,
    user_id: userId,
    granularity,
    period_start: periodStart,
    period_end: periodEnd,
    created_at: now,
  };

  return { plan, allocations };
}

/**
 * Check replan trigger.
 *
 * Fires when |H_actual - H_planned| / H_planned > γ for any discipline.
 */
export function checkReplanTrigger(
  planId: string,
  gamma: number = 0.3
): { shouldReplan: boolean; driftingDisciplines: string[] } {
  const db = getDb();

  const allocations = db.prepare(
    "SELECT * FROM plan_allocations WHERE plan_id = ?"
  ).all(planId) as PlanAllocation[];

  const drifting: string[] = [];

  for (const alloc of allocations) {
    if (alloc.planned_hours === 0) continue;
    const drift = Math.abs(alloc.actual_hours - alloc.planned_hours) / alloc.planned_hours;
    if (drift > gamma) {
      drifting.push(alloc.discipline_id);
    }
  }

  return { shouldReplan: drifting.length > 0, driftingDisciplines: drifting };
}

/**
 * Get active plan for a user at a given granularity.
 */
export function getActivePlan(
  userId: string,
  granularity: PlanGranularity
): { plan: Plan; allocations: PlanAllocation[] } | null {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const plan = db.prepare(`
    SELECT * FROM plans
    WHERE user_id = ? AND granularity = ? AND period_start <= ? AND period_end >= ?
    ORDER BY created_at DESC LIMIT 1
  `).get(userId, granularity, now, now) as Plan | undefined;

  if (!plan) return null;

  const allocations = db.prepare(
    "SELECT * FROM plan_allocations WHERE plan_id = ?"
  ).all(plan.id) as PlanAllocation[];

  return { plan, allocations };
}
