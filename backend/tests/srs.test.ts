import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createTestDatabase, IDatabase, setDb } from '../src/db/index.js';
import { migrateUp } from '../src/db/migrator.js';
import { seedDatabase } from '../src/db/seed.js';
import { AuthService } from '../src/auth/auth-service.js';
import { DsrAlgorithm } from '../src/srs/dsr-algorithm.js';

describe('Phase A.5: SRS & Review System Suite', () => {
  let db: IDatabase;
  let app: ReturnType<typeof createApp>;
  let authService: AuthService;
  let userAToken: string;
  let userAId: string;
  let userBToken: string;
  let userBId: string;
  let day1LessonId: string;
  let day2LessonId: string;
  let card1Id: string;
  let card2Id: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    setDb(db);
    await migrateUp(db);
    await seedDatabase(db);
    authService = new AuthService(db);
    app = createApp();

    // Register User A
    const regA = await authService.register({
      email: 'srs_a@example.com',
      password: 'StrongPassword123!',
      displayName: 'User A SRS'
    });
    userAToken = regA.tokens.accessToken;
    userAId = regA.user.id;

    // Register User B
    const regB = await authService.register({
      email: 'srs_b@example.com',
      password: 'StrongPassword123!',
      displayName: 'User B SRS'
    });
    userBToken = regB.tokens.accessToken;
    userBId = regB.user.id;

    // Fetch Day 1 Lesson and ReviewCards from seed
    const day1Res = await db.query<{ id: string }>('SELECT id FROM lessons WHERE day_number = 1;');
    day1LessonId = day1Res.rows[0].id;

    const cardsRes = await db.query<{ id: string }>(
      'SELECT id FROM review_cards WHERE lesson_id = $1 ORDER BY id ASC;',
      [day1LessonId]
    );
    card1Id = cardsRes.rows[0].id;
    card2Id = cardsRes.rows[1].id;

    // Seed Day 2 Lesson with prerequisite = Day 1
    const week1Res = await db.query<{ id: string }>('SELECT id FROM weeks WHERE week_number = 1;');
    day2LessonId = 'L-P01-W01-D02';
    await db.query(
      `INSERT INTO lessons (id, week_id, day_number, title, activity_type, duration_minutes, difficulty_level, prerequisite_lesson_id, content_version, content_hash, payload_json)
       VALUES ($1, $2, 2, 'Day 2: Minto Structure', 'SCENARIO', 15, 1, $3, '1.0.0', 'hash_d2', '{}'::jsonb);`,
      [day2LessonId, week1Res.rows[0].id, day1LessonId]
    );
  });

  afterAll(async () => {
    setDb(null);
    await db.close();
  });

  describe('DSR Mathematical Engine Unit Tests', () => {
    it('should compute Retrievability accurately according to the forgetting curve R(t) = (1 + t / 9S)^-1', () => {
      // At t = 0, R = 1.0
      expect(DsrAlgorithm.calculateRetrievability(0, 1.0)).toBe(1.0);

      // At t = 1 day, S = 1.0: R = (1 + 1/9)^-1 = 9/10 = 0.9000
      expect(DsrAlgorithm.calculateRetrievability(1, 1.0)).toBe(0.9);

      // At t = 9 days, S = 1.0: R = (1 + 9/9)^-1 = 0.5000
      expect(DsrAlgorithm.calculateRetrievability(9, 1.0)).toBe(0.5);
    });

    it('should map score percentages to DSR ratings', () => {
      expect(DsrAlgorithm.scoreToRating(75)).toBe(1); // Again (<80%)
      expect(DsrAlgorithm.scoreToRating(82)).toBe(2); // Hard (80-84%)
      expect(DsrAlgorithm.scoreToRating(90)).toBe(3); // Good (85-94%)
      expect(DsrAlgorithm.scoreToRating(98)).toBe(4); // Easy (95-100%)
    });

    it('should update Stability and next Interval according to DSR rating', () => {
      // Rating 4 (Easy) on S = 1.0 -> S_new = 3.5, Interval = round(3.5 * 1.5) = 5 days
      const easyRes = DsrAlgorithm.evaluateReview({
        currentStability: 1.0,
        scorePercentage: 98.0
      });
      expect(easyRes.newStability).toBe(3.5);
      expect(easyRes.intervalDays).toBe(5);
      expect(easyRes.lapsed).toBe(false);

      // Rating 1 (Again) on S = 3.5 -> S_new = max(1.0, 3.5 * 0.2 = 0.7) = 1.0, Interval = 1 day
      const againRes = DsrAlgorithm.evaluateReview({
        currentStability: 3.5,
        scorePercentage: 70.0
      });
      expect(againRes.newStability).toBe(1.0);
      expect(againRes.intervalDays).toBe(1.0);
      expect(againRes.lapsed).toBe(true);
    });
  });

  describe('Card Ingestion on Lesson Completion', () => {
    it('should automatically ingest 2 ReviewCards scheduled for Day +1 (I1 = 1 day) when Day 1 completes', async () => {
      // User A completes Day 1
      await db.query(
        `INSERT INTO user_progress (id, user_id, lesson_id, state, best_score_percentage, attempts_count, completed_at)
         VALUES ('prog_a_d1', $1, $2, 'COMPLETED', 90.0, 1, NOW())
         ON CONFLICT (user_id, lesson_id) DO UPDATE SET state = 'COMPLETED';`,
        [userAId, day1LessonId]
      );

      // Ingest cards via SRS service
      const res = await request(app)
        .get('/api/v1/srs/debt')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      // New cards are due tomorrow (Day +1), so current overdue count should be 0
      expect(res.body.debt.tier).toBe(1);
      expect(res.body.debt.hard_locked).toBe(false);

      // Ingest cards into review_items for User A
      const { SrsService } = await import('../src/srs/srs-service.js');
      const srsService = new SrsService(db);
      const items = await srsService.ingestLessonCards(userAId, day1LessonId);
      expect(items).toHaveLength(2);
      expect(items[0].stability_days).toBe('1.000');
    });
  });

  describe('Day +1 Spaced Retrieval & Mastery Elevation', () => {
    beforeAll(async () => {
      // Simulate Day +1 arrival: set due_at = NOW() - 1 hour for User A's review cards
      await db.query(
        "UPDATE review_items SET due_at = NOW() - INTERVAL '1 hour' WHERE user_id = $1;",
        [userAId]
      );
    });

    it('should serve the due cards in a study session', async () => {
      const res = await request(app)
        .get('/api/v1/srs/session')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.cards.length).toBeGreaterThanOrEqual(2);
      expect(res.body.cards[0].review_card_id).toBe(card1Id);
    });

    it('should elevate parent lesson to MASTERED upon passing Day +1 review (>= 80%)', async () => {
      // Submit review for card 1 with 90%
      const res = await request(app)
        .post('/api/v1/srs/review')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          review_card_id: card1Id,
          score_percentage: 90.0
        });

      expect(res.status).toBe(200);
      expect(res.body.parent_lesson_state).toBe('MASTERED');
      expect(res.body.new_stability).toBe(2.2);

      // Verify DB progress state is now MASTERED
      const progRes = await db.query<{ state: string; mastered_at: string | null }>(
        'SELECT state, mastered_at FROM user_progress WHERE user_id = $1 AND lesson_id = $2;',
        [userAId, day1LessonId]
      );
      expect(progRes.rows[0].state).toBe('MASTERED');
      expect(progRes.rows[0].mastered_at).toBeDefined();
    });

    it('should decay MASTERED to REVIEW_REQUIRED upon a failed retrieval drill (< 80%)', async () => {
      // Now submit card 2 with 60% (Again)
      const res = await request(app)
        .post('/api/v1/srs/review')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          review_card_id: card2Id,
          score_percentage: 60.0
        });

      expect(res.status).toBe(200);
      expect(res.body.calculated_rating).toBe(1);
      expect(res.body.parent_lesson_state).toBe('REVIEW_REQUIRED');

      const progRes = await db.query<{ state: string }>(
        'SELECT state FROM user_progress WHERE user_id = $1 AND lesson_id = $2;',
        [userAId, day1LessonId]
      );
      expect(progRes.rows[0].state).toBe('REVIEW_REQUIRED');
    });

    it('should restore MASTERED status when REVIEW_REQUIRED lesson review is cleared (>= 80%)', async () => {
      // Re-review card 2 with 95%
      const res = await request(app)
        .post('/api/v1/srs/review')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          review_card_id: card2Id,
          score_percentage: 95.0
        });

      expect(res.status).toBe(200);
      expect(res.body.parent_lesson_state).toBe('MASTERED');
    });
  });

  describe('3-Tier Review Debt & Progression Hard Gate', () => {
    beforeAll(async () => {
      // Clean up previous items for deterministic test
      await db.query('DELETE FROM review_items WHERE user_id = $1;', [userAId]);

      // Seed dummy review cards and overdue items to test debt thresholds
      const skillRes = await db.query<{ id: string }>('SELECT id FROM skills LIMIT 1;');
      const skillId = skillRes.rows[0].id;

      for (let i = 1; i <= 15; i++) {
        const dummyCardId = `rc_debt_${i}`;
        await db.query(
          `INSERT INTO review_cards (id, lesson_id, skill_id, prompt_type, prompt_text, answer_payload, explanation)
           VALUES ($1, $2, $3, 'DISCRIMINATION', $4, '{}'::jsonb, 'Penjelasan')
           ON CONFLICT (id) DO NOTHING;`,
          [dummyCardId, day1LessonId, skillId, `Prompt ${i}`]
        );

        await db.query(
          `INSERT INTO review_items (id, user_id, review_card_id, lesson_id, stability_days, due_at)
           VALUES ($1, $2, $3, $4, 1.0, NOW() - INTERVAL '2 days')
           ON CONFLICT (user_id, review_card_id) DO UPDATE SET due_at = NOW() - INTERVAL '2 days';`,
          [`ri_debt_${userAId}_${i}`, userAId, dummyCardId, day1LessonId]
        );
      }
    });

    it('should calculate Tier 3 Review Debt when >= 13 cards are overdue and activate HARD PROGRESSION LOCK', async () => {
      const res = await request(app)
        .get('/api/v1/srs/debt')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.debt.overdue_count).toBe(15);
      expect(res.body.debt.tier).toBe(3);
      expect(res.body.debt.hard_locked).toBe(true);
      expect(res.body.debt.tier_name).toBe('TIER_3_HARD_LOCK');
    });

    it('should HARD LOCK daily lesson detail fetching when in Tier 3 Review Debt (403 Forbidden)', async () => {
      // Ensure Day 2 is AVAILABLE
      await db.query(
        "UPDATE user_progress SET state = 'AVAILABLE' WHERE user_id = $1 AND lesson_id = $2;",
        [userAId, day2LessonId]
      );

      const res = await request(app)
        .get(`/api/v1/learning/lessons/${day2LessonId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('critical review debt (15 overdue cards)');
    });

    it('should HARD LOCK lesson attempt submission when in Tier 3 Review Debt (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/learning/lessons/${day2LessonId}/submit`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          answers: [],
          elapsed_active_seconds: 60
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('critical review debt');
    });

    it('should clear enough debt in one review session (5 cards) to unlock daily lesson (Tier 3 -> Tier 2)', async () => {
      // User reviews 5 overdue cards in one review session
      for (let i = 1; i <= 5; i++) {
        const reviewRes = await request(app)
          .post('/api/v1/srs/review')
          .set('Authorization', `Bearer ${userAToken}`)
          .send({
            review_card_id: `rc_debt_${i}`,
            score_percentage: 90.0
          });
        expect(reviewRes.status).toBe(200);
      }

      // Overdue count is now 15 - 5 = 10 (which is <= 12, Tier 2!)
      const debtRes = await request(app)
        .get('/api/v1/srs/debt')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(debtRes.body.debt.overdue_count).toBe(10);
      expect(debtRes.body.debt.tier).toBe(2);
      expect(debtRes.body.debt.hard_locked).toBe(false); // Unlocked!

      // Now fetching Day 2 daily lesson SUCCEEDS!
      const lessonRes = await request(app)
        .get(`/api/v1/learning/lessons/${day2LessonId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(lessonRes.status).toBe(200);
      expect(lessonRes.body.lesson.id).toBe(day2LessonId);
    });
  });

  describe('Validation & User Isolation', () => {
    it('should reject review submission with invalid score (< 0 or > 100)', async () => {
      const res = await request(app)
        .post('/api/v1/srs/review')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          review_card_id: 'rc_debt_1',
          score_percentage: 150 // Invalid!
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should enforce user isolation: User B has 0 debt when User A has heavy debt', async () => {
      const resA = await request(app)
        .get('/api/v1/srs/debt')
        .set('Authorization', `Bearer ${userAToken}`);

      const resB = await request(app)
        .get('/api/v1/srs/debt')
        .set('Authorization', `Bearer ${userBToken}`);

      expect(resA.body.debt.overdue_count).toBe(10);
      expect(resB.body.debt.overdue_count).toBe(0); // Fully isolated!
    });
  });
});
