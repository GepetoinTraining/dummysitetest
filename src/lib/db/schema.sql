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
    category TEXT NOT NULL DEFAULT 'general',   -- maps to dict domain
    metadata TEXT NOT NULL DEFAULT '{}',         -- JSON blob: the student's full context dump
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- metadata blob schema (open-ended, student adds what they want):
-- {
--   "syllabus": "free text or pasted syllabus",
--   "schedule": "MWF 10am-11am, Room 302",
--   "textbook": "Stewart Calculus 9th Ed",
--   "resources": ["url1", "url2"],
--   "exam_dates": ["2026-04-15", "2026-05-20"],
--   "grading_policy": "40% exams, 30% homework, 20% project, 10% participation",
--   "prerequisites": ["Calculus I", "Linear Algebra"],
--   "office_hours": "Tue/Thu 2-4pm, Room 410",
--   "ta_name": "Maria Santos",
--   "ta_email": "msantos@uni.edu",
--   "difficulty_feeling": "hard but interesting",
--   "notes": "anything the student wants the AI to know",
--   ... anything else, open schema
-- }

CREATE INDEX IF NOT EXISTS idx_disciplines_user ON disciplines(user_id);

CREATE TABLE IF NOT EXISTS professors (
    id TEXT PRIMARY KEY,
    discipline_id TEXT NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',  -- JSON blob: personality, teaching style, preferences
    -- {
    --   "teaching_style": "lecture-heavy, few examples",
    --   "personality": "strict but fair",
    --   "preferred_contact": "email only",
    --   "grading_tendency": "harsh on proofs, lenient on computation",
    --   "exam_style": "mixed theory and practice",
    --   "likes": "students who show work",
    --   "dislikes": "late submissions",
    --   "notes": "free text from student observations",
    --   ... anything, open schema
    -- }
    notes TEXT  -- legacy, keep for backwards compat
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
-- CONTEXT LEDGER (rolling Mermaid-compressed conversation)
-- -----------------------------------------------------------

-- Each turn gets compressed into a Mermaid schema.
-- The AI's context = the Mermaid graph + last 3 raw turns.
-- Rolling buffer of 350 slots — oldest gets evicted.
-- The Mermaid schema preserves structural meaning at ~10x
-- compression vs raw text.

CREATE TABLE IF NOT EXISTS context_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT REFERENCES study_sessions(id) ON DELETE SET NULL,
    slot INTEGER NOT NULL,           -- 0-349, wraps around
    turn_number INTEGER NOT NULL,    -- absolute turn counter
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    raw_content TEXT NOT NULL,       -- original message (kept for last 3 query)
    mermaid_schema TEXT NOT NULL,    -- compressed Mermaid extraction
    central_idea TEXT NOT NULL,      -- one-line summary
    tags TEXT NOT NULL DEFAULT '[]', -- JSON array of memory tags touched
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_slot ON context_ledger(user_id, session_id, slot);
CREATE INDEX IF NOT EXISTS idx_ledger_turn ON context_ledger(user_id, session_id, turn_number DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_tags ON context_ledger(user_id, tags);

-- -----------------------------------------------------------
-- NIGHTLY SIMILARITY SCORES (AI-evaluated ground truth)
-- -----------------------------------------------------------

-- The AI evaluates discipline proximity nightly using structural
-- signals (edge density, grade correlation, tag overlap).
-- These persisted scores are the ground truth. When an ML embedder
-- is added later, we benchmark it against these scores.

CREATE TABLE IF NOT EXISTS similarity_scores (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    disc_a TEXT NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
    disc_b TEXT NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
    edge_density REAL NOT NULL DEFAULT 0,
    grade_correlation REAL NOT NULL DEFAULT 0,
    tag_overlap REAL NOT NULL DEFAULT 0,
    combined REAL NOT NULL DEFAULT 0,
    evaluated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, disc_a, disc_b)
);

CREATE INDEX IF NOT EXISTS idx_similarity_user ON similarity_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_similarity_date ON similarity_scores(evaluated_at);

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
    daily_push_on_open INTEGER NOT NULL DEFAULT 1,  -- triggers when student opens app, not at clock time
    daily_push_max INTEGER NOT NULL DEFAULT 5
);

-- -----------------------------------------------------------
-- DICTIONARY (reference layer for AI object construction)
-- -----------------------------------------------------------

-- The AI looks up entries here when building graph objects.
-- Each entry defines how a term maps to node/edge properties.
-- Entries can be system-provided (domain = 'chemistry', etc.)
-- or user-created (domain = discipline_id).

