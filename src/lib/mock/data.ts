// ============================================================
// Mock Data — typed seed data for testing and development
//
// Every object here uses the types from core.ts.
// No hardcoded types or inline objects elsewhere in the app.
// Import from here for tests, dev seeding, and storybook.
// ============================================================

import type {
  User,
  Discipline,
  Professor,
  Goal,
  Grade,
  MemoryNode,
  MemoryEdge,
  MemoryEdgeRelation,
  StudySession,
  Plan,
  PlanAllocation,
  Contact,
  ContactPolicy,
  NotificationAction,
  TimeWindow,
  Notification,
  DailyChallenge,
  SkillFile,
  LatticePosition,
} from "@/lib/types/core";

// -----------------------------------------------------------
// Users
// -----------------------------------------------------------

export const MOCK_USERS: User[] = [
  { id: "usr_001", name: "Ana Silva", created_at: 1711929600 },
  { id: "usr_002", name: "Carlos Mendes", created_at: 1711929600 },
  { id: "usr_003", name: "Lucia Torres", created_at: 1712016000 },
];

// -----------------------------------------------------------
// Disciplines (tabs)
// -----------------------------------------------------------

export const MOCK_DISCIPLINES: Discipline[] = [
  { id: "disc_linalg", user_id: "usr_001", name: "Linear Algebra", color: "#4C6EF5", icon: "math", created_at: 1711929600 },
  { id: "disc_physics", user_id: "usr_001", name: "Classical Mechanics", color: "#FA5252", icon: "atom", created_at: 1711929600 },
  { id: "disc_stats", user_id: "usr_001", name: "Statistics", color: "#40C057", icon: "chart-bar", created_at: 1712016000 },
  { id: "disc_compsci", user_id: "usr_001", name: "Data Structures", color: "#FD7E14", icon: "binary-tree", created_at: 1712016000 },
  { id: "disc_calc", user_id: "usr_002", name: "Calculus II", color: "#7950F2", icon: "integral", created_at: 1711929600 },
];

// -----------------------------------------------------------
// Professors
// -----------------------------------------------------------

export const MOCK_PROFESSORS: Professor[] = [
  { id: "prof_001", discipline_id: "disc_linalg", name: "Dr. Elena Vasquez", email: "evasquez@uni.edu", notes: "Office hours Tue/Thu 2-4pm" },
  { id: "prof_002", discipline_id: "disc_physics", name: "Prof. Marco Santini", email: null, notes: "Prefers email, slow to respond" },
  { id: "prof_003", discipline_id: "disc_stats", name: "Dr. Yuki Tanaka", email: "ytanaka@uni.edu", notes: null },
  { id: "prof_004", discipline_id: "disc_compsci", name: "Prof. Ada Okonkwo", email: "aokonkwo@uni.edu", notes: "Very approachable, open door policy" },
];

// -----------------------------------------------------------
// Goals
// -----------------------------------------------------------

export const MOCK_GOALS: Goal[] = [
  { id: "goal_001", discipline_id: "disc_linalg", target_grade: 0.85, set_at: 1711929600 },
  { id: "goal_002", discipline_id: "disc_physics", target_grade: 0.8, set_at: 1711929600 },
  { id: "goal_003", discipline_id: "disc_stats", target_grade: 0.9, set_at: 1712016000 },
  { id: "goal_004", discipline_id: "disc_compsci", target_grade: 0.95, set_at: 1712016000 },
];

// -----------------------------------------------------------
// Grades (historical snapshots)
// -----------------------------------------------------------

export const MOCK_GRADES: Grade[] = [
  { id: "grade_001", discipline_id: "disc_linalg", value: 0.6, source: "diagnostic", recorded_at: 1711929600 },
  { id: "grade_002", discipline_id: "disc_linalg", value: 0.68, source: "assessment", recorded_at: 1712534400 },
  { id: "grade_003", discipline_id: "disc_physics", value: 0.45, source: "diagnostic", recorded_at: 1711929600 },
  { id: "grade_004", discipline_id: "disc_physics", value: 0.52, source: "assessment", recorded_at: 1712534400 },
  { id: "grade_005", discipline_id: "disc_stats", value: 0.7, source: "manual", recorded_at: 1712016000 },
  { id: "grade_006", discipline_id: "disc_compsci", value: 0.82, source: "diagnostic", recorded_at: 1712016000 },
];

