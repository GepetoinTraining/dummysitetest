-- ============================================================
-- StudySync SQLite3 Schema
-- Relational + Graph tables in a single sovereign DB
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------
-- CORE ENTITIES
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS disciplines (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#4C6EF5',
    icon TEXT NOT NULL DEFAULT 'book',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_disciplines_user ON disciplines(user_id);

CREATE TABLE IF NOT EXISTS professors (
    id TEXT PRIMARY KEY,
    discipline_id TEXT NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    notes TEXT
);

-- -----------------------------------------------------------
-- GRADES & GOALS
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    discipline_id TEXT NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
    target_grade REAL NOT NULL CHECK (target_grade >= 0 AND target_grade <= 1),
    set_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Only one active goal per discipline (latest wins)
CREATE INDEX IF NOT EXISTS idx_goals_discipline ON goals(discipline_id, set_at DESC);

CREATE TABLE IF NOT EXISTS grades (
    id TEXT PRIMARY KEY,
    discipline_id TEXT NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
    value REAL NOT NULL CHECK (value >= 0 AND value <= 1),
    source TEXT NOT NULL CHECK (source IN ('assessment', 'manual', 'diagnostic')),
    recorded_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_grades_discipline ON grades(discipline_id, recorded_at DESC);

-- -----------------------------------------------------------
-- MEMORY GRAPH (Graph-in-SQL pattern)
-- -----------------------------------------------------------

-- Nodes: each is a concept extracted from chat
CREATE TABLE IF NOT EXISTS memory_nodes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('contact', 'global')),
    contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    discipline_id TEXT REFERENCES disciplines(id) ON DELETE SET NULL,
    tag TEXT NOT NULL,
    label TEXT NOT NULL,
    xp REAL NOT NULL DEFAULT 1,
    tier INTEGER NOT NULL DEFAULT 1 CHECK (tier >= 1 AND tier <= 5),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_bumped_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_memory_user ON memory_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory_nodes(user_id, scope);
CREATE INDEX IF NOT EXISTS idx_memory_contact ON memory_nodes(user_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_memory_discipline ON memory_nodes(user_id, discipline_id);
CREATE INDEX IF NOT EXISTS idx_memory_tag ON memory_nodes(user_id, tag);
CREATE INDEX IF NOT EXISTS idx_memory_tier ON memory_nodes(user_id, tier);
CREATE INDEX IF NOT EXISTS idx_memory_xp ON memory_nodes(user_id, xp);

-- Edges: relationships between concepts
CREATE TABLE IF NOT EXISTS memory_edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
    relation TEXT NOT NULL CHECK (relation IN (
        'supports', 'clarifies', 'method', 'contradicts', 'prerequisite', 'applies_to'
    )),
    weight REAL NOT NULL DEFAULT 0.5 CHECK (weight >= 0 AND weight <= 1),
    label TEXT,
    UNIQUE(source_id, target_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON memory_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON memory_edges(target_id);

-- -----------------------------------------------------------
-- STUDY SESSIONS
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS study_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    discipline_id TEXT NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
    skill_file TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    started_at INTEGER NOT NULL DEFAULT (unixepoch()),
    ended_at INTEGER,
    duration_seconds INTEGER,
    self_assessment REAL CHECK (self_assessment IS NULL OR (self_assessment >= 0 AND self_assessment <= 1)),
    ai_assessment REAL CHECK (ai_assessment IS NULL OR (ai_assessment >= 0 AND ai_assessment <= 1)),
    combined_score REAL CHECK (combined_score IS NULL OR (combined_score >= 0 AND combined_score <= 1))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON study_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_discipline ON study_sessions(discipline_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON study_sessions(user_id, status);

-- -----------------------------------------------------------
-- PLANNER
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granularity TEXT NOT NULL CHECK (granularity IN ('monthly', 'weekly', 'daily')),
    period_start INTEGER NOT NULL,
    period_end INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_plans_user ON plans(user_id, granularity, period_start);

CREATE TABLE IF NOT EXISTS plan_allocations (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    discipline_id TEXT NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
    planned_hours REAL NOT NULL DEFAULT 0,
    actual_hours REAL NOT NULL DEFAULT 0,
    skill_file TEXT
);

CREATE INDEX IF NOT EXISTS idx_allocations_plan ON plan_allocations(plan_id);

-- -----------------------------------------------------------
-- CONTACTS & POLICIES
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, contact_user_id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);

CREATE TABLE IF NOT EXISTS contact_policies (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
    allowed_actions TEXT NOT NULL DEFAULT '[]',  -- JSON array of NotificationAction
    blocked_actions TEXT NOT NULL DEFAULT '[]',  -- JSON array of NotificationAction
    time_windows TEXT NOT NULL DEFAULT '[]'      -- JSON array of TimeWindow
);

-- -----------------------------------------------------------
-- NOTIFICATIONS
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    content TEXT NOT NULL,
    urgency REAL NOT NULL DEFAULT 0.5 CHECK (urgency >= 0 AND urgency <= 1),
    delivery TEXT NOT NULL CHECK (delivery IN ('block', 'push', 'queue', 'ai_handle')),
    handled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, handled);

-- -----------------------------------------------------------
-- DAILY PUSH / SLIP DETECTION
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS daily_challenges (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    memory_node_id TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
    discipline_id TEXT REFERENCES disciplines(id) ON DELETE SET NULL,
    question TEXT NOT NULL,
    difficulty REAL NOT NULL,
    urgency REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'ignored')),
    ignore_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    responded_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_challenges_user ON daily_challenges(user_id, status);

-- -----------------------------------------------------------
-- SKILL FILES (metadata registry for .md workflows)
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS skill_files (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    dimension_mask TEXT NOT NULL DEFAULT '[]',   -- JSON array of discipline IDs
    difficulty_min REAL NOT NULL DEFAULT 0.1,
    difficulty_max REAL NOT NULL DEFAULT 1.0,
    mermaid_source TEXT NOT NULL DEFAULT ''
);

-- -----------------------------------------------------------
-- CHAT HISTORY (for memory extraction)
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT REFERENCES study_sessions(id) ON DELETE SET NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id, created_at);

