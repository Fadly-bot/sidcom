import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createTestDatabase, IDatabase, setDb } from '../src/db/index.js';
import { migrateUp } from '../src/db/migrator.js';
import { seedDatabase } from '../src/db/seed.js';
import { AuthService } from '../src/auth/auth-service.js';
import { ProgressionEngine } from '../src/learning/progression-engine.js';
import { LearningService } from '../src/learning/learning-service.js';
import { SrsService } from '../src/srs/srs-service.js';
import { XpService } from '../src/gamification/xp-service.js';
import { StreakService } from '../src/gamification/streak-service.js';

describe('Phase A.10 Master Integration & Security Red Team Suite', () => {
  let db: IDatabase;
  let app: ReturnType<typeof createApp>;
  let authService: AuthService;
  let progressionEngine: ProgressionEngine;
  let learningService: LearningService;
  let srsService: SrsService;
  let xpService: XpService;
  let streakService: StreakService;

  let attackerToken: string;
  let attackerId: string;
  let victimToken: string;
  let victimId: string;
  let day1LessonId: string;
  let quizQuestionId: string;
  let correctOptionId: string;
  let wrongOptionId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    setDb(db);
    await migrateUp(db);
    await seedDatabase(db);

    authService = new AuthService(db);
    progressionEngine = new ProgressionEngine(db);
    learningService = new LearningService(db);
    srsService = new SrsService(db);
    xpService = new XpService(db);
    streakService = new StreakService(db);
    app = createApp();

    // Fetch Day 1 Lesson ID
    const d1Res = await db.query<{ id: string }>('SELECT id FROM lessons WHERE day_number = 1;');
    day1LessonId = d1Res.rows[0].id;

    // Create a quiz for Day 1 to enable grading
    const quizId = 'quiz_a10_d1';
    await db.query(
      'INSERT INTO quizzes (id, lesson_id, passing_threshold_percentage) VALUES ($1, $2, 80.00) ON CONFLICT (id) DO NOTHING;',
      [quizId, day1LessonId]
    );

    quizQuestionId = 'q_a10_d1_01';
    await db.query(
      "INSERT INTO questions (id, quiz_id, question_text, question_type, sequence_order) VALUES ($1, $2, 'Pertanyaan A10', 'MULTIPLE_CHOICE', 1) ON CONFLICT (id) DO NOTHING;",
      [quizQuestionId, quizId]
    );

    correctOptionId = 'opt_a10_correct';
    wrongOptionId = 'opt_a10_wrong';
    await db.query(
      `INSERT INTO answer_options (id, question_id, option_key, option_text, is_correct, explanation_text)
       VALUES
       ($1, $2, 'A', 'Pilihan Benar', true, 'Penjelasan benar'),
       ($3, $2, 'B', 'Pilihan Salah', false, 'Penjelasan salah')
       ON CONFLICT (id) DO NOTHING;`,
      [correctOptionId, quizQuestionId, wrongOptionId]
    );

    // Create Day 2 lesson (locked behind Day 1) for progression tests
    await db.query(`
      INSERT INTO lessons (
        id, week_id, day_number, title, activity_type, duration_minutes,
        difficulty_level, prerequisite_lesson_id, content_version, content_hash, payload_json
      )
      VALUES (
        'L-P01-W01-D02', 'phase_01_week_01', 2, 'Hambatan Persepsi',
        'LESSON', 7, 1, 'L-P01-W01-D01', '1.0.0',
        'a1b2c3d4e5f6', '{"intro": "Pelajari hambatan persepsi."}'::jsonb
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    // Register Attacker
    const regAttacker = await authService.register({
      email: 'attacker.a10@example.com',
      password: 'StrongPassword123!',
      displayName: 'Attacker A10',
    });
    attackerToken = regAttacker.tokens.accessToken;
    attackerId = regAttacker.user.id;

    // Register Victim
    const regVictim = await authService.register({
      email: 'victim.a10@example.com',
      password: 'StrongPassword123!',
      displayName: 'Victim A10',
    });
    victimToken = regVictim.tokens.accessToken;
    victimId = regVictim.user.id;
  }, 30000);

  afterAll(async () => {
    setDb(null);
    await db.close();
  });

  // =========================================================================
  // 1. END-TO-END SYSTEM LIFECYCLE FLOW
  // =========================================================================
  describe('1. Full Learner Lifecycle (Web -> API -> DB)', () => {
    it('executes full journey: Register -> Day 1 Fail -> Quarantine -> Day 1 Pass -> Day 2 Unlock -> Mastery -> Review Debt Gate', async () => {
      // 1. Register User via API
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'master.learner@example.com',
          password: 'Password123!',
          displayName: 'Master Learner',
          timezone: 'Asia/Jakarta',
        });
      expect(registerRes.status).toBe(201);
      const token = registerRes.body.accessToken;
      const userId = registerRes.body.user.id;

      // 2. Initial Dashboard State
      const initialDash = await request(app)
        .get('/api/v1/users/me/dashboard')
        .set('Authorization', `Bearer ${token}`);
      expect(initialDash.status).toBe(200);
      expect(initialDash.body.active_streak).toBe(0);
      expect(initialDash.body.review_debt_tier).toBe('TIER_1_SOFT_REMINDER');
      expect(initialDash.body.today_lesson.day_number).toBe(1);
      expect(initialDash.body.today_lesson.state).toBe('AVAILABLE');

      // 3. Attempt Day 1 with wrong answers (Fail -> 15m Quarantine)
      const failedSubmit = await request(app)
        .post(`/api/v1/learning/lessons/${day1LessonId}/submit`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          answers: [{ question_id: quizQuestionId, selected_option_ids: [wrongOptionId] }],
          elapsed_active_seconds: 120,
        });
      expect(failedSubmit.status).toBe(200);
      expect(failedSubmit.body.passed).toBe(false);
      expect(failedSubmit.body.quarantine_until).toBeDefined();

      // Verify Day 2 remains LOCKED via LearningService
      const pathAfterFail = await learningService.getUserPathProgress(userId);
      const day2NodeAfterFail = pathAfterFail.find((n) => n.day_number === 2);
      expect(day2NodeAfterFail?.state).toBe('LOCKED');

      // 4. Clear quarantine so we can retry immediately in test
      await db.query(
        "UPDATE user_progress SET quarantine_until = NULL WHERE user_id = $1 AND lesson_id = $2;",
        [userId, day1LessonId]
      );

      // 5. Retry Day 1 with correct answers (score >= 80% -> COMPLETED)
      const passedSubmit = await request(app)
        .post(`/api/v1/learning/lessons/${day1LessonId}/submit`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          answers: [{ question_id: quizQuestionId, selected_option_ids: [correctOptionId] }],
          elapsed_active_seconds: 180,
        });
      expect(passedSubmit.status).toBe(200);
      expect(passedSubmit.body.passed).toBe(true);
      expect(passedSubmit.body.new_state).toBe('COMPLETED');

      // 6. Verify Day 2 is immediately AVAILABLE (Day N+1 unlocked upon COMPLETED)
      const pathAfterPass = await learningService.getUserPathProgress(userId);
      const day1Node = pathAfterPass.find((n) => n.day_number === 1);
      const day2Node = pathAfterPass.find((n) => n.day_number === 2);
      expect(day1Node?.state).toBe('COMPLETED');
      expect(day2Node?.state).toBe('AVAILABLE');

      // 7. Day +1 Mastery Review: Verify Day 1 transitions to MASTERED
      const masteryReview = await request(app)
        .post(`/api/v1/learning/lessons/${day1LessonId}/mastery-review`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          review_score: 85.0,
        });
      expect(masteryReview.status).toBe(200);
      expect(masteryReview.body.progress.state).toBe('MASTERED');

      // 8. Test Review Debt Gate (Simulate 14 overdue cards -> Tier 3 Hard Lock)
        // Seed dummy review cards and overdue items to test debt thresholds
        const skillRes = await db.query<{ id: string }>('SELECT id FROM skills LIMIT 1;');
        const skillId = skillRes.rows[0].id;

        for (let i = 0; i < 14; i++) {
          const dummyCardId = `rc_a10_debt_${i}`;
          await db.query(
            `INSERT INTO review_cards (id, lesson_id, skill_id, prompt_type, prompt_text, answer_payload, explanation)
             VALUES ($1, $2, $3, 'DISCRIMINATION', $4, '{}'::jsonb, 'Penjelasan')
             ON CONFLICT (id) DO NOTHING;`,
            [dummyCardId, day1LessonId, skillId, `Prompt ${i}`]
          );

          await db.query(
            `INSERT INTO review_items (id, user_id, review_card_id, lesson_id, retrievability_estimate, stability_days, difficulty_rating, due_at, last_reviewed_at, review_count)
             VALUES ($1, $2, $3, $4, 0.4000, 1.000, 5.00, NOW() - INTERVAL '2 days', NOW() - INTERVAL '3 days', 1)
             ON CONFLICT (id) DO NOTHING`,
            [`ri-a10-debt-${i}`, userId, dummyCardId, day1LessonId]
          );
        }

        // Check dashboard: Hard Lock active!
        const lockedDash = await request(app)
          .get('/api/v1/users/me/dashboard')
          .set('Authorization', `Bearer ${token}`);
        expect(lockedDash.body.review_debt_tier).toBe('TIER_3_HARD_LOCK');

        // 9. One review session (5 cards) clears enough debt to drop below Tier 3
        for (let i = 0; i < 5; i++) {
          await db.query(
            `UPDATE review_items SET due_at = NOW() + INTERVAL '3 days' WHERE id = $1`,
            [`ri-a10-debt-${i}`]
          );
        }

        // Check dashboard: Debt reduced, Hard Lock unlocked!
        const unlockedDash = await request(app)
          .get('/api/v1/users/me/dashboard')
          .set('Authorization', `Bearer ${token}`);
        expect(unlockedDash.body.review_debt_tier).toBe('TIER_2_PRIORITIZED_GATE');
        expect(unlockedDash.body.due_reviews_count).toBe(9);
    });
  });

  // =========================================================================
  // 2. NON-INFLATIONARY GAMIFICATION & XP CEILINGS
  // =========================================================================
  describe('2. Non-Inflationary Gamification Rules', () => {
    it('enforces 150 daily Practice XP ceiling while keeping Milestone and Recovery XP strictly exempt', async () => {
      const reg = await authService.register({
        email: 'xp.tester.a10@example.com',
        password: 'Password123!',
        displayName: 'XP Tester',
        timezone: 'Asia/Jakarta',
      });
      const userId = reg.user.id;

      // 1. Earn 140 Practice XP (7 attempts x 20 XP)
      for (let i = 0; i < 7; i++) {
        await xpService.awardXp(userId, {
          category: 'PRACTICE',
          baseXp: 20,
          referenceId: `attempt-a10-${i}`,
          referenceType: 'LESSON',
        });
      }
      let summary = await xpService.getXpSummary(userId);
      expect(summary.today_practice_xp).toBe(140);

      // 2. Next 20 XP attempt is capped at +10 XP (total 150)
      const cappedAward = await xpService.awardXp(userId, {
        category: 'PRACTICE',
        baseXp: 20,
        referenceId: 'attempt-a10-8',
        referenceType: 'LESSON',
      });
      expect(cappedAward.totalXpAwarded).toBe(10);

      // 3. Further practice XP awards 0 XP
      const zeroAward = await xpService.awardXp(userId, {
        category: 'PRACTICE',
        baseXp: 20,
        referenceId: 'attempt-a10-9',
        referenceType: 'LESSON',
      });
      expect(zeroAward.totalXpAwarded).toBe(0);
      expect(zeroAward.awarded).toBe(false);

      // 4. Milestone XP is EXEMPT from Practice XP ceiling
      const milestoneAward = await xpService.awardXp(userId, {
        category: 'MILESTONE',
        baseXp: 50,
        referenceId: 'capstone-day-30',
        referenceType: 'MILESTONE',
      });
      expect(milestoneAward.totalXpAwarded).toBe(50);

      // 5. Recovery XP is EXEMPT from Practice XP ceiling
      const recoveryAward = await xpService.awardXp(userId, {
        category: 'RECOVERY',
        baseXp: 25,
        referenceId: 'recovery-challenge-1',
        referenceType: 'RECOVERY',
      });
      expect(recoveryAward.totalXpAwarded).toBe(25);

      // Total XP = 150 + 50 + 25 = 225
      summary = await xpService.getXpSummary(userId);
      expect(summary.today_practice_xp).toBe(150);
      expect(summary.total_xp).toBe(225);
    });
  });

  // =========================================================================
  // 3. SECURITY RED TEAM PENETRATION SCENARIOS
  // =========================================================================
  describe('3. Security Red Team Penetration Scenarios', () => {
    it('EXPLOIT 1: Tampered Client Score in Sync Payload is BLOCKED/OVERWRITTEN by Server Grading', async () => {
      // Attacker attempts to forge client-side score: 100% on an attempt
      const syncRes = await request(app)
        .post('/api/v1/learning/sync')
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({
          commands: [
            {
              command_id: '018e6a32-7f22-7901-b28f-1a98234bc501',
              installation_id: 'red_team_inst_01',
              client_seq: 1,
              command_type: 'SUBMIT_LESSON_ATTEMPT',
              payload: {
                lesson_id: day1LessonId,
                elapsed_active_seconds: 120,
                // Forged client claims
                score_percentage: 100,
                is_passed: true,
                answers: [], // No valid answers -> server grades 0%
              },
              client_timestamp: new Date().toISOString(),
            },
          ],
        });

      expect(syncRes.status).toBe(200);
      const receipt = syncRes.body.receipts[0];
      expect(receipt.status).toBe('ACCEPTED');
      // Server evaluates true score: 0% because no valid answers were provided!
      expect(receipt.result_payload.score_percentage).toBe(0);
      expect(receipt.result_payload.passed).toBe(false);
      expect(receipt.result_payload.new_state).not.toBe('COMPLETED');
    });

    it('EXPLOIT 2: Client-Supplied XP Inflation is BLOCKED by Server XP Authority', async () => {
      const syncRes = await request(app)
        .post('/api/v1/learning/sync')
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({
          commands: [
            {
              command_id: '018e6a32-7f22-7901-b28f-1a98234bc502',
              installation_id: 'red_team_inst_02',
              client_seq: 2,
              command_type: 'SUBMIT_LESSON_ATTEMPT',
              payload: {
                lesson_id: day1LessonId,
                elapsed_active_seconds: 120,
                xp_awarded: 999999, // Forged client XP injection
                answers: [],
              },
              client_timestamp: new Date().toISOString(),
            },
          ],
        });

      expect(syncRes.status).toBe(200);
      // Server only awards legitimate XP based on actual grading
      const xpSummary = await xpService.getXpSummary(attackerId);
      // Attacker gets 0 total XP because they failed (0% with empty answers)
      expect(xpSummary.total_xp).toBe(0);
    });

    it('EXPLOIT 3: Offline Quarantine Bypass is DETECTED and Marked PROVISIONAL_STUDY', async () => {
      // 1. Attacker fails attempt via ProgressionEngine (triggers quarantine)
      await progressionEngine.processLessonAttempt({
        userId: attackerId,
        lessonId: day1LessonId,
        scorePercentage: 40.0,
        passed: false,
        elapsedActiveSeconds: 60,
      });

      // 2. Attacker immediately syncs second attempt during quarantine
      const syncRes = await request(app)
        .post('/api/v1/learning/sync')
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({
          commands: [
            {
              command_id: '018e6a32-7f22-7901-b28f-1a98234bc503',
              installation_id: 'red_team_inst_03',
              client_seq: 3,
              command_type: 'SUBMIT_LESSON_ATTEMPT',
              payload: {
                lesson_id: day1LessonId,
                elapsed_active_seconds: 120,
                answers: [{ question_id: quizQuestionId, selected_option_ids: [correctOptionId] }],
              },
              client_timestamp: new Date().toISOString(),
            },
          ],
        });

      expect(syncRes.status).toBe(200);
      // Even with correct answers, state should NOT advance due to quarantine
      const prog = await db.query(
        `SELECT state FROM user_progress WHERE user_id = $1 AND lesson_id = $2`,
        [attackerId, day1LessonId]
      );
      expect(prog.rows[0].state).not.toBe('COMPLETED');
    });

    it('EXPLOIT 4: Cross-User IDOR Access is BLOCKED (403 Forbidden)', async () => {
      const idorRes = await request(app)
        .get(`/api/v1/users/${victimId}/data`)
        .set('Authorization', `Bearer ${attackerToken}`);

      expect(idorRes.status).toBe(403);
      expect(idorRes.body.error.code).toBe('FORBIDDEN');
    });

    it('EXPLOIT 5: Replayed & Duplicate Command Envelopes are DETECTED and IDEMPOTENTLY Dropped', async () => {
      const commandId = '018e6a32-7f22-7901-b28f-1a98234bc505';

      // 1. Initial valid command
      const res1 = await request(app)
        .post('/api/v1/learning/sync')
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({
          commands: [
            {
              command_id: commandId,
              installation_id: 'red_team_inst_05',
              client_seq: 4,
              command_type: 'SUBMIT_LESSON_ATTEMPT',
              payload: {
                lesson_id: day1LessonId,
                elapsed_active_seconds: 120,
                answers: [],
              },
              client_timestamp: new Date().toISOString(),
            },
          ],
        });
      expect(res1.status).toBe(200);
      const firstStatus = res1.body.receipts[0].status;
      // First command may be ACCEPTED or QUARANTINED depending on attacker state;
      // the critical assertion is that the REPLAY returns DUPLICATE.
      expect(['ACCEPTED', 'QUARANTINED']).toContain(firstStatus);

      // 2. Replayed duplicate command with identical command_id
      const res2 = await request(app)
        .post('/api/v1/learning/sync')
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({
          commands: [
            {
              command_id: commandId,
              installation_id: 'red_team_inst_05',
              client_seq: 5,
              command_type: 'SUBMIT_LESSON_ATTEMPT',
              payload: {
                lesson_id: day1LessonId,
                elapsed_active_seconds: 120,
                answers: [],
              },
              client_timestamp: new Date().toISOString(),
            },
          ],
        });
      expect(res2.status).toBe(200);
      expect(res2.body.receipts[0].status).toBe('DUPLICATE');
    });

    it('EXPLOIT 6: Timezone Spoofing & Rapid Shifting is BLOCKED (409 Conflict)', async () => {
      // 1. First legitimate timezone update
      const tz1 = await request(app)
        .put('/api/v1/gamification/timezone')
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({ timezone: 'America/New_York' });
      expect(tz1.status).toBe(200);

      // 2. Immediate second update within 30 days is blocked
      const tz2 = await request(app)
        .put('/api/v1/gamification/timezone')
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({ timezone: 'Asia/Tokyo' });
      expect(tz2.status).toBe(409);
      expect(tz2.body.error.code).toBe('CONFLICT');
    });

    it('EXPLOIT 7: SQL Injection in Input Parameters is MITIGATED by Parameterized Statements', async () => {
      const sqlInjectionRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: "' OR 1=1 --",
          password: "' OR 1=1 --",
        });

      // Zod rejects invalid email format before query, and parameterized queries protect DB
      expect(sqlInjectionRes.status).toBe(400);
      expect(sqlInjectionRes.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('EXPLOIT 8: Impossible State Transitions (LOCKED -> COMPLETED) are BLOCKED by Invariants', async () => {
      // Day 2 lesson exists and is LOCKED (requires Day 1 completion by attacker)
      const d2Res = await db.query<{ id: string }>('SELECT id FROM lessons WHERE day_number = 2;');
      expect(d2Res.rows.length).toBeGreaterThan(0);
      const day2LessonId = d2Res.rows[0].id;

      // Attacker has NOT completed Day 1, so Day 2 is LOCKED
      await expect(
        progressionEngine.processLessonAttempt({
          userId: attackerId,
          lessonId: day2LessonId,
          scorePercentage: 90,
          passed: true,
          elapsedActiveSeconds: 120,
        })
      ).rejects.toThrow(/prerequisites have not been satisfied/i);
    });
  });
});