CREATE TABLE IF NOT EXISTS dict_entries (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,          -- 'chemistry', 'biology', 'physics', 'history', 'geography', 'math', 'cs', or a discipline_id for custom
    term TEXT NOT NULL,            -- lookup key: 'carbon', 'mitochondria', 'world_war_2'
    category TEXT NOT NULL,        -- 'element', 'organelle', 'event', 'particle', 'theorem', etc.
    properties TEXT NOT NULL,      -- JSON blob of typed properties for node construction
    edge_rules TEXT NOT NULL DEFAULT '[]',  -- JSON array: what this can connect to and how
    skin_overrides TEXT NOT NULL DEFAULT '{}', -- JSON: visual overrides (color, shape, scale)
    source TEXT NOT NULL DEFAULT 'system',    -- 'system' = shipped, 'user' = student-created, 'ai' = AI-generated
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(domain, term)
);

CREATE INDEX IF NOT EXISTS idx_dict_domain ON dict_entries(domain);
CREATE INDEX IF NOT EXISTS idx_dict_term ON dict_entries(term);
CREATE INDEX IF NOT EXISTS idx_dict_category ON dict_entries(domain, category);

-- -----------------------------------------------------------
-- GRAPH BLOBS (serialized 3D workspaces)
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS graph_blobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    discipline_id TEXT REFERENCES disciplines(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    blob TEXT NOT NULL,            -- JSON serialized GraphBlob
    is_memory_web INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    modified_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_blobs_user ON graph_blobs(user_id);
CREATE INDEX IF NOT EXISTS idx_blobs_discipline ON graph_blobs(user_id, discipline_id);

-- -----------------------------------------------------------
-- FUNCTION CALL REGISTRY (AI's tool index)
-- -----------------------------------------------------------

-- Every function the AI can call is registered here.
-- The AI queries this table to find available tools, then
-- issues Gemma function calls against them.
-- A single .MD index is generated from this for the AI's
-- context window.

CREATE TABLE IF NOT EXISTS function_registry (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,        -- function name (e.g., 'create_memory_node')
    category TEXT NOT NULL,           -- 'memory', 'session', 'workspace', 'planner', 'notification', 'graph', 'dict', 'assessment'
    location TEXT NOT NULL,           -- file path: 'src/lib/engine/memory.ts'
    description TEXT NOT NULL,        -- what it does (one line)
    params_schema TEXT NOT NULL,      -- JSON schema for parameters
    returns TEXT NOT NULL DEFAULT '', -- what it returns
    usage_count INTEGER NOT NULL DEFAULT 0,
    last_used_at INTEGER,
    ai_comment TEXT NOT NULL DEFAULT '', -- AI's own note about when/why to use this
    enabled INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_registry_category ON function_registry(category);
CREATE INDEX IF NOT EXISTS idx_registry_usage ON function_registry(usage_count DESC);

-- -----------------------------------------------------------
-- UI PRIMITIVES (CSS objects in the DB)
-- -----------------------------------------------------------

-- Every UI element is a row. Mantine renders whatever this says.
-- Human and AI both write to this table.
-- The workspace is a query result, not a coded layout.

CREATE TABLE IF NOT EXISTS ui_primitives (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES ui_primitives(id) ON DELETE CASCADE,  -- tree structure
    component TEXT NOT NULL,       -- Mantine component: 'Stack', 'Group', 'Paper', 'Tabs', 'Button', 'Text', 'Badge', 'Canvas3D'
    slot TEXT NOT NULL,            -- where in parent: 'children', 'header', 'navbar', 'main'
    sort_order INTEGER NOT NULL DEFAULT 0,
    props TEXT NOT NULL DEFAULT '{}',       -- JSON: component props
    style TEXT NOT NULL DEFAULT '{}',       -- JSON: CSS overrides (golden ratio is default)
    data_source TEXT,              -- SQL query or API endpoint this primitive reads from
    on_action TEXT,                -- JSON: what happens on click/change → API call or DB write
    visible INTEGER NOT NULL DEFAULT 1,
    scope TEXT NOT NULL DEFAULT 'global',   -- 'global' or discipline_id — which tab this belongs to
    created_by TEXT NOT NULL DEFAULT 'system',  -- 'system', 'user', 'ai'
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_primitives_user ON ui_primitives(user_id, scope);
CREATE INDEX IF NOT EXISTS idx_primitives_parent ON ui_primitives(parent_id, sort_order);

-- -----------------------------------------------------------
-- VIEWS (named layouts — each row is a screen)
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS ui_views (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,             -- 'dashboard', 'session', 'memory_web', 'planner'
    root_primitive_id TEXT NOT NULL REFERENCES ui_primitives(id) ON DELETE CASCADE,
    is_active INTEGER NOT NULL DEFAULT 0,
    theme TEXT NOT NULL DEFAULT 'auto',  -- 'light', 'dark', 'auto'
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_views_active ON ui_views(user_id, is_active);
