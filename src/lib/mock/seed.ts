// ============================================================
// Database Seeder — populates SQLite with mock data for testing
//
// Run: npm run db:seed
// ============================================================

import { initDb, getDb, closeDb } from "@/lib/db/connection";
import {
  MOCK_USERS,
  MOCK_DISCIPLINES,
  MOCK_PROFESSORS,
  MOCK_GOALS,
  MOCK_GRADES,
  MOCK_MEMORY_NODES,
  MOCK_MEMORY_EDGES,
  MOCK_SESSIONS,
  MOCK_PLANS,
  MOCK_PLAN_ALLOCATIONS,
  MOCK_CONTACTS,
  MOCK_CONTACT_POLICIES,
  MOCK_NOTIFICATIONS,
  MOCK_DAILY_CHALLENGES,
  MOCK_SKILL_FILES,
} from "./data";

export function seedDatabase(): void {
  initDb();
  const db = getDb();

  const tx = db.transaction(() => {
    // Users
    const insUser = db.prepare("INSERT OR IGNORE INTO users (id, name, created_at) VALUES (?, ?, ?)");
    for (const u of MOCK_USERS) insUser.run(u.id, u.name, u.created_at);

    // Disciplines
    const insDisc = db.prepare("INSERT OR IGNORE INTO disciplines (id, user_id, name, color, icon, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    for (const d of MOCK_DISCIPLINES) insDisc.run(d.id, d.user_id, d.name, d.color, d.icon, d.created_at);

    // Professors
    const insProf = db.prepare("INSERT OR IGNORE INTO professors (id, discipline_id, name, email, notes) VALUES (?, ?, ?, ?, ?)");
    for (const p of MOCK_PROFESSORS) insProf.run(p.id, p.discipline_id, p.name, p.email, p.notes);

    // Goals
    const insGoal = db.prepare("INSERT OR IGNORE INTO goals (id, discipline_id, target_grade, set_at) VALUES (?, ?, ?, ?)");
    for (const g of MOCK_GOALS) insGoal.run(g.id, g.discipline_id, g.target_grade, g.set_at);

    // Grades
    const insGrade = db.prepare("INSERT OR IGNORE INTO grades (id, discipline_id, value, source, recorded_at) VALUES (?, ?, ?, ?, ?)");
    for (const g of MOCK_GRADES) insGrade.run(g.id, g.discipline_id, g.value, g.source, g.recorded_at);

    // Contacts (must come before memory_nodes that reference them)
    const insContact = db.prepare("INSERT OR IGNORE INTO contacts (id, user_id, contact_user_id, display_name, created_at) VALUES (?, ?, ?, ?, ?)");
    for (const c of MOCK_CONTACTS) insContact.run(c.id, c.user_id, c.contact_user_id, c.display_name, c.created_at);

    // Contact Policies
    const insPolicy = db.prepare("INSERT OR IGNORE INTO contact_policies (id, contact_id, allowed_actions, blocked_actions, time_windows) VALUES (?, ?, ?, ?, ?)");
    for (const p of MOCK_CONTACT_POLICIES) insPolicy.run(p.id, p.contact_id, JSON.stringify(p.allowed_actions), JSON.stringify(p.blocked_actions), JSON.stringify(p.time_windows));

    // Memory Nodes
    const insNode = db.prepare("INSERT OR IGNORE INTO memory_nodes (id, user_id, scope, contact_id, discipline_id, tag, label, xp, tier, created_at, last_bumped_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const n of MOCK_MEMORY_NODES) insNode.run(n.id, n.user_id, n.scope, n.contact_id, n.discipline_id, n.tag, n.label, n.xp, n.tier, n.created_at, n.last_bumped_at);

    // Memory Edges
    const insEdge = db.prepare("INSERT OR IGNORE INTO memory_edges (id, source_id, target_id, relation, weight, label) VALUES (?, ?, ?, ?, ?, ?)");
    for (const e of MOCK_MEMORY_EDGES) insEdge.run(e.id, e.source_id, e.target_id, e.relation, e.weight, e.label);

    // Study Sessions
    const insSess = db.prepare("INSERT OR IGNORE INTO study_sessions (id, user_id, discipline_id, skill_file, status, started_at, ended_at, duration_seconds, self_assessment, ai_assessment, combined_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const s of MOCK_SESSIONS) insSess.run(s.id, s.user_id, s.discipline_id, s.skill_file, s.status, s.started_at, s.ended_at, s.duration_seconds, s.self_assessment, s.ai_assessment, s.combined_score);

    // Plans
    const insPlan = db.prepare("INSERT OR IGNORE INTO plans (id, user_id, granularity, period_start, period_end, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    for (const p of MOCK_PLANS) insPlan.run(p.id, p.user_id, p.granularity, p.period_start, p.period_end, p.created_at);

    // Plan Allocations
    const insAlloc = db.prepare("INSERT OR IGNORE INTO plan_allocations (id, plan_id, discipline_id, planned_hours, actual_hours, skill_file) VALUES (?, ?, ?, ?, ?, ?)");
    for (const a of MOCK_PLAN_ALLOCATIONS) insAlloc.run(a.id, a.plan_id, a.discipline_id, a.planned_hours, a.actual_hours, a.skill_file);

    // Notifications
    const insNotif = db.prepare("INSERT OR IGNORE INTO notifications (id, user_id, contact_id, action, content, urgency, delivery, handled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const n of MOCK_NOTIFICATIONS) insNotif.run(n.id, n.user_id, n.contact_id, n.action, n.content, n.urgency, n.delivery, n.handled ? 1 : 0, n.created_at);

    // Daily Challenges
    const insChal = db.prepare("INSERT OR IGNORE INTO daily_challenges (id, user_id, memory_node_id, discipline_id, question, difficulty, urgency, status, ignore_count, created_at, responded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const c of MOCK_DAILY_CHALLENGES) insChal.run(c.id, c.user_id, c.memory_node_id, c.discipline_id, c.question, c.difficulty, c.urgency, c.status, c.ignore_count, c.created_at, c.responded_at);

    // Skill Files
    const insSkill = db.prepare("INSERT OR IGNORE INTO skill_files (id, filename, name, description, dimension_mask, difficulty_min, difficulty_max, mermaid_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const s of MOCK_SKILL_FILES) insSkill.run(s.id, s.filename, s.name, s.description, s.dimension_mask, s.difficulty_min, s.difficulty_max, s.mermaid_source);
  });

  tx();
  console.log("Database seeded with mock data.");
}

// Run directly
seedDatabase();
closeDb();
