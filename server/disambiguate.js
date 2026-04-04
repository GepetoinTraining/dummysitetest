// ============================================================
// Disambiguation — two Mr. Carters? No problem.
//
// When a teacher claims a shadow and multiple shadows match
// the same name + institution, we don't guess. We ask.
//
// "Has Student X taken your class?"
// "Is Student Y your student right now?"
//
// The lattice differences do the rest. Two Mr. Carters
// teach different disciplines, have different students,
// different grade distributions. The shadows are different
// shapes. We just need the teacher to confirm which shape
// is theirs.
// ============================================================

async function findShadowCandidates(db, teacherName, institutionId) {
  const normalized = teacherName.toLowerCase().trim().replace(/\s+/g, ' ');

  const candidates = await db.query(
    `SELECT tm.*, sd.name_normalized as discipline_hint,
            sd.student_count as disc_student_count,
            sd.avg_grade as disc_avg_grade
     FROM teacher_manifold tm
     LEFT JOIN shadow_disciplines sd ON tm.discipline_hint = sd.name_normalized
       AND (tm.institution_id = sd.institution_id OR sd.institution_id IS NULL)
     WHERE tm.teacher_name_normalized = $1
       AND (tm.institution_id = $2 OR tm.institution_id IS NULL)
       AND tm.claimed_by IS NULL
     ORDER BY tm.student_count DESC`,
    [normalized, institutionId]
  );

  return candidates.rows;
}

// Build disambiguation questions from the shadow differences
async function buildQuestions(db, candidates) {
  if (candidates.length <= 1) return null; // no ambiguity

  const questions = [];

  for (const candidate of candidates) {
    const metadata = JSON.parse(candidate.reported_metadata || '{}');
    const struggles = JSON.parse(candidate.common_struggles || '[]');

    // Pull sample student references (anonymous — just initials + year)
    const studentHints = await db.query(
      `SELECT cp.created_at, a.grade_level
       FROM contact_pairs cp
       JOIN accounts a ON cp.account_b = a.id
       WHERE cp.account_a = $1 AND cp.pair_type = 'student_teacher'
       ORDER BY cp.created_at DESC LIMIT 5`,
      [candidate.id]
    );

    // Build questions unique to this shadow
    const q = {
      shadow_id: candidate.id,
      discipline_hint: candidate.discipline_hint,
      student_count: candidate.student_count,
      questions: [],
    };

    // Discipline question
    if (candidate.discipline_hint) {
      q.questions.push({
        type: 'confirm',
        text: `Do you teach ${candidate.discipline_hint}?`,
        key: 'discipline',
      });
    }

    // Student count question
    if (candidate.student_count > 0) {
      q.questions.push({
        type: 'confirm',
        text: `Do you currently have approximately ${candidate.student_count} students using StudySync?`,
        key: 'student_count',
      });
    }

    // Teaching style question (from student reports)
    if (metadata.teaching_style && metadata.teaching_style.length > 0) {
      const mostCommon = mode(metadata.teaching_style);
      q.questions.push({
        type: 'confirm',
        text: `Would you describe your teaching style as "${mostCommon}"?`,
        key: 'teaching_style',
      });
    }

    // Struggle topic question
    if (struggles.length > 0) {
      q.questions.push({
        type: 'confirm',
        text: `Are your students currently struggling with "${struggles[0]}"?`,
        key: 'struggle_topic',
      });
    }

    // Grade level question
    if (studentHints.rows.length > 0) {
      const levels = studentHints.rows.map(s => s.grade_level).filter(Boolean);
      if (levels.length > 0) {
        const commonLevel = mode(levels);
        q.questions.push({
          type: 'confirm',
          text: `Do you teach ${formatGradeLevel(commonLevel)} students?`,
          key: 'grade_level',
        });
      }
    }

    questions.push(q);
  }

  return questions;
}

