import { getDb } from "@/lib/db/connection";
import { generateId } from "@/lib/utils/id";
import { ASSESSMENT_WEIGHT_SELF, ASSESSMENT_WEIGHT_AI, ASSESSMENT_WEIGHT_TOTAL } from "@/lib/types/core";
import type { StudySession } from "@/lib/types/core";

/**
 * Start a new study session — clock begins.
 */
export function startSession(userId: string, disciplineId: string, skillFile?: string): StudySession {
  const db = getDb();
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO study_sessions (id, user_id, discipline_id, skill_file, status, started_at)
    VALUES (?, ?, ?, ?, 'active', ?)
  `).run(id, userId, disciplineId, skillFile ?? null, now);

  return {
    id,
    user_id: userId,
    discipline_id: disciplineId,
    skill_file: skillFile ?? null,
    status: "active",
    started_at: now,
    ended_at: null,
    duration_seconds: null,
    self_assessment: null,
    ai_assessment: null,
    combined_score: null,
  };
}

/**
 * End a session and compute dual assessment.
 *
 * r = (1.5 · r_self + 0.75 · r_ai) / 2.25
 *
 * Student weighted 2x the AI.
 */
export function endSession(
  sessionId: string,
  selfAssessment: number,
  aiAssessment: number
): StudySession | null {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const session = db.prepare(
    "SELECT * FROM study_sessions WHERE id = ?"
  ).get(sessionId) as StudySession | undefined;

  if (!session) return null;

  const duration = now - session.started_at;
  const combined =
    (ASSESSMENT_WEIGHT_SELF * selfAssessment + ASSESSMENT_WEIGHT_AI * aiAssessment) /
    ASSESSMENT_WEIGHT_TOTAL;

  db.prepare(`
    UPDATE study_sessions
    SET status = 'completed',
        ended_at = ?,
        duration_seconds = ?,
        self_assessment = ?,
        ai_assessment = ?,
        combined_score = ?
    WHERE id = ?
  `).run(now, duration, selfAssessment, aiAssessment, combined, sessionId);

  // Update actual hours in any matching plan allocation
  const hours = duration / 3600;
  db.prepare(`
    UPDATE plan_allocations
    SET actual_hours = actual_hours + ?
    WHERE discipline_id = ?
      AND plan_id IN (
        SELECT p.id FROM plans p
        JOIN study_sessions s ON s.user_id = p.user_id
        WHERE s.id = ? AND p.period_start <= ? AND p.period_end >= ?
      )
  `).run(hours, session.discipline_id, sessionId, now, now);

  return {
    ...session,
    status: "completed",
    ended_at: now,
    duration_seconds: duration,
    self_assessment: selfAssessment,
    ai_assessment: aiAssessment,
    combined_score: combined,
  };
}

/**
 * Get active session for a user (at most one at a time).
 */
export function getActiveSession(userId: string): StudySession | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM study_sessions WHERE user_id = ? AND status = 'active' LIMIT 1"
  ).get(userId) as StudySession | undefined;
  return row ?? null;
}

/**
 * Get total clocked hours for a discipline.
 * H_actual,d(t) = Σ T_session for all completed sessions in d
 */
export function getTotalHours(userId: string, disciplineId: string): number {
  const db = getDb();
  const row = db.prepare(`
    SELECT COALESCE(SUM(duration_seconds), 0) as total
    FROM study_sessions
    WHERE user_id = ? AND discipline_id = ? AND status = 'completed'
  `).get(userId, disciplineId) as { total: number };
  return row.total / 3600;
}