-- -----------------------------------------------------------
-- VECTOR STORAGE (future — placeholder for sqlite-vec)
-- -----------------------------------------------------------

-- When sqlite-vec is integrated, embeddings go here.
-- For now, this is a stub to show the schema direction.
CREATE TABLE IF NOT EXISTS embeddings (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN ('memory_node', 'discipline', 'skill', 'note')),
    source_id TEXT NOT NULL,
    vector BLOB,  -- will be sqlite-vec float32 array
    model TEXT NOT NULL DEFAULT 'gemma-4-e2b',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_embeddings_source ON embeddings(source_type, source_id);

-- -----------------------------------------------------------
-- API KEYS (encrypted at rest for optional external providers)
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai', 'google')),
    key_hash TEXT NOT NULL,        -- SHA-256 hash for identification
    encrypted_key TEXT NOT NULL,   -- AES-256-GCM encrypted
    salt TEXT NOT NULL,            -- PBKDF2 salt (hex)
    iv TEXT NOT NULL,              -- AES IV (hex)
    auth_tag TEXT NOT NULL,        -- GCM auth tag (hex)
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, provider)
);

-- -----------------------------------------------------------
-- USER SETTINGS (ollama config, preferences)
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ollama_host TEXT NOT NULL DEFAULT 'http://localhost:11434',
    ollama_model TEXT NOT NULL DEFAULT 'gemma4:12b',
    urgency_threshold REAL NOT NULL DEFAULT 0.7,
    decay_beta REAL NOT NULL DEFAULT 0.5,
    learning_rate REAL NOT NULL DEFAULT 0.3,
    daily_push_enabled INTEGER NOT NULL DEFAULT 1,
    daily_push_time TEXT NOT NULL DEFAULT '09:00',
    daily_push_max INTEGER NOT NULL DEFAULT 5
);
