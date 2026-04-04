// ============================================================
// Teacher AI — server-side, big model, full class in context
//
// Students get local Gemma E2B (2B params).
// Teachers get 70B on our infra. Paid tier.
//
// The teacher AI can:
//   - Hold 30+ students' lattice positions in context
//   - Spot class-wide patterns (everyone struggling with topic X)
//   - Generate class-level study plans
//   - Identify complementary student pairs for study groups
//   - Detect grade trajectory anomalies
//   - Prepare exam review materials from aggregate struggles
//   - Answer "how is my class doing?" with real data
//
// The teacher AI never sees raw student data.
// It sees aggregates from teacher_aggregates table.
// Students control what's shared via sync_manifest.
// ============================================================

// Teacher AI context builder — assembles what the 70B sees

async function buildTeacherContext(db, teacherAccountId) {
  // Get all students who opted in
  const students = await db.query(
    `SELECT ta.student_account_id, ta.discipline_name,
            ta.tag_count, ta.avg_tier, ta.current_grade, ta.target_grade,
            ta.total_study_hours, ta.sessions_this_week, ta.slipping_count,
            ta.last_session_at
     FROM teacher_aggregates ta
     WHERE ta.teacher_account_id = $1
     ORDER BY ta.discipline_name, ta.current_grade`,
    [teacherAccountId]
  );

  if (students.rows.length === 0) {
    return { context: 'No students have shared their data yet.', stats: null };
  }

  // Build class summary
  const byDiscipline = {};
  for (const s of students.rows) {
    const d = s.discipline_name;
    if (!byDiscipline[d]) byDiscipline[d] = [];
    byDiscipline[d].push(s);
  }

  const parts = ['You are a teacher AI assistant. Here is your class data.\n'];

  for (const [disc, roster] of Object.entries(byDiscipline)) {
    const grades = roster.map(s => s.current_grade).filter(Boolean);
    const avgGrade = grades.length > 0 ? grades.reduce((a, b) => a + b) / grades.length : 0;
    const slipping = roster.filter(s => s.slipping_count > 0).length;
    const inactive = roster.filter(s => s.sessions_this_week === 0).length;

    parts.push(`## ${disc}`);
    parts.push(`Students: ${roster.length} | Avg grade: ${(avgGrade * 100).toFixed(0)}% | Slipping: ${slipping} | Inactive this week: ${inactive}`);
    parts.push('');

    // Per-student summary (anonymous ID, not name — teacher maps locally)
    for (let i = 0; i < roster.length; i++) {
      const s = roster[i];
      const status = s.slipping_count > 0 ? '⚠' : s.sessions_this_week > 0 ? '●' : '○';
      parts.push(`${status} Student ${i + 1}: grade ${((s.current_grade || 0) * 100).toFixed(0)}% → goal ${((s.target_grade || 0.8) * 100).toFixed(0)}% | ${s.tag_count || 0} tags (avg T${(s.avg_tier || 0).toFixed(1)}) | ${(s.total_study_hours || 0).toFixed(1)}h total | ${s.sessions_this_week || 0} sessions/wk`);
    }

    parts.push('');
  }

  // Class-wide patterns
  const allSlipping = students.rows.filter(s => s.slipping_count > 0);
  const allInactive = students.rows.filter(s => s.sessions_this_week === 0);

  if (allSlipping.length > 0 || allInactive.length > 0) {
    parts.push('## Alerts');
    if (allSlipping.length > 0) parts.push(`${allSlipping.length} students have knowledge at demotion risk`);
    if (allInactive.length > 0) parts.push(`${allInactive.length} students had no sessions this week`);
  }

  return {
    context: parts.join('\n'),
    stats: {
      total_students: students.rows.length,
      disciplines: Object.keys(byDiscipline),
      avg_grade: students.rows.reduce((a, s) => a + (s.current_grade || 0), 0) / students.rows.length,
      total_slipping: allSlipping.length,
      total_inactive: allInactive.length,
    },
  };
}

// Study group recommendations — find complementary pairs
async function recommendStudyGroups(db, teacherAccountId, disciplineName) {
  const students = await db.query(
    `SELECT student_account_id, current_grade, avg_tier, tag_count
     FROM teacher_aggregates
     WHERE teacher_account_id = $1 AND discipline_name = $2
     ORDER BY current_grade`,
    [teacherAccountId, disciplineName]
  );

  if (students.rows.length < 2) return [];

  const roster = students.rows;
  const pairs = [];

  // Pair strong with weak — maximize variance (our group study formula)
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const a = roster[i];
      const b = roster[j];
      const gradeGap = Math.abs((a.current_grade || 0) - (b.current_grade || 0));
      const tierGap = Math.abs((a.avg_tier || 0) - (b.avg_tier || 0));

      // Good pair = high grade gap (peer teaching) + tier gap (different strengths)
      const value = gradeGap * 0.6 + tierGap * 0.4;

      if (value > 0.15) {
        pairs.push({
          student_a: i + 1, // anonymous index
          student_b: j + 1,
          value,
          stronger: (a.current_grade || 0) > (b.current_grade || 0) ? i + 1 : j + 1,
        });
      }
    }
  }

  return pairs.sort((a, b) => b.value - a.value).slice(0, 10);
}

// Detect anomalies — grade trajectories that don't match effort
async function detectAnomalies(db, teacherAccountId) {
  const students = await db.query(
    `SELECT student_account_id, discipline_name,
            current_grade, target_grade, total_study_hours,
            sessions_this_week, slipping_count, avg_tier
     FROM teacher_aggregates
     WHERE teacher_account_id = $1`,
    [teacherAccountId]
  );

  const anomalies = [];

  for (const s of students.rows) {
    // High effort, low grade — might be studying wrong
    if ((s.total_study_hours || 0) > 10 && (s.current_grade || 0) < 0.4) {
      anomalies.push({
        student: s.student_account_id,
        discipline: s.discipline_name,
        type: 'high_effort_low_grade',
        detail: `${s.total_study_hours.toFixed(1)}h studied but grade at ${(s.current_grade * 100).toFixed(0)}%`,
      });
    }

    // Low effort, knowledge decaying — might need intervention
    if ((s.sessions_this_week || 0) === 0 && (s.slipping_count || 0) > 3) {
      anomalies.push({
        student: s.student_account_id,
        discipline: s.discipline_name,
        type: 'inactive_decaying',
        detail: `No sessions this week, ${s.slipping_count} tags at demotion risk`,
      });
    }

    // Grade far from goal with little time left (if we know exam dates)
    const gap = (s.target_grade || 0.8) - (s.current_grade || 0);
    if (gap > 0.3 && (s.avg_tier || 0) < 2.5) {
      anomalies.push({
        student: s.student_account_id,
        discipline: s.discipline_name,
        type: 'at_risk',
        detail: `${(gap * 100).toFixed(0)}% gap to goal, avg knowledge tier ${(s.avg_tier || 0).toFixed(1)}`,
      });
    }
  }

  return anomalies;
}

module.exports = {
  buildTeacherContext,
  recommendStudyGroups,
  detectAnomalies,
};
