-- ============================================================
-- StudySync Server Schema
--
-- The server is a telephone switchboard.
-- It doesn't read content. It stores rows and pings diffs.
-- No human-to-human channel exists.
-- Every interaction is AI-to-AI.
-- ============================================================

-- Postgres for server (SQLite locally, Postgres in cloud)

-- -----------------------------------------------------------
-- ACCOUNTS (thin — real data stays local)
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'parent', 'admin')),
    grade_level TEXT,              -- 'K', '1'-'12', 'university', 'postgrad'
    age_bracket TEXT NOT NULL CHECK (age_bracket IN ('under_13', '13_to_17', '18_plus')),
    parental_consent INTEGER NOT NULL DEFAULT 0,  -- required if under_13
    parent_account_id TEXT REFERENCES accounts(id),
    institution_id TEXT REFERENCES institutions(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Age bracket derived from grade_level:
--   K-5 (ages 5-11)     → under_13 → parental_consent required
--   6-8 (ages 11-14)    → under_13 or 13_to_17 (conservative: require consent for 6th grade)
--   9-12 (ages 14-18)   → 13_to_17
--   university/postgrad → 18_plus
--
-- The curriculum IS the age verification.
-- A student can't fake being older because the AI calibrates
-- exercises to their declared level. Wrong level = bad experience.

CREATE TABLE IF NOT EXISTS institutions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('k12_school', 'university', 'tutoring', 'homeschool', 'other')),
    country TEXT NOT NULL,
    tax_id TEXT,                   -- for tax credit generation
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------
-- PARENTAL CONSENT (COPPA / GDPR-K compliance)
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS parental_consents (
    id TEXT PRIMARY KEY,
    student_account_id TEXT NOT NULL REFERENCES accounts(id),
    parent_account_id TEXT NOT NULL REFERENCES accounts(id),
    granted INTEGER NOT NULL DEFAULT 0,
    granted_at TIMESTAMP,
    revoked_at TIMESTAMP,          -- parent can revoke any time
    consent_method TEXT NOT NULL CHECK (consent_method IN ('email_verification', 'signed_form', 'in_app')),
    -- What the parent is consenting to:
    allow_ai_chat INTEGER NOT NULL DEFAULT 1,       -- AI assistant interaction
    allow_ai_to_ai INTEGER NOT NULL DEFAULT 0,      -- AI-to-AI study scheduling
    allow_teacher_view INTEGER NOT NULL DEFAULT 0,   -- teacher sees aggregate
    allow_progress_sharing INTEGER NOT NULL DEFAULT 0 -- share grades/progress
);

-- -----------------------------------------------------------
-- SWITCHBOARD (the only server-side table that matters)
-- -----------------------------------------------------------

-- The telephone exchange. Each row is a message from
-- Student A's AI to Student B's AI.
--
-- The server never reads content. It watches for new rows
-- (diff) and pings the recipient's WebSocket.
--
-- Content is encrypted end-to-end. The server stores ciphertext.
-- Only the recipient's local AI can decrypt.

