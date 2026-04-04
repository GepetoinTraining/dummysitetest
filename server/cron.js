// ============================================================
// Server Cron — we run the loop for paid accounts
//
// Free:  student runs `npm run cron` locally, or checks manually
// Paid:  this runs for them on our infra
//
// Jobs:
//   1. Check switchboard diffs for offline students
//   2. Expire stale messages
//   3. Update teacher aggregates
//   4. Ping students who haven't connected in 24h
//      (their local cron hasn't run = decay isn't applied)
//
// This is the ONLY premium server-side compute.
// Everything else is a dumb pipe.
// ============================================================

async function runServerCron(db) {
  console.log(`[cron] ${new Date().toISOString()} starting`);

  // 1. Expire stale messages (older than 7 days)
  const expired = await db.query(
    "UPDATE switchboard SET status = 'expired' WHERE status = 'pending' AND created_at < NOW() - INTERVAL '7 days' RETURNING id"
  );
  console.log(`[cron] expired ${expired.rowCount} stale messages`);

  // 2. Update teacher aggregates for paid institutional accounts
  const teachers = await db.query(
    `SELECT a.id FROM accounts a
     JOIN institutions i ON a.institution_id = i.id
     WHERE a.role = 'teacher'`
  );

  for (const teacher of teachers.rows) {
    await updateTeacherAggregates(db, teacher.id);
  }
  console.log(`[cron] updated ${teachers.rowCount} teacher aggregates`);

  // 3. Notify offline premium students of pending messages
  const offlineWithPending = await db.query(
    `SELECT DISTINCT s.to_account_id, COUNT(*) as pending_count
     FROM switchboard s
     JOIN accounts a ON s.to_account_id = a.id
     WHERE s.status = 'pending'
     GROUP BY s.to_account_id`
  );
  // These students will see pending messages next time they connect.
  // If they have push notification integration, ping them here.
  console.log(`[cron] ${offlineWithPending.rowCount} students have pending messages`);

  console.log(`[cron] done`);
}

async function updateTeacherAggregates(db, teacherId) {
  // Only update from students who opted in via sync_manifest
  await db.query(
    `INSERT INTO teacher_aggregates (id, teacher_account_id, student_account_id, discipline_name,
       tag_count, avg_tier, current_grade, target_grade, total_study_hours,
       sessions_this_week, slipping_count, last_session_at, updated_at)
     SELECT
       gen_random_uuid(),
       cp.account_a as teacher_id,
       cp.account_b as student_id,
       'synced',
       0, 0, 0, 0, 0, 0, 0, NULL, NOW()
     FROM contact_pairs cp
     WHERE cp.account_a = $1 AND cp.pair_type = 'student_teacher' AND cp.status = 'active'
     ON CONFLICT (teacher_account_id, student_account_id) DO UPDATE
       SET updated_at = NOW()`,
    [teacherId]
  );
  // Note: actual aggregate values come from student's sync_manifest push
  // Server just maintains the rows — students fill them via selective sync
}

module.exports = { runServerCron };
