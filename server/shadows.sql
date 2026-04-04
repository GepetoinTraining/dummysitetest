-- ============================================================
-- Shadow Tables
--
-- Every local table has an adjacent shadow table on the server.
-- Shadows are anonymous cross-references from multiple students.
-- When shadows align into a shape we can name, we offload.
--
-- The server never has the data. It has the silhouette.
-- When the silhouette gets claimed, we hand it off and purge.
-- ============================================================

-- -----------------------------------------------------------
-- SHADOW: Disciplines
-- -----------------------------------------------------------
-- Multiple students saying "Linear Algebra" at "MIT" builds
-- a shadow discipline. When a teacher claims it, the aggregate
-- becomes their starting point.

CREATE TABLE IF NOT EXISTS shadow_disciplines (
    id TEXT PRIMARY KEY,
    name_normalized TEXT NOT NULL,
    institution_id TEXT REFERENCES institutions(id),
    student_count INTEGER NOT NULL DEFAULT 0,
    avg_grade REAL,
    avg_goal REAL,
    common_tags TEXT NOT NULL DEFAULT '[]',      -- JSON: most frequent T3+ tags across students
    common_struggles TEXT NOT NULL DEFAULT '[]',  -- JSON: most frequent T1-T2 tags (what students lose)
    common_skills TEXT NOT NULL DEFAULT '[]',     -- JSON: most used .md workflow filenames
    claimed_by TEXT REFERENCES accounts(id),
    purged INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(name_normalized, institution_id)
);

-- -----------------------------------------------------------
-- SHADOW: Professors
-- -----------------------------------------------------------
-- Already covered by teacher_manifold — this IS the shadow

-- -----------------------------------------------------------
-- SHADOW: Assessments
-- -----------------------------------------------------------
-- Anonymous grade distributions per discipline per institution.
-- "Students in Linear Algebra at MIT average 0.62 self / 0.54 AI"

CREATE TABLE IF NOT EXISTS shadow_assessments (
    id TEXT PRIMARY KEY,
    shadow_discipline_id TEXT REFERENCES shadow_disciplines(id),
    sample_count INTEGER NOT NULL DEFAULT 0,
    avg_self_assessment REAL,
    avg_ai_assessment REAL,
    avg_combined REAL,
    avg_session_duration_minutes REAL,
    sessions_per_week_avg REAL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------
-- SHADOW: Study Patterns
-- -----------------------------------------------------------
-- When do students study? What workflows work?
-- No names. Just patterns.

CREATE TABLE IF NOT EXISTS shadow_patterns (
    id TEXT PRIMARY KEY,
    shadow_discipline_id TEXT REFERENCES shadow_disciplines(id),
    sample_count INTEGER NOT NULL DEFAULT 0,
    peak_study_hour INTEGER,          -- most common hour of day
    avg_sessions_per_week REAL,
    most_effective_skill TEXT,         -- workflow .md with highest avg combined score
    avg_tags_per_session REAL,        -- how many new/bumped tags per session
    tier_distribution TEXT NOT NULL DEFAULT '{}',  -- JSON: { "1": 40, "2": 25, "3": 20, "4": 10, "5": 5 } percentages
    decay_rate_avg REAL,              -- how fast students lose knowledge in this discipline
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------
-- SHADOW: Connections
-- -----------------------------------------------------------
-- Cross-discipline similarity patterns across students.
-- "Students who study Linear Algebra AND Physics show 0.72
--  similarity between the disciplines"

CREATE TABLE IF NOT EXISTS shadow_connections (
    id TEXT PRIMARY KEY,
    disc_a_normalized TEXT NOT NULL,
    disc_b_normalized TEXT NOT NULL,
    institution_id TEXT REFERENCES institutions(id),
    sample_count INTEGER NOT NULL DEFAULT 0,
    avg_similarity REAL,
    avg_edge_density REAL,
    avg_grade_correlation REAL,
    avg_tag_overlap REAL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(disc_a_normalized, disc_b_normalized, institution_id)
);

-- -----------------------------------------------------------
-- SHADOW: Dict Contributions
-- -----------------------------------------------------------
-- When students or AIs create new dict entries, the shadow
-- captures which terms are being added most.
-- "12 students added 'jordan-normal-form' to their chemistry dict"
-- Wait — that's a math term. Cross-reference reveals miscategorization.
-- Shadow logic catches these patterns without reading the data.

CREATE TABLE IF NOT EXISTS shadow_dict (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    term_normalized TEXT NOT NULL,
    category TEXT NOT NULL,
    contribution_count INTEGER NOT NULL DEFAULT 0,
    most_common_properties TEXT NOT NULL DEFAULT '{}',  -- JSON: merged, frequency-weighted
    flagged INTEGER NOT NULL DEFAULT 0,  -- 1 if cross-reference looks wrong
    flag_reason TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(domain, term_normalized)
);

-- -----------------------------------------------------------
-- SHADOW LIFECYCLE
-- -----------------------------------------------------------
--
-- 1. Student syncs (if opted in via sync_manifest):
--    → contributes anonymous aggregate to shadow tables
--    → never raw data, only counts/averages/frequencies
--
-- 2. Shadows accumulate:
--    → patterns emerge from cross-referencing
--    → "15 students in this discipline all struggle with topic X"
--    → "students who study A and B show high cross-discipline correlation"
--
-- 3. A name appears:
--    → teacher claims the discipline shadow
--    → or institution links shadows to their catalog
--
-- 4. Offload + purge:
--    → shadow data handed to the claimant as their local sovereign data
--    → server sets purged = 1 and clears the detail fields
--    → only the skeleton remains (counts, no content)
--
-- The server is always forgetting. It holds shadows just long
-- enough for them to be recognized, then lets go.