CREATE TABLE IF NOT EXISTS switchboard (
    id TEXT PRIMARY KEY,
    from_account_id TEXT NOT NULL REFERENCES accounts(id),
    to_account_id TEXT NOT NULL REFERENCES accounts(id),
    channel TEXT NOT NULL DEFAULT 'study',  -- 'study', 'schedule', 'skill_exchange', 'teacher_announce'
    payload TEXT NOT NULL,          -- encrypted JSON blob
    payload_hash TEXT NOT NULL,     -- for diff detection without reading content
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'read', 'expired')),
    expires_at TIMESTAMP,          -- messages auto-expire
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_switchboard_to ON switchboard(to_account_id, status);
CREATE INDEX IF NOT EXISTS idx_switchboard_from ON switchboard(from_account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_switchboard_diff ON switchboard(to_account_id, created_at DESC);

-- -----------------------------------------------------------
-- CONTACT PAIRS (who can talk to whom)
-- -----------------------------------------------------------

-- Both sides must opt in. Under 13 requires parental consent.
-- Teacher-student pairs are auto-created by institution.

CREATE TABLE IF NOT EXISTS contact_pairs (
    id TEXT PRIMARY KEY,
    account_a TEXT NOT NULL REFERENCES accounts(id),
    account_b TEXT NOT NULL REFERENCES accounts(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'blocked', 'expired')),
    -- Who approved:
    a_approved INTEGER NOT NULL DEFAULT 0,
    b_approved INTEGER NOT NULL DEFAULT 0,
    -- Consent chain (for under_13):
    a_parent_approved INTEGER NOT NULL DEFAULT 0,
    b_parent_approved INTEGER NOT NULL DEFAULT 0,
    pair_type TEXT NOT NULL CHECK (pair_type IN ('student_student', 'student_teacher', 'teacher_parent')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(account_a, account_b)
);

-- -----------------------------------------------------------
-- SYNC MANIFEST (what the local DB syncs to server)
-- -----------------------------------------------------------

-- Students control exactly what leaves their device.
-- Each row is a sync permission.

CREATE TABLE IF NOT EXISTS sync_manifest (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    table_name TEXT NOT NULL,       -- which local table to sync
    sync_mode TEXT NOT NULL CHECK (sync_mode IN ('none', 'aggregate', 'full')),
    -- none: stays local (default for everything)
    -- aggregate: server gets stats, not raw data (e.g., grade averages, tag counts)
    -- full: server gets the rows (e.g., for teacher view opt-in)
    last_synced_at TIMESTAMP,
    UNIQUE(account_id, table_name)
);

-- Default sync manifest for a new student:
-- grades:         none (local only)
-- memory_nodes:   none
-- study_sessions: none
-- disciplines:    none
-- chat_messages:  NEVER (never leaves device)
-- context_ledger: NEVER
-- Everything defaults to none. Student explicitly opts in.

-- -----------------------------------------------------------
-- TEACHER MANIFOLD (pre-built from student hints)
-- -----------------------------------------------------------

-- Students are always hinting at their teacher through metadata.
-- The server collects these hints into a manifold.
-- When the teacher finally connects, we hand them their data
-- and delete it from our side. Their data becomes sovereign.

CREATE TABLE IF NOT EXISTS teacher_manifold (
    id TEXT PRIMARY KEY,
    teacher_name_normalized TEXT NOT NULL,  -- lowercase, trimmed, for matching
    institution_id TEXT REFERENCES institutions(id),
    discipline_hint TEXT,          -- most common discipline tagged by students
    -- Aggregated from student metadata (anonymous):
    student_count INTEGER NOT NULL DEFAULT 0,
    reported_metadata TEXT NOT NULL DEFAULT '{}',  -- JSON: merged from all student professor.metadata blobs
    -- {
    --   "teaching_style": ["lecture-heavy", "lecture-heavy", "lots of examples"],  ← raw reports
    --   "personality": ["strict but fair", "strict", "tough but good"],
    --   "grading_tendency": ["harsh on proofs", "hard grader"],
    --   "exam_style": ["mixed theory and practice"],
    --   ... consensus emerges from frequency
    -- }
    grade_distribution TEXT NOT NULL DEFAULT '{}',  -- JSON: { avg, median, spread } across reporting students
    common_struggles TEXT NOT NULL DEFAULT '[]',     -- JSON: tags most students have at T1-T2 in this teacher's discipline
    claimed_by TEXT REFERENCES accounts(id),         -- NULL until teacher signs up
    claimed_at TIMESTAMP,
    deleted_after_claim INTEGER NOT NULL DEFAULT 0,  -- 1 = data handed off, server copy purged
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manifold_name ON teacher_manifold(teacher_name_normalized);
CREATE INDEX IF NOT EXISTS idx_manifold_unclaimed ON teacher_manifold(claimed_by) WHERE claimed_by IS NULL;

-- -----------------------------------------------------------
-- TEACHER AGGREGATE VIEW (only what students shared)
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS teacher_aggregates (
    id TEXT PRIMARY KEY,
    teacher_account_id TEXT NOT NULL REFERENCES accounts(id),
    student_account_id TEXT NOT NULL REFERENCES accounts(id),
    discipline_name TEXT NOT NULL,
    -- Aggregate only — no raw data:
    tag_count INTEGER,
    avg_tier REAL,
    current_grade REAL,
    target_grade REAL,
    total_study_hours REAL,
    sessions_this_week INTEGER,
    slipping_count INTEGER,        -- how many tags at demotion risk
    last_session_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teacher_agg ON teacher_aggregates(teacher_account_id);

-- -----------------------------------------------------------
-- AI SAFETY LOG (why a communication was blocked)
-- -----------------------------------------------------------

-- The AI logs every rejection. Not the content — the reason.
-- This is for audit. The server never sees the content.

CREATE TABLE IF NOT EXISTS safety_log (
    id TEXT PRIMARY KEY,
    from_account_id TEXT NOT NULL,
    to_account_id TEXT NOT NULL,
    reason TEXT NOT NULL,           -- 'no_academic_content', 'outside_time_window', 'no_consent', 'blocked_action', 'suspicious_pattern'
    channel TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_log ON safety_log(created_at DESC);

-- -----------------------------------------------------------
-- TAX CREDITS (institutional exemptions)
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS tax_credits (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES institutions(id),
    student_account_id TEXT NOT NULL REFERENCES accounts(id),
    academic_year TEXT NOT NULL,    -- '2026-2027'
    exemption_type TEXT NOT NULL CHECK (exemption_type IN ('full', 'partial')),
    amount_cents INTEGER,           -- if partial
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'claimed', 'rejected')),
    documentation_url TEXT,         -- generated PDF
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
