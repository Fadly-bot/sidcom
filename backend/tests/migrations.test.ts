import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, IDatabase } from '../src/db/index.js';
import { migrateUp, migrateDown, getAppliedMigrations } from '../src/db/migrator.js';
import { seedDatabase } from '../src/db/seed.js';

describe('Database Schema & Migration Engine', () => {
  let db: IDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  it('should run migrations on fresh database and record migration version', async () => {
    const applied = await migrateUp(db);
    expect(applied).toContain('001_initial_schema');

    const recorded = await getAppliedMigrations(db);
    expect(recorded).toEqual(['001_initial_schema', '002_auth_refresh_tokens']);

    // Check table existence
    const tableRes = await db.query<{ tablename: string }>(`
      SELECT tablename FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename ASC;
    `);

    const tableNames = tableRes.rows.map((r) => r.tablename);
    expect(tableNames).toContain('courses');
    expect(tableNames).toContain('phases');
    expect(tableNames).toContain('weeks');
    expect(tableNames).toContain('lessons');
    expect(tableNames).toContain('review_cards');
    expect(tableNames).toContain('review_items');
    expect(tableNames).toContain('user_progress');
    expect(tableNames).toContain('processed_commands');
    expect(tableNames).toContain('xp_ledger');
    expect(tableNames).toContain('user_streaks');
    expect(tableNames).toContain('schema_migrations');
  });

  it('should enforce Phase duration constraint (Phases 1-11 = 30 days, Phase 12 = 35 days)', async () => {
    // Insert course
    await db.query(`
      INSERT INTO courses (id, title, description, content_version)
      VALUES ('c1', 'Test Course', 'Test Desc', '1.0.0')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Valid: 30 days
    await expect(
      db.query(`
        INSERT INTO phases (id, course_id, phase_number, title, description, duration_days)
        VALUES ('p1', 'c1', 1, 'Phase 1', 'Desc 1', 30);
      `)
    ).resolves.toBeDefined();

    // Valid: 35 days (Phase 12)
    await expect(
      db.query(`
        INSERT INTO phases (id, course_id, phase_number, title, description, duration_days)
        VALUES ('p12', 'c1', 12, 'Phase 12', 'Desc 12', 35);
      `)
    ).resolves.toBeDefined();

    // Invalid: 25 days (fails CHECK constraint)
    await expect(
      db.query(`
        INSERT INTO phases (id, course_id, phase_number, title, description, duration_days)
        VALUES ('p_invalid', 'c1', 2, 'Phase Invalid', 'Desc Invalid', 25);
      `)
    ).rejects.toThrow();

    // Cleanup phase test records
    await db.query("DELETE FROM phases WHERE id IN ('p1', 'p12');");
  });

  it('should enforce Foreign Key referential integrity and cascade deletion', async () => {
    // Attempt inserting lesson with non-existent week_id
    await expect(
      db.query(`
        INSERT INTO lessons (
          id, week_id, day_number, title, activity_type, duration_minutes,
          difficulty_level, content_version, content_hash, payload_json
        )
        VALUES (
          'L-FAIL', 'non_existent_week', 999, 'Orphan Lesson', 'LESSON', 5,
          1, '1.0.0', 'hash', '{}'::jsonb
        );
      `)
    ).rejects.toThrow();

    // Insert course, phase, week, skill, lesson, review card
    await db.exec(`
      INSERT INTO courses (id, title, description, content_version) VALUES ('c_fk', 'Course FK', 'Desc', '1.0.0') ON CONFLICT DO NOTHING;
      INSERT INTO phases (id, course_id, phase_number, title, description, duration_days) VALUES ('p_fk', 'c_fk', 99, 'P FK', 'Desc', 30) ON CONFLICT DO NOTHING;
      INSERT INTO weeks (id, phase_id, week_number, week_in_phase, title, learning_goal) VALUES ('w_fk', 'p_fk', 99, 1, 'W FK', 'Goal') ON CONFLICT DO NOTHING;
      INSERT INTO skills (id, name, domain) VALUES ('s_fk', 'Skill FK', 'ARTIKULASI') ON CONFLICT DO NOTHING;
      INSERT INTO lessons (id, week_id, day_number, title, activity_type, duration_minutes, difficulty_level, content_version, content_hash, payload_json)
      VALUES ('l_fk', 'w_fk', 999, 'Lesson FK', 'LESSON', 5, 1, '1.0.0', 'hash', '{}'::jsonb);
      INSERT INTO review_cards (id, lesson_id, skill_id, prompt_type, prompt_text, answer_payload, explanation)
      VALUES ('rc_fk', 'l_fk', 's_fk', 'CONCEPT_RECALL', 'Prompt', '{}'::jsonb, 'Explanation');
    `);

    // Delete lesson -> review_cards must cascade delete
    await db.query("DELETE FROM lessons WHERE id = 'l_fk';");
    const rcCheck = await db.query("SELECT * FROM review_cards WHERE id = 'rc_fk';");
    expect(rcCheck.rows).toHaveLength(0);

    // Cleanup FK test records
    await db.query("DELETE FROM weeks WHERE id = 'w_fk';");
    await db.query("DELETE FROM phases WHERE id = 'p_fk';");
  });

  it('should enforce processed_commands UUID primary key idempotency', async () => {
    // Insert user
    await db.query(`
      INSERT INTO users (id, email, password_hash, display_name)
      VALUES ('u_cmd', 'cmd@test.com', 'hash', 'Cmd User')
      ON CONFLICT DO NOTHING;
    `);

    const commandId = '018e6a32-7f22-7901-b28f-1a98234bc501';

    // First insertion succeeds
    await expect(
      db.query(
        `
        INSERT INTO processed_commands (command_id, user_id, command_type, status, response_payload)
        VALUES ($1, 'u_cmd', 'SUBMIT_LESSON_ATTEMPT', 'ACCEPTED', '{"score": 90}'::jsonb);
        `,
        [commandId]
      )
    ).resolves.toBeDefined();

    // Duplicate command_id fails PK unique constraint
    await expect(
      db.query(
        `
        INSERT INTO processed_commands (command_id, user_id, command_type, status, response_payload)
        VALUES ($1, 'u_cmd', 'SUBMIT_LESSON_ATTEMPT', 'ACCEPTED', '{"score": 90}'::jsonb);
        `,
        [commandId]
      )
    ).rejects.toThrow();

    await db.query("DELETE FROM processed_commands WHERE command_id = $1;", [commandId]);
  });

  it('should seed database with 12 Phases, correct durations, and 2 ReviewCards for Day 1', async () => {
    await seedDatabase(db);

    const phasesRes = await db.query<{ phase_number: number; duration_days: number }>(
      'SELECT phase_number, duration_days FROM phases ORDER BY phase_number ASC;'
    );
    expect(phasesRes.rows).toHaveLength(12);

    // Phases 1-11 = 30 days
    for (let i = 0; i < 11; i++) {
      expect(phasesRes.rows[i]?.duration_days).toBe(30);
    }
    // Phase 12 = 35 days
    expect(phasesRes.rows[11]?.duration_days).toBe(35);

    // Day 1 has exactly 2 ReviewCards (Decision 04)
    const cardsRes = await db.query(
      "SELECT * FROM review_cards WHERE lesson_id = 'L-P01-W01-D01' ORDER BY id ASC;"
    );
    expect(cardsRes.rows).toHaveLength(2);
    expect(cardsRes.rows[0]?.prompt_type).toBe('CONCEPT_RECALL');
    expect(cardsRes.rows[1]?.prompt_type).toBe('FLAW_DETECTION');
  });

  it('should enforce user_progress and review_items unique constraints', async () => {
    // User progress unique per (user_id, lesson_id)
    await db.query(`
      INSERT INTO user_progress (id, user_id, lesson_id, state)
      VALUES ('up1', 'user_demo_01', 'L-P01-W01-D01', 'AVAILABLE');
    `);

    await expect(
      db.query(`
        INSERT INTO user_progress (id, user_id, lesson_id, state)
        VALUES ('up2', 'user_demo_01', 'L-P01-W01-D01', 'COMPLETED');
      `)
    ).rejects.toThrow();

    // Review item unique per (user_id, review_card_id)
    await db.query(`
      INSERT INTO review_items (id, user_id, review_card_id, lesson_id, due_at)
      VALUES ('ri1', 'user_demo_01', 'RC-P01-W01-D01-01', 'L-P01-W01-D01', NOW());
    `);

    await expect(
      db.query(`
        INSERT INTO review_items (id, user_id, review_card_id, lesson_id, due_at)
        VALUES ('ri2', 'user_demo_01', 'RC-P01-W01-D01-01', 'L-P01-W01-D01', NOW());
      `)
    ).rejects.toThrow();

    // Cleanup
    await db.query("DELETE FROM user_progress WHERE id = 'up1';");
    await db.query("DELETE FROM review_items WHERE id = 'ri1';");
  });

  it('should enforce XP category CHECK constraint and streak freeze boundary', async () => {
    await db.query(`
      INSERT INTO users (id, email, password_hash, display_name)
      VALUES ('u_xp', 'xp@test.com', 'hash', 'XP User')
      ON CONFLICT DO NOTHING;
    `);

    // Valid XP category: PRACTICE, MILESTONE, RECOVERY
    for (const cat of ['PRACTICE', 'MILESTONE', 'RECOVERY']) {
      await expect(
        db.query(
          `
          INSERT INTO xp_ledger (id, user_id, category, base_xp, bonus_xp, total_xp, calendar_date)
          VALUES ($1, 'u_xp', $2, 15, 0, 15, CURRENT_DATE);
          `,
          [`xp_${cat}`, cat]
        )
      ).resolves.toBeDefined();
    }

    // Invalid XP category fails
    await expect(
      db.query(`
        INSERT INTO xp_ledger (id, user_id, category, base_xp, bonus_xp, total_xp, calendar_date)
        VALUES ('xp_inv', 'u_xp', 'INVALID_CAT', 15, 0, 15, CURRENT_DATE);
      `)
    ).rejects.toThrow();

    // Streak banked freezes: 0 to 2 allowed
    await expect(
      db.query(`
        INSERT INTO user_streaks (user_id, current_streak, longest_streak, banked_freezes)
        VALUES ('u_xp', 5, 5, 2);
      `)
    ).resolves.toBeDefined();

    // Banked freezes > 2 fails CHECK constraint
    await expect(
      db.query(`
        UPDATE user_streaks SET banked_freezes = 3 WHERE user_id = 'u_xp';
      `)
    ).rejects.toThrow();
  });

  it('should support rollback and re-migration replay without error', async () => {
    // Rollback migration 002
    const rolledBack2 = await migrateDown(db);
    expect(rolledBack2).toBe('002_auth_refresh_tokens');

    const checkTokensTable = await db.query(`
      SELECT tablename FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public' AND tablename = 'refresh_tokens';
    `);
    expect(checkTokensTable.rows).toHaveLength(0);

    // Rollback migration 001
    const rolledBack1 = await migrateDown(db);
    expect(rolledBack1).toBe('001_initial_schema');

    // Confirm courses table dropped
    const checkTable = await db.query(`
      SELECT tablename FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public' AND tablename = 'courses';
    `);
    expect(checkTable.rows).toHaveLength(0);

    // Replay migrations
    const replayed = await migrateUp(db);
    expect(replayed).toContain('001_initial_schema');
    expect(replayed).toContain('002_auth_refresh_tokens');

    const recheckTable = await db.query(`
      SELECT tablename FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public' AND tablename = 'courses';
    `);
    expect(recheckTable.rows).toHaveLength(1);

    const recheckTokensTable = await db.query(`
      SELECT tablename FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public' AND tablename = 'refresh_tokens';
    `);
    expect(recheckTokensTable.rows).toHaveLength(1);
  });
});
