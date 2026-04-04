// ============================================================
// StudySync Core Types — derived from mathematical specification
// ============================================================

// --- Constants ---

export const TIER_BOUNDARIES = [1, 27, 45, 63, 90] as const;
export const TIER_PERMANENT = 5;
export const XP_PERMANENT = 90;

export const DIFFICULTY_MIN = 0.1; // w_min
export const DIFFICULTY_MAX = 1.0; // w_max

export const ASSESSMENT_WEIGHT_SELF = 1.5;
export const ASSESSMENT_WEIGHT_AI = 0.75;
export const ASSESSMENT_WEIGHT_TOTAL = ASSESSMENT_WEIGHT_SELF + ASSESSMENT_WEIGHT_AI; // 2.25

export const DAILY_PUSH_MAX_CHALLENGES = 5; // k
export const DAILY_PUSH_LOOKAHEAD_DAYS = 7; // Δt_lookahead

// --- Enums ---

export type MemoryTier = 1 | 2 | 3 | 4 | 5;

export type MemoryEdgeRelation =
  | "supports"
  | "clarifies"
  | "method"
  | "contradicts"
  | "prerequisite"
  | "applies_to";

export type MemoryScope = "contact" | "global";

export type NotificationAction =
  | "schedule_session"
  | "share_notes"
  | "ask_question"
  | "skill_exchange"
  | "study_invite";

export type NotificationDelivery = "block" | "push" | "queue" | "ai_handle";

export type SessionStatus = "active" | "paused" | "completed";

export type PlanGranularity = "monthly" | "weekly" | "daily";

export type ChallengeStatus = "pending" | "completed" | "ignored";

// --- Core Entities ---

export interface User {
  id: string;
  name: string;
  created_at: number;
}

export interface Discipline {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string;
  created_at: number;
}

export interface Professor {
  id: string;
  discipline_id: string;
  name: string;
  email: string | null;
  notes: string | null;
}

export interface Goal {
  id: string;
  discipline_id: string;
  target_grade: number; // ĝ_u,d ∈ [0, 1]
  set_at: number;
}

export interface Grade {
  id: string;
  discipline_id: string;
  value: number; // g_u,d(t) ∈ [0, 1]
  source: "assessment" | "manual" | "diagnostic";
  recorded_at: number;
}

// --- Memory Graph (nodes + edges in SQLite) ---

export interface MemoryNode {
  id: string;
  user_id: string;
  scope: MemoryScope;
  contact_id: string | null; // null = global, else scoped to contact
  discipline_id: string | null;
  tag: string; // unique tag for bump detection
  label: string; // human-readable central idea
  xp: number; // experience points
  tier: MemoryTier; // derived from xp via TIER_BOUNDARIES
  created_at: number;
  last_bumped_at: number;
}

export interface MemoryEdge {
  id: string;
  source_id: string; // memory node id
  target_id: string; // memory node id
  relation: MemoryEdgeRelation;
  weight: number; // [0, 1]
  label: string | null; // edge annotation
}

// --- Study Sessions ---

export interface StudySession {
  id: string;
  user_id: string;
  discipline_id: string;
  skill_file: string | null; // path to .md workflow used
  status: SessionStatus;
  started_at: number;
  ended_at: number | null;
  duration_seconds: number | null; // T_session
  self_assessment: number | null; // r_self ∈ [0, 1]
  ai_assessment: number | null; // r_ai ∈ [0, 1]
  combined_score: number | null; // r = (1.5·r_self + 0.75·r_ai) / 2.25
}

// --- Planner ---

export interface Plan {
  id: string;
  user_id: string;
  granularity: PlanGranularity;
  period_start: number; // epoch start of month/week/day
  period_end: number;
  created_at: number;
}

export interface PlanAllocation {
  id: string;
  plan_id: string;
  discipline_id: string;
  planned_hours: number; // h_week,d or h_day,d
  actual_hours: number; // H_actual,d (updated as sessions complete)
  skill_file: string | null;
}

// --- Contacts & Policies ---

export interface Contact {
  id: string;
  user_id: string;
  contact_user_id: string;
  display_name: string;
  created_at: number;
}

export interface ContactPolicy {
  id: string;
  contact_id: string;
  allowed_actions: NotificationAction[];
  blocked_actions: NotificationAction[];
  time_windows: TimeWindow[]; // when contact's agent can interrupt
}

export interface TimeWindow {
  day_of_week: number; // 0-6
  start_hour: number; // 0-23
  end_hour: number; // 0-23
}

// --- Notifications ---

export interface Notification {
  id: string;
  user_id: string;
  contact_id: string | null;
  action: NotificationAction;
  content: string;
  urgency: number; // ρ(m) ∈ [0, 1]
  delivery: NotificationDelivery;
  handled: boolean;
  created_at: number;
}

// --- Daily Push / Slip Detection ---

export interface DailyChallenge {
  id: string;
  user_id: string;
  memory_node_id: string;
  discipline_id: string;
  question: string;
  difficulty: number; // w calibrated to current tier
  urgency: number; // 1 / (x_c - x_boundary)
  status: ChallengeStatus;
  ignore_count: number;
  created_at: number;
  responded_at: number | null;
}

// --- Skill Files ---

export interface SkillFile {
  id: string;
  filename: string; // e.g., "socratic-drill.md"
  name: string;
  description: string;
  dimension_mask: string; // JSON array of discipline IDs this skill applies to
  difficulty_min: number;
  difficulty_max: number;
  mermaid_source: string; // the raw mermaid graph
}

// --- Lattice (computed, not stored) ---

export interface LatticePosition {
  user_id: string;
  dimensions: {
    discipline_id: string;
    discipline_name: string;
    position: number; // g_u,d(t) — derived from memory graph density
    goal: number; // ĝ_u,d
    gap: number; // Δ = goal - position
    difficulty: number; // w_u,d(t)
  }[];
  global_progress_ratio: number; // ||P_u|| / ||P̂_u||
}