// -----------------------------------------------------------
// Memory Nodes
// -----------------------------------------------------------

export const MOCK_MEMORY_NODES: MemoryNode[] = [
  {
    id: "mem_001", user_id: "usr_001", scope: "global", contact_id: null,
    discipline_id: "disc_linalg", tag: "eigenvalue-decomposition",
    label: "Eigenvalue decomposition and diagonalization",
    xp: 47, tier: 3, created_at: 1711929600, last_bumped_at: 1712880000,
  },
  {
    id: "mem_002", user_id: "usr_001", scope: "global", contact_id: null,
    discipline_id: "disc_linalg", tag: "matrix-multiplication",
    label: "Matrix multiplication and composition of transformations",
    xp: 72, tier: 4, created_at: 1711929600, last_bumped_at: 1713052800,
  },
  {
    id: "mem_003", user_id: "usr_001", scope: "global", contact_id: null,
    discipline_id: "disc_linalg", tag: "eigenvector-basis-confusion",
    label: "Distinction between eigenvectors and basis vectors",
    xp: 15, tier: 1, created_at: 1712534400, last_bumped_at: 1712534400,
  },
  {
    id: "mem_004", user_id: "usr_001", scope: "global", contact_id: null,
    discipline_id: "disc_physics", tag: "newtons-second-law",
    label: "Newton's second law and free body diagrams",
    xp: 91, tier: 5, created_at: 1711929600, last_bumped_at: 1713052800,
  },
  {
    id: "mem_005", user_id: "usr_001", scope: "global", contact_id: null,
    discipline_id: "disc_physics", tag: "angular-momentum",
    label: "Angular momentum conservation in rotational systems",
    xp: 30, tier: 2, created_at: 1712016000, last_bumped_at: 1712620800,
  },
  {
    id: "mem_006", user_id: "usr_001", scope: "global", contact_id: null,
    discipline_id: "disc_stats", tag: "bayes-theorem",
    label: "Bayes theorem and conditional probability",
    xp: 55, tier: 3, created_at: 1712016000, last_bumped_at: 1712880000,
  },
  {
    id: "mem_007", user_id: "usr_001", scope: "global", contact_id: null,
    discipline_id: "disc_compsci", tag: "binary-search-tree",
    label: "Binary search tree insertion and balancing",
    xp: 88, tier: 4, created_at: 1712016000, last_bumped_at: 1713139200,
  },
  // Contact-scoped memory (isolated)
  {
    id: "mem_008", user_id: "usr_001", scope: "contact", contact_id: "contact_001",
    discipline_id: "disc_linalg", tag: "carlos-linalg-struggle",
    label: "Carlos struggles with eigenvalues, responds well to geometric intuition",
    xp: 22, tier: 1, created_at: 1712534400, last_bumped_at: 1712620800,
  },
];

// -----------------------------------------------------------
// Memory Edges
// -----------------------------------------------------------

export const MOCK_MEMORY_EDGES: MemoryEdge[] = [
  { id: "edge_001", source_id: "mem_002", target_id: "mem_001", relation: "prerequisite", weight: 0.9, label: "Must understand multiplication before decomposition" },
  { id: "edge_002", source_id: "mem_003", target_id: "mem_001", relation: "clarifies", weight: 0.7, label: "Common confusion point" },
  { id: "edge_003", source_id: "mem_001", target_id: "mem_006", relation: "applies_to", weight: 0.5, label: "Matrix methods in statistical estimation" },
  { id: "edge_004", source_id: "mem_004", target_id: "mem_005", relation: "prerequisite", weight: 0.85, label: "Newton's laws ground angular momentum" },
  { id: "edge_005", source_id: "mem_007", target_id: "mem_002", relation: "supports", weight: 0.4, label: "Tree structures use matrix representations" },
  { id: "edge_006", source_id: "mem_006", target_id: "mem_005", relation: "method", weight: 0.3, label: "Probabilistic analysis of angular measurement error" },
];

