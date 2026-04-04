import {
  TIER_BOUNDARIES,
  XP_PERMANENT,
  type MemoryTier,
} from "@/lib/types/core";

/**
 * tier(c) — compute tier from XP
 *
 * XP ranges:
 *   [1, 27)   → tier 1 (ephemeral)
 *   [27, 45)  → tier 2 (familiar)
 *   [45, 63)  → tier 3 (established)
 *   [63, 90)  → tier 4 (core)
 *   [90, ∞)   → tier 5 (permanent, no decay)
 */
export function computeTier(xp: number): MemoryTier {
  if (xp >= XP_PERMANENT) return 5;
  if (xp >= TIER_BOUNDARIES[3]) return 4;
  if (xp >= TIER_BOUNDARIES[2]) return 3;
  if (xp >= TIER_BOUNDARIES[1]) return 2;
  return 1;
}

/**
 * Context weight: w_c = tier / 5
 */
export function contextWeight(tier: MemoryTier): number {
  return tier / 5;
}

/**
 * Returns the XP threshold for the tier below current.
 * Used for urgency calculation: urgency = 1 / (xp - boundary_below)
 */
export function tierBoundaryBelow(tier: MemoryTier): number {
  if (tier <= 1) return 0;
  return TIER_BOUNDARIES[tier - 1];
}

/**
 * Check if a node is at demotion risk given projected XP
 */
export function isDemotionRisk(currentXp: number, projectedXp: number): boolean {
  return computeTier(currentXp) > computeTier(projectedXp);
}
