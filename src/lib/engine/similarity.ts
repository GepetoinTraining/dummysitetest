// ============================================================
// Nightly Similarity Evaluation
//
// Runs as a scheduled job. The AI evaluates cross-discipline
// proximity from structural signals and persists the scores.
//
// These scores are ground truth — when an ML embedder is added
// later, we benchmark it against these evaluated distances.
// No guessing at proximity. We measure it.
//
// Three signals:
//   1. Edge density: memory edges crossing between disciplines
//   2. Grade correlation: do grades move together over time
//   3. Tag overlap: Jaccard similarity of tags
// ============================================================

import { getDb } from "@/lib/db/connection";
import { generateId } from "@/lib/utils/id";

export interface SimilarityScore {
  id: string;
  user_id: string;
  disc_a: string;
  disc_b: string;
  edge_density: number;
  grade_correlation: number;
  tag_overlap: number;
  combined: number;
  evaluated_at: number;
}

// -----------------------------------------------------------
// Nightly evaluation — runs for all users
// -----------------------------------------------------------

/**
 * Run the full nightly similarity evaluation for a user.
 * Computes all pairwise discipline scores and persists them.
 */
export function evaluateSimilarity(userId: string): SimilarityScore[] {
  const db = getDb();

  const disciplines = db.prepare(
    "SELECT id FROM disciplines WHERE user_id = ?"
  ).all(userId) as { id: string }[];

  const scores: SimilarityScore[] = [];
  const now = Math.floor(Date.now() / 1000);

  const upsert = db.prepare(`
    INSERT INTO similarity_scores (id, user_id, disc_a, disc_b, edge_density, grade_correlation, tag_overlap, combined, evaluated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, disc_a, disc_b)
    DO UPDATE SET edge_density = ?, grade_correlation = ?, tag_overlap = ?, combined = ?, evaluated_at = ?
  `);

  const tx = db.transaction(() => {
    for (let i = 0; i < disciplines.length; i++) {
      for (let j = i + 1; j < disciplines.length; j++) {
        const discA = disciplines[i].id;
        const discB = disciplines[j].id;

        const edge = crossDisciplineEdgeDensity(userId, discA, discB);
        const corr = gradeCorrelation(userId, discA, discB);
        const tags = tagOverlap(userId, discA, discB);
        const combined = 0.5 * edge + 0.3 * corr + 0.2 * tags;

        const id = generateId();

        upsert.run(
          id, userId, discA, discB,
          edge, corr, tags, combined, now,
          edge, corr, tags, combined, now
        );

        scores.push({
          id, user_id: userId,
          disc_a: discA, disc_b: discB,
          edge_density: edge, grade_correlation: corr,
          tag_overlap: tags, combined,
          evaluated_at: now,
        });
      }
    }
  });

  tx();
  return scores;
}

/**
 * Run nightly evaluation for ALL users.
 */
export function evaluateAllUsers(): Map<string, SimilarityScore[]> {
  const db = getDb();
  const users = db.prepare("SELECT id FROM users").all() as { id: string }[];
  const results = new Map<string, SimilarityScore[]>();

  for (const user of users) {
    results.set(user.id, evaluateSimilarity(user.id));
  }

  return results;
}

// -----------------------------------------------------------
// Read persisted scores (for UI, bridge finding, etc.)
// -----------------------------------------------------------

/**
 * Get the latest evaluated similarity scores for a user.
 * These are the source of truth — never compute on the fly.
 */
export function getScores(
  userId: string,
  epsilon: number = 0.15
): SimilarityScore[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM similarity_scores
    WHERE user_id = ? AND combined > ?
    ORDER BY combined DESC
  `).all(userId, epsilon) as SimilarityScore[];
}

/**
 * Get similarity between two specific disciplines.
 */
export function getScore(
  userId: string,
  discA: string,
  discB: string
): SimilarityScore | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM similarity_scores
    WHERE user_id = ? AND ((disc_a = ? AND disc_b = ?) OR (disc_a = ? AND disc_b = ?))
  `).get(userId, discA, discB, discB, discA) as SimilarityScore | undefined;
  return row ?? null;
}

/**
 * Find bridge opportunities from persisted scores.
 * A bridge = strong discipline connected to weak discipline.
 */