// -----------------------------------------------------------
// Study Sessions
// -----------------------------------------------------------

export const MOCK_SESSIONS: StudySession[] = [
  {
    id: "sess_001", user_id: "usr_001", discipline_id: "disc_linalg",
    skill_file: "socratic-drill.md", status: "completed",
    started_at: 1712880000, ended_at: 1712885400, duration_seconds: 5400,
    self_assessment: 0.7, ai_assessment: 0.6,
    combined_score: (1.5 * 0.7 + 0.75 * 0.6) / 2.25, // 0.667
  },
  {
    id: "sess_002", user_id: "usr_001", discipline_id: "disc_physics",
    skill_file: "feynman-technique.md", status: "completed",
    started_at: 1712966400, ended_at: 1712970000, duration_seconds: 3600,
    self_assessment: 0.5, ai_assessment: 0.4,
    combined_score: (1.5 * 0.5 + 0.75 * 0.4) / 2.25, // 0.467
  },
  {
    id: "sess_003", user_id: "usr_001", discipline_id: "disc_compsci",
    skill_file: null, status: "active",
    started_at: 1713052800, ended_at: null, duration_seconds: null,
    self_assessment: null, ai_assessment: null, combined_score: null,
  },
];

// -----------------------------------------------------------
// Plans
// -----------------------------------------------------------

export const MOCK_PLANS: Plan[] = [
  { id: "plan_001", user_id: "usr_001", granularity: "weekly", period_start: 1712793600, period_end: 1713398400, created_at: 1712793600 },
];

export const MOCK_PLAN_ALLOCATIONS: PlanAllocation[] = [
  { id: "alloc_001", plan_id: "plan_001", discipline_id: "disc_linalg", planned_hours: 6, actual_hours: 1.5, skill_file: "socratic-drill.md" },
  { id: "alloc_002", plan_id: "plan_001", discipline_id: "disc_physics", planned_hours: 8, actual_hours: 1.0, skill_file: "feynman-technique.md" },
  { id: "alloc_003", plan_id: "plan_001", discipline_id: "disc_stats", planned_hours: 4, actual_hours: 0, skill_file: null },
  { id: "alloc_004", plan_id: "plan_001", discipline_id: "disc_compsci", planned_hours: 2, actual_hours: 0.5, skill_file: null },
];

// -----------------------------------------------------------
// Contacts & Policies
// -----------------------------------------------------------

export const MOCK_CONTACTS: Contact[] = [
  { id: "contact_001", user_id: "usr_001", contact_user_id: "usr_002", display_name: "Carlos Mendes", created_at: 1711929600 },
  { id: "contact_002", user_id: "usr_001", contact_user_id: "usr_003", display_name: "Lucia Torres", created_at: 1712016000 },
];

const ALLOWED_SCHEDULE: NotificationAction[] = ["schedule_session", "study_invite"];
const ALLOWED_FULL: NotificationAction[] = ["schedule_session", "share_notes", "ask_question", "study_invite"];
const BLOCKED_EXCHANGE: NotificationAction[] = ["skill_exchange"];
const WEEKDAY_WINDOWS: TimeWindow[] = [
  { day_of_week: 1, start_hour: 9, end_hour: 21 },
  { day_of_week: 2, start_hour: 9, end_hour: 21 },
  { day_of_week: 3, start_hour: 9, end_hour: 21 },
  { day_of_week: 4, start_hour: 9, end_hour: 21 },
  { day_of_week: 5, start_hour: 9, end_hour: 18 },
];

export const MOCK_CONTACT_POLICIES: ContactPolicy[] = [
  {
    id: "policy_001", contact_id: "contact_001",
    allowed_actions: ALLOWED_FULL,
    blocked_actions: [],
    time_windows: WEEKDAY_WINDOWS,
  },
  {
    id: "policy_002", contact_id: "contact_002",
    allowed_actions: ALLOWED_SCHEDULE,
    blocked_actions: BLOCKED_EXCHANGE,
    time_windows: WEEKDAY_WINDOWS,
  },
];

// -----------------------------------------------------------
// Notifications
// -----------------------------------------------------------

