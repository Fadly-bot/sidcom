-- ==============================================================================
-- SIDCOM / Karsa Canonical Database Schema
-- Migration: 001_initial_schema
-- Compliant with: CONTENT-SCHEMA.md, PRODUCT-RULES.md, PHASE-C2-FINAL-AUDIT.md
-- ==============================================================================

-- 1. Users & Authentication Identity
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    profile_timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
    last_timezone_changed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Course Hierarchy
CREATE TABLE IF NOT EXISTS courses (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    default_locale VARCHAR(10) DEFAULT 'id-ID',
    total_phases INT NOT NULL DEFAULT 12,
    total_days INT NOT NULL DEFAULT 365,
    content_version VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Phases (Enforcing Phase 1-11 = 30 days, Phase 12 = 35 days)
CREATE TABLE IF NOT EXISTS phases (
    id VARCHAR(64) PRIMARY KEY,
    course_id VARCHAR(64) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    phase_number INT NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    prerequisite_phase_id VARCHAR(64) REFERENCES phases(id),
    duration_days INT NOT NULL CHECK (duration_days IN (30, 35)),
    milestone_lesson_id VARCHAR(64)
);

-- 4. Weeks
CREATE TABLE IF NOT EXISTS weeks (
    id VARCHAR(64) PRIMARY KEY,
    phase_id VARCHAR(64) NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
    week_number INT NOT NULL UNIQUE,
    week_in_phase INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    learning_goal TEXT NOT NULL
);

-- 5. Lessons
CREATE TABLE IF NOT EXISTS lessons (
    id VARCHAR(64) PRIMARY KEY,
    week_id VARCHAR(64) NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
    day_number INT NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    activity_type VARCHAR(32) NOT NULL,
    duration_minutes INT NOT NULL,
    difficulty_level INT NOT NULL,
    prerequisite_lesson_id VARCHAR(64) REFERENCES lessons(id),
    content_version VARCHAR(20) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Sections
CREATE TABLE IF NOT EXISTS sections (
    id VARCHAR(64) PRIMARY KEY,
    lesson_id VARCHAR(64) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    sequence_order INT NOT NULL,
    section_type VARCHAR(64) NOT NULL,
    payload_json JSONB NOT NULL
);

-- 7. Objectives
CREATE TABLE IF NOT EXISTS objectives (
    id VARCHAR(64) PRIMARY KEY,
    lesson_id VARCHAR(64) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    bloom_taxonomy_level VARCHAR(32) NOT NULL,
    statement TEXT NOT NULL
);

-- 8. Concepts
CREATE TABLE IF NOT EXISTS concepts (
    id VARCHAR(64) PRIMARY KEY,
    lesson_id VARCHAR(64) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    summary_markdown TEXT NOT NULL,
    primary_framework VARCHAR(128) NOT NULL,
    illustration_url TEXT,
    audio_narration_url TEXT
);

-- 9. Worked Examples
CREATE TABLE IF NOT EXISTS worked_examples (
    id VARCHAR(64) PRIMARY KEY,
    lesson_id VARCHAR(64) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    context_description TEXT NOT NULL,
    poor_approach_text TEXT NOT NULL,
    poor_approach_analysis TEXT NOT NULL,
    optimal_approach_text TEXT NOT NULL,
    optimal_approach_analysis TEXT NOT NULL
);

-- 10. Exercises
CREATE TABLE IF NOT EXISTS exercises (
    id VARCHAR(64) PRIMARY KEY,
    lesson_id VARCHAR(64) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    exercise_type VARCHAR(64) NOT NULL,
    prompt_text TEXT NOT NULL,
    drill_payload JSONB NOT NULL
);

-- 11. Rubrics
CREATE TABLE IF NOT EXISTS rubrics (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL
);

-- 12. Rubric Criteria
CREATE TABLE IF NOT EXISTS rubric_criteria (
    id VARCHAR(64) PRIMARY KEY,
    rubric_id VARCHAR(64) NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
    dimension_name VARCHAR(128) NOT NULL,
    weight_percentage NUMERIC(5, 2) NOT NULL,
    self_calibration_prompt TEXT NOT NULL,
    anchor_poor_description TEXT NOT NULL,
    anchor_optimal_description TEXT NOT NULL
);

-- 13. Audio Exercises
CREATE TABLE IF NOT EXISTS audio_exercises (
    id VARCHAR(64) PRIMARY KEY,
    exercise_id VARCHAR(64) NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    prompt_text TEXT NOT NULL,
    model_exemplar_audio_url TEXT NOT NULL,
    target_wpm_min INT DEFAULT 110,
    target_wpm_max INT DEFAULT 145,
    target_pause_seconds NUMERIC(3, 1) DEFAULT 2.0,
    model_transcript_text TEXT NOT NULL,
    written_fallback_mode_allowed BOOLEAN DEFAULT TRUE,
    rubric_id VARCHAR(64) NOT NULL REFERENCES rubrics(id)
);

-- 14. Quizzes
CREATE TABLE IF NOT EXISTS quizzes (
    id VARCHAR(64) PRIMARY KEY,
    lesson_id VARCHAR(64) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    passing_threshold_percentage NUMERIC(5, 2) DEFAULT 80.00
);

-- 15. Questions
CREATE TABLE IF NOT EXISTS questions (
    id VARCHAR(64) PRIMARY KEY,
    quiz_id VARCHAR(64) NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(32) NOT NULL,
    sequence_order INT NOT NULL
);

-- 16. Answer Options
CREATE TABLE IF NOT EXISTS answer_options (
    id VARCHAR(64) PRIMARY KEY,
    question_id VARCHAR(64) NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_key VARCHAR(16) NOT NULL,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    explanation_text TEXT NOT NULL
);

-- 17. Mastery Criteria
CREATE TABLE IF NOT EXISTS mastery_criteria (
    id VARCHAR(64) PRIMARY KEY,
    lesson_id VARCHAR(64) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    initial_passing_threshold NUMERIC(5, 2) DEFAULT 80.00,
    retrieval_passing_threshold NUMERIC(5, 2) DEFAULT 80.00,
    min_active_seconds INT DEFAULT 45
);

-- 18. Reflection Prompts
CREATE TABLE IF NOT EXISTS reflection_prompts (
    id VARCHAR(64) PRIMARY KEY,
    lesson_id VARCHAR(64) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    context_chips JSONB NOT NULL,
    prompt_text TEXT NOT NULL
);

-- 19. Skills
CREATE TABLE IF NOT EXISTS skills (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(64) NOT NULL CHECK (domain IN ('ARTIKULASI', 'EMPATI', 'ASERTIVITAS', 'STRATEGI', 'KETAHANAN'))
);

-- 20. Skill Dependencies
CREATE TABLE IF NOT EXISTS skill_dependencies (
    source_skill_id VARCHAR(64) NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    target_skill_id VARCHAR(64) NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (source_skill_id, target_skill_id)
);

-- 21. Milestones
CREATE TABLE IF NOT EXISTS milestones (
    id VARCHAR(64) PRIMARY KEY,
    phase_id VARCHAR(64) NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
    rubric_id VARCHAR(64) REFERENCES rubrics(id),
    badge_reward_id VARCHAR(64)
);

-- 22. Review Cards (Atomic SRS unit: 2 per lesson, 30-45s)
CREATE TABLE IF NOT EXISTS review_cards (
    id VARCHAR(64) PRIMARY KEY,
    lesson_id VARCHAR(64) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    skill_id VARCHAR(64) NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    prompt_type VARCHAR(32) NOT NULL,
    prompt_text TEXT NOT NULL,
    stimulus_text TEXT,
    answer_payload JSONB NOT NULL,
    explanation TEXT NOT NULL,
    card_difficulty NUMERIC(3, 2) DEFAULT 1.00,
    estimated_seconds INT DEFAULT 35,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 23. User Progress (Server Authoritative Progression State)
CREATE TABLE IF NOT EXISTS user_progress (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id VARCHAR(64) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    state VARCHAR(32) NOT NULL DEFAULT 'LOCKED' CHECK (state IN ('LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'COMPLETED', 'MASTERED', 'REVIEW_REQUIRED')),
    best_score_percentage NUMERIC(5, 2) DEFAULT 0.00,
    attempts_count INT DEFAULT 0,
    completed_at TIMESTAMP WITH TIME ZONE,
    mastered_at TIMESTAMP WITH TIME ZONE,
    quarantine_until TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_user_lesson UNIQUE(user_id, lesson_id)
);

-- 24. Review Items (User DSR Memory Tracking per ReviewCard)
CREATE TABLE IF NOT EXISTS review_items (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    review_card_id VARCHAR(64) NOT NULL REFERENCES review_cards(id) ON DELETE CASCADE,
    lesson_id VARCHAR(64) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    stability_days NUMERIC(8, 3) DEFAULT 1.000,
    difficulty_rating NUMERIC(4, 2) DEFAULT 5.00,
    retrievability_estimate NUMERIC(5, 4) DEFAULT 1.0000,
    last_reviewed_at TIMESTAMP WITH TIME ZONE,
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    review_count INT DEFAULT 0,
    lapses_count INT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_user_review_card UNIQUE(user_id, review_card_id)
);

-- 25. Processed Commands (Offline Sync Idempotency Ledger)
CREATE TABLE IF NOT EXISTS processed_commands (
    command_id UUID PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    command_type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    response_payload JSONB
);

-- 26. XP Ledger (Categorized Non-Inflationary Economics)
CREATE TABLE IF NOT EXISTS xp_ledger (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(32) NOT NULL CHECK (category IN ('PRACTICE', 'MILESTONE', 'RECOVERY')),
    base_xp INT NOT NULL,
    bonus_xp INT NOT NULL DEFAULT 0,
    total_xp INT NOT NULL,
    reference_id VARCHAR(64),
    reference_type VARCHAR(64),
    awarded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    calendar_date DATE NOT NULL
);

-- 27. User Streaks
CREATE TABLE IF NOT EXISTS user_streaks (
    user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_streak INT NOT NULL DEFAULT 0,
    longest_streak INT NOT NULL DEFAULT 0,
    banked_freezes INT NOT NULL DEFAULT 0 CHECK (banked_freezes >= 0 AND banked_freezes <= 2),
    last_activity_date DATE,
    last_streak_evaluated_at TIMESTAMP WITH TIME ZONE,
    grace_window_ends_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Schema Migrations Tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(64) NOT NULL UNIQUE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for Query Performance & Lookups
CREATE INDEX IF NOT EXISTS idx_user_progress_state ON user_progress(user_id, state);
CREATE INDEX IF NOT EXISTS idx_lessons_day ON lessons(day_number);
CREATE INDEX IF NOT EXISTS idx_review_cards_lesson ON review_cards(lesson_id);
CREATE INDEX IF NOT EXISTS idx_review_items_due ON review_items(user_id, due_at);
CREATE INDEX IF NOT EXISTS idx_processed_commands_user ON processed_commands(user_id, processed_at);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_user_date ON xp_ledger(user_id, calendar_date);