export function findBridges(
  userId: string,
  gaps: Map<string, number>,
  epsilon: number = 0.15
): { strong: string; weak: string; similarity: number }[] {
  const scores = getScores(userId, epsilon);
  const bridges: { strong: string; weak: string; similarity: number }[] = [];

  for (const score of scores) {
    const gapA = gaps.get(score.disc_a) ?? 0;
    const gapB = gaps.get(score.disc_b) ?? 0;

    if (gapA < 0 && gapB > 0) {
      bridges.push({ strong: score.disc_a, weak: score.disc_b, similarity: score.combined });
    } else if (gapB < 0 && gapA > 0) {
      bridges.push({ strong: score.disc_b, weak: score.disc_a, similarity: score.combined });
    }
  }

  return bridges;
}

// -----------------------------------------------------------
// Signal computation (internal — called during nightly eval)
// -----------------------------------------------------------

function crossDisciplineEdgeDensity(
  userId: string,
  discA: string,
  discB: string
): number {
  const db = getDb();

  const nodesA = db.prepare(
    "SELECT id FROM memory_nodes WHERE user_id = ? AND discipline_id = ? AND scope = 'global'"
  ).all(userId, discA) as { id: string }[];

  const nodesB = db.prepare(
    "SELECT id FROM memory_nodes WHERE user_id = ? AND discipline_id = ? AND scope = 'global'"
  ).all(userId, discB) as { id: string }[];

  if (nodesA.length === 0 || nodesB.length === 0) return 0;

  const idsA = new Set(nodesA.map((n) => n.id));
  const idsB = new Set(nodesB.map((n) => n.id));
  const allIds = [...idsA, ...idsB];

  const placeholders = allIds.map(() => "?").join(",");
  const edges = db.prepare(`
    SELECT source_id, target_id FROM memory_edges
    WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})
  `).all(...allIds, ...allIds) as { source_id: string; target_id: string }[];

  if (edges.length === 0) return 0;

  let crossEdges = 0;
  for (const edge of edges) {
    const crossAB = idsA.has(edge.source_id) && idsB.has(edge.target_id);
    const crossBA = idsB.has(edge.source_id) && idsA.has(edge.target_id);
    if (crossAB || crossBA) crossEdges++;
  }

  return Math.min(1, crossEdges / edges.length);
}

function gradeCorrelation(
  userId: string,
  discA: string,
  discB: string
): number {
  const db = getDb();

  const gradesA = db.prepare(
    "SELECT value FROM grades WHERE discipline_id = ? ORDER BY recorded_at"
  ).all(discA) as { value: number }[];

  const gradesB = db.prepare(
    "SELECT value FROM grades WHERE discipline_id = ? ORDER BY recorded_at"
  ).all(discB) as { value: number }[];

  if (gradesA.length < 2 || gradesB.length < 2) return 0;

  const deltasA = deltas(gradesA.map((g) => g.value));
  const deltasB = deltas(gradesB.map((g) => g.value));

  const len = Math.min(deltasA.length, deltasB.length);
  if (len === 0) return 0;

  return Math.abs(pearson(deltasA.slice(0, len), deltasB.slice(0, len)));
}

function tagOverlap(
  userId: string,
  discA: string,
  discB: string
): number {
  const db = getDb();

  const tagsA = new Set(
    (db.prepare(
      "SELECT DISTINCT tag FROM memory_nodes WHERE user_id = ? AND discipline_id = ? AND scope = 'global'"
    ).all(userId, discA) as { tag: string }[]).map((t) => t.tag)
  );

  const tagsB = new Set(
    (db.prepare(
      "SELECT DISTINCT tag FROM memory_nodes WHERE user_id = ? AND discipline_id = ? AND scope = 'global'"
    ).all(userId, discB) as { tag: string }[]).map((t) => t.tag)
  );

  if (tagsA.size === 0 && tagsB.size === 0) return 0;

  let intersection = 0;
  for (const tag of tagsA) {
    if (tagsB.has(tag)) intersection++;
  }

  const union = tagsA.size + tagsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// --- Math utilities ---

function deltas(values: number[]): number[] {
  return values.slice(1).map((v, i) => v - values[i]);
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n === 0) return 0;

  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
    sumAB += a[i] * b[i];
    sumA2 += a[i] * a[i];
    sumB2 += b[i] * b[i];
  }

  const num = n * sumAB - sumA * sumB;
  const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));

  return den === 0 ? 0 : num / den;
}