export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "notif_001", user_id: "usr_001", contact_id: "contact_001",
    action: "study_invite", content: "Carlos's AI wants to schedule a Linear Algebra study session for Thursday 3pm",
    urgency: 0.8, delivery: "push", handled: false, created_at: 1713052800,
  },
  {
    id: "notif_002", user_id: "usr_001", contact_id: "contact_002",
    action: "share_notes", content: "Lucia's AI shared notes on Bayes theorem",
    urgency: 0.3, delivery: "queue", handled: false, created_at: 1713052800,
  },
];

// -----------------------------------------------------------
// Daily Challenges
// -----------------------------------------------------------

export const MOCK_DAILY_CHALLENGES: DailyChallenge[] = [
  {
    id: "chal_001", user_id: "usr_001", memory_node_id: "mem_003",
    discipline_id: "disc_linalg",
    question: "What distinguishes an eigenvector from a basis vector? Give an example where a basis vector is not an eigenvector.",
    difficulty: 0.1, urgency: 3.5, status: "pending",
    ignore_count: 0, created_at: 1713139200, responded_at: null,
  },
  {
    id: "chal_002", user_id: "usr_001", memory_node_id: "mem_005",
    discipline_id: "disc_physics",
    question: "A figure skater pulls their arms in during a spin. Explain what happens to angular velocity and why, using conservation of angular momentum.",
    difficulty: 0.35, urgency: 2.1, status: "pending",
    ignore_count: 1, created_at: 1713139200, responded_at: null,
  },
  {
    id: "chal_003", user_id: "usr_001", memory_node_id: "mem_006",
    discipline_id: "disc_stats",
    question: "A medical test has 95% sensitivity and 90% specificity. If the disease prevalence is 1%, what is the probability a positive test is a true positive?",
    difficulty: 0.55, urgency: 1.2, status: "pending",
    ignore_count: 0, created_at: 1713139200, responded_at: null,
  },
];

// -----------------------------------------------------------
// Skill Files (metadata only — content is in .md files)
// -----------------------------------------------------------

export const MOCK_SKILL_FILES: SkillFile[] = [
  {
    id: "skill_001", filename: "socratic-drill.md",
    name: "Socratic Drill", description: "Guided questioning workflow",
    dimension_mask: JSON.stringify(["disc_linalg", "disc_stats"]),
    difficulty_min: 0.2, difficulty_max: 0.9,
    mermaid_source: "graph TD\n    A[assess_current_level] --> B[generate_question]",
  },
  {
    id: "skill_002", filename: "spaced-repetition.md",
    name: "Spaced Repetition Drill", description: "Flashcard review tuned to decay rates",
    dimension_mask: JSON.stringify([]),
    difficulty_min: 0.1, difficulty_max: 0.7,
    mermaid_source: "graph TD\n    A[select_decaying_nodes] --> B[format_as_flashcard]",
  },
  {
    id: "skill_003", filename: "feynman-technique.md",
    name: "Feynman Technique", description: "Explain to learn, find gaps",
    dimension_mask: JSON.stringify(["disc_physics", "disc_compsci"]),
    difficulty_min: 0.3, difficulty_max: 1.0,
    mermaid_source: "graph TD\n    A[select_concept] --> B[prompt_explanation]",
  },
];

// -----------------------------------------------------------
// Precomputed Lattice Position (for UI testing)
// -----------------------------------------------------------

export const MOCK_LATTICE: LatticePosition = {
  user_id: "usr_001",
  dimensions: [
    { discipline_id: "disc_linalg", discipline_name: "Linear Algebra", position: 0.42, goal: 0.85, gap: 0.43, difficulty: 0.38 },
    { discipline_id: "disc_physics", discipline_name: "Classical Mechanics", position: 0.28, goal: 0.80, gap: 0.52, difficulty: 0.30 },
    { discipline_id: "disc_stats", discipline_name: "Statistics", position: 0.55, goal: 0.90, gap: 0.35, difficulty: 0.45 },
    { discipline_id: "disc_compsci", discipline_name: "Data Structures", position: 0.78, goal: 0.95, gap: 0.17, difficulty: 0.68 },
  ],
  global_progress_ratio: 0.58,
};
