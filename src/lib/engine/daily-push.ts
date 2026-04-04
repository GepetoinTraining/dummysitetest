import { getDb } from "@/lib/db/connection";
import { generateId } from "@/lib/utils/id";
import { getSlippingNodes } from "./memory";
import { tierBoundaryBelow } from "./tier";
import { DAILY_PUSH_MAX_CHALLENGES, DAILY_PUSH_LOOKAHEAD_DAYS } from "@/lib/types/core";
import type { DailyChallenge, MemoryNode, MemoryTier } from "@/lib/types/core";

/**
 * Detect slipping nodes and generate daily challenges.
 *
 * 1. Scan for nodes at demotion risk: tier(x_c) > tier(x_c - β·Δt_lookahead)
 * 2. Rank by urgency: 1 / (x_c - x_boundary_below)
 * 3. Filter out nodes with ignore_count > η
 * 4. Take top-k
 * 5. Generate mini-challenges
 */
export function generateDailyPush(
  userId: string,
  beta: number = 0.5,
  ignoreThreshold: number = 5
): DailyChallenge[] {
  const db = getDb();

  const slipping = getSlippingNodes(userId, beta, DAILY_PUSH_LOOKAHEAD_DAYS);
  if (slipping.length === 0) return [];

  // Check ignore counts from previous challenges for these nodes
  const ignoreMap = new Map<string, number>();
  for (const node of slipping) {
    const row = db.prepare(`
      SELECT COALESCE(MAX(ignore_count), 0) as count
      FROM daily_challenges
      WHERE memory_node_id = ? AND user_id = ?
    `).get(node.id, userId) as { count: number };
    ignoreMap.set(node.id, row.count);
  }

  // Filter out over-ignored nodes
  const candidates = slipping.filter(
    (n) => (ignoreMap.get(n.id) ?? 0) < ignoreThreshold
  );

  // Rank by urgency: 1 / (xp - boundary_below)
  const ranked = candidates
    .map((node) => {
      const boundary = tierBoundaryBelow(node.tier as MemoryTier);
      const distance = Math.max(0.1, node.xp - boundary);
      return { node, urgency: 1 / distance };
    })
    .sort((a, b) => b.urgency - a.urgency)
    .slice(0, DAILY_PUSH_MAX_CHALLENGES);

  // Create challenges
  const now = Math.floor(Date.now() / 1000);
  const challenges: DailyChallenge[] = [];

  for (const { node, urgency } of ranked) {
    const id = generateId();

    // Difficulty calibrated to current tier (not where it was)
    const difficulty = 0.1 + 0.9 * ((node.tier - 1) / 4);

    const challenge: DailyChallenge = {
      id,
      user_id: userId,
      memory_node_id: node.id,
      discipline_id: node.discipline_id,
      question: "", // To be filled by Gemma based on the node's tag/label
      difficulty,
      urgency,
      status: "pending",
      ignore_count: ignoreMap.get(node.id) ?? 0,
      created_at: now,
      responded_at: null,
    };

    db.prepare(`
      INSERT INTO daily_challenges (id, user_id, memory_node_id, discipline_id, question, difficulty, urgency, status, ignore_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(id, userId, node.id, node.discipline_id, challenge.question, difficulty, urgency, challenge.ignore_count, now);

    challenges.push(challenge);
  }

  return challenges;
}

/**
 * Mark a challenge as completed (student engaged).
 * This triggers a tag bump on the underlying memory node.
 */
export function completeChallenge(challengeId: string): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    UPDATE daily_challenges SET status = 'completed', responded_at = ? WHERE id = ?
  `).run(now, challengeId);
}

/**
 * Mark a challenge as ignored. Increment ignore_count.
 * If count > η, AI deprioritizes future pushes for this node.
 */
export function ignoreChallenge(challengeId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE daily_challenges SET status = 'ignored', ignore_count = ignore_count + 1 WHERE id = ?
  `).run(challengeId);
}

/**
 * Get today's pending challenges for a user.
 */
export function getTodayChallenges(userId: string): DailyChallenge[] {
  const db = getDb();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const epoch = Math.floor(startOfDay.getTime() / 1000);

  return db.prepare(`
    SELECT * FROM daily_challenges
    WHERE user_id = ? AND created_at >= ? AND status = 'pending'
    ORDER BY urgency DESC
  `).all(userId, epoch) as DailyChallenge[];
}