// Score answers against candidates — highest score wins
function scoreAnswers(questions, answers) {
  // answers = { shadow_id: { discipline: true, student_count: false, ... } }
  const scores = [];

  for (const q of questions) {
    const shadowAnswers = answers[q.shadow_id] || {};
    let score = 0;
    let total = q.questions.length;

    for (const question of q.questions) {
      if (shadowAnswers[question.key] === true) score++;
    }

    scores.push({
      shadow_id: q.shadow_id,
      score,
      total,
      confidence: total > 0 ? score / total : 0,
    });
  }

  scores.sort((a, b) => b.confidence - a.confidence);

  // Clear winner = confidence > 0.7 AND gap > 0.3 to second place
  if (scores.length >= 2) {
    const gap = scores[0].confidence - scores[1].confidence;
    if (scores[0].confidence > 0.7 && gap > 0.3) {
      return { match: scores[0].shadow_id, confidence: scores[0].confidence, ambiguous: false };
    }
  }

  if (scores.length === 1 && scores[0].confidence > 0.5) {
    return { match: scores[0].shadow_id, confidence: scores[0].confidence, ambiguous: false };
  }

  // Still ambiguous — need more questions or manual review
  return { match: null, confidence: 0, ambiguous: true, scores };
}

// --- Utils ---

function mode(arr) {
  const counts = {};
  for (const v of arr) {
    counts[v] = (counts[v] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function formatGradeLevel(level) {
  if (!level) return 'unknown level';
  if (level === 'K') return 'kindergarten';
  const n = parseInt(level);
  if (!isNaN(n) && n <= 12) return `grade ${n}`;
  if (level === 'university') return 'university';
  if (level === 'postgrad') return 'postgraduate';
  return level;
}

// -----------------------------------------------------------
// Teacher-to-teacher disambiguation
// -----------------------------------------------------------

// When a new teacher signs up and matches an existing name,
// ask the ALREADY CLAIMED teacher: "Is this you or someone else?"
// The existing teacher is the oracle. One question. Done.

async function peerDisambiguate(db, newTeacherName, institutionId) {
  const normalized = newTeacherName.toLowerCase().trim().replace(/\s+/g, ' ');

  // Find already-claimed teachers with the same name
  const claimedPeers = await db.query(
    `SELECT tm.claimed_by, a.display_name, tm.discipline_hint
     FROM teacher_manifold tm
     JOIN accounts a ON tm.claimed_by = a.id
     WHERE tm.teacher_name_normalized = $1
       AND (tm.institution_id = $2 OR tm.institution_id IS NULL)
       AND tm.claimed_by IS NOT NULL`,
    [normalized, institutionId]
  );

  if (claimedPeers.rows.length === 0) return null;

  // Ask each existing Mr. Carter: "Is this new person you?"
  // Send via switchboard to their AI
  const disambigRequests = claimedPeers.rows.map(peer => ({
    to_account_id: peer.claimed_by,
    channel: 'disambiguate',
    question: `A new teacher named "${newTeacherName}" is joining from your institution. Is this you on a new device, or a different person?`,
    options: ['me_new_device', 'different_person'],
  }));

  return disambigRequests;
}

// Process the peer's answer
async function processPeerAnswer(db, existingTeacherId, newShadowId, answer) {
  if (answer === 'me_new_device') {
    // Chain the new cert to the existing teacher's identity
    return { action: 'chain_device', existing_account: existingTeacherId };
  }

  if (answer === 'different_person') {
    // Confirmed different — new shadow is a separate person
    // Mark in manifold so we never ask again
    await db.query(
      `UPDATE teacher_manifold
       SET reported_metadata = jsonb_set(
         COALESCE(reported_metadata::jsonb, '{}'::jsonb),
         '{confirmed_different_from}',
         to_jsonb(array_append(
           COALESCE((reported_metadata::jsonb->>'confirmed_different_from')::text[], ARRAY[]::text[]),
           $1
         ))
       )
       WHERE id = $2`,
      [existingTeacherId, newShadowId]
    );

    return { action: 'separate_identity', shadow_id: newShadowId };
  }

  return { action: 'unknown' };
}

module.exports = {
  findShadowCandidates,
  buildQuestions,
  scoreAnswers,
  peerDisambiguate,
  processPeerAnswer,
};
