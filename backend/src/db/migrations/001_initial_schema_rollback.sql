-- ==============================================================================
-- Migration Rollback: 001_initial_schema_rollback
-- Drops all tables in reverse dependency order
-- ==============================================================================

DROP TABLE IF EXISTS xp_ledger CASCADE;
DROP TABLE IF EXISTS user_streaks CASCADE;
DROP TABLE IF EXISTS processed_commands CASCADE;
DROP TABLE IF EXISTS review_items CASCADE;
DROP TABLE IF EXISTS user_progress CASCADE;
DROP TABLE IF EXISTS review_cards CASCADE;
DROP TABLE IF EXISTS milestones CASCADE;
DROP TABLE IF EXISTS skill_dependencies CASCADE;
DROP TABLE IF EXISTS skills CASCADE;
DROP TABLE IF EXISTS reflection_prompts CASCADE;
DROP TABLE IF EXISTS mastery_criteria CASCADE;
DROP TABLE IF EXISTS answer_options CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS quizzes CASCADE;
DROP TABLE IF EXISTS audio_exercises CASCADE;
DROP TABLE IF EXISTS rubric_criteria CASCADE;
DROP TABLE IF EXISTS rubrics CASCADE;
DROP TABLE IF EXISTS exercises CASCADE;
DROP TABLE IF EXISTS worked_examples CASCADE;
DROP TABLE IF EXISTS concepts CASCADE;
DROP TABLE IF EXISTS objectives CASCADE;
DROP TABLE IF EXISTS sections CASCADE;
DROP TABLE IF EXISTS lessons CASCADE;
DROP TABLE IF EXISTS weeks CASCADE;
DROP TABLE IF EXISTS phases CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;
