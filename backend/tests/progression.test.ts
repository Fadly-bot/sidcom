import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createTestDatabase, IDatabase, setDb } from '../src/db/index.js';
import { migrateUp } from '../src/db/migrator.js';
import { seedDatabase } from '../src/db/seed.js';
import { AuthService } from '../src/auth/auth-service.js';

describe('Phase A.4: Learning Domain & Progression State Machine Suite', () => {
  let db: IDatabase;
  let app: ReturnType<typeof createApp>;
  let authService: AuthService;
  let learnerToken: string;
  let learnerId: string;
  let day1LessonId: string;
  let day2LessonId: string;
  let day1QuizId: string;
  let q1Id: string;
  let q1CorrectOptId: string;
  let q1WrongOptId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    setDb(db);
    await migrateUp(db);
    await seedDatabase(db);
    authService = new AuthService(db);
    app = createApp();

    // 1. Register a test learner
    const regRes = await authService.register({
      email: 'learner@example.com',
      password: 'StrongPassword123!',
      displayName: 'Budi Pembelajar'
    });
    learnerToken = regRes.tokens.accessToken;
    learnerId = regRes.user.id;

    // 2. Fetch Day 1 Lesson ID from DB seed
    const day1Res = await db.query<{ id: string }>('SELECT id FROM lessons WHERE day_number = 1;');
    day1LessonId = day1Res.rows[0].id;

    // 3. Seed Day 2 Lesson with prerequisite = Day 1
    const week1Res = await db.query<{ id: string }>('SELECT id FROM weeks WHERE week_number = 1;');
    const week1Id = week1Res.rows[0].id;
    day2LessonId = 'L-P01-W01-D02';

    await db.query(
      `INSERT INTO lessons (id, week_id, day_number, title, activity_type, duration_minutes, difficulty_level, prerequisite_lesson_id, content_version, content_hash, payload_json)
       VALUES ($1, $2, 2, 'Day 2: Minto Pyramid Exploration', 'SCENARIO', 15, 1, $3, '1.0.0', 'hash_d2', '{}'::jsonb);`,
      [day2LessonId, week1Id, day1LessonId]
    );

    // 4. Seed Quiz, Question, and Answer Options for Day 1
    day1QuizId = 'quiz_day_1';
    await db.query(
      'INSERT INTO quizzes (id, lesson_id, passing_threshold_percentage) VALUES ($1, $2, 80.00);',
      [day1QuizId, day1LessonId]
    );

    q1Id = 'q_d1_01';
    await db.query(
      "INSERT INTO questions (id, quiz_id, question_text, question_type, sequence_order) VALUES ($1, $2, 'Apa elemen pertama metode PREP?', 'MULTIPLE_CHOICE', 1);",
      [q1Id, day1QuizId]
    );

    q1CorrectOptId = 'opt_d1_01_correct';
    q1WrongOptId = 'opt_d1_01_wrong';

    await db.query(
      `INSERT INTO answer_options (id, question_id, option_key, option_text, is_correct, explanation_text)
       VALUES 
       ($1, $2, 'A', 'Point (Inti pesan)', true, 'Benar: P mewakili Point.'),
       ($3, $2, 'B', 'Pleasantry (Basa-basi)', false, 'Salah: P bukan Pleasantry.');`,
      [q1CorrectOptId, q1Id, q1WrongOptId]
    );
  });

  afterAll(async () => {
    setDb(null);
    await db.close();
  });

  describe('Day 1 Initial Access & Path Progression', () => {
    it('should initialize Day 1 as AVAILABLE and Day 2 as LOCKED for a new learner', async () => {
      const res = await request(app)
        .get('/api/v1/learning/progress')
        .set('Authorization', `Bearer ${learnerToken}`);

      expect(res.status).toBe(200);
      const { progress } = res.body;
      expect(Array.isArray(progress)).toBe(true);

      const day1 = progress.find((p: { id: string }) => p.id === day1LessonId);
      const day2 = progress.find((p: { id: string }) => p.id === day2LessonId);

      expect(day1).toBeDefined();
      expect(day1.state).toBe('AVAILABLE');

      expect(day2).toBeDefined();
      expect(day2.state).toBe('LOCKED');
    });

    it('should allow fetching Day 1 lesson detail because it is AVAILABLE', async () => {
      const res = await request(app)
        .get(`/api/v1/learning/lessons/${day1LessonId}`)
        .set('Authorization', `Bearer ${learnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('lesson');
      expect(res.body.lesson.id).toBe(day1LessonId);
      expect(res.body.progress.state).toBe('AVAILABLE');
      expect(res.body.questions).toHaveLength(1);
    });

    it('should FORBID fetching Day 2 lesson detail because it is LOCKED (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/learning/lessons/${day2LessonId}`)
        .set('Authorization', `Bearer ${learnerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('locked');
    });
  });

  describe('Lesson Failure, Anti-Speed Bot Guard & 15-Minute Quarantine', () => {
    it('should reject attempt if active elapsed time is < 45 seconds (bot protection)', async () => {
      const res = await request(app)
        .post(`/api/v1/learning/lessons/${day1LessonId}/submit`)
        .set('Authorization', `Bearer ${learnerToken}`)
        .send({
          answers: [{ question_id: q1Id, selected_option_ids: [q1CorrectOptId] }],
          elapsed_active_seconds: 30 // < 45s
        });

      expect(res.status).toBe(200);
      expect(res.body.min_active_seconds_met).toBe(false);
      expect(res.body.provisional_study).toBe(true);
      expect(res.body.new_state).toBe('AVAILABLE'); // Did NOT transition to COMPLETED
    });

    it('should handle failed attempt (< 80%): retain AVAILABLE, increment attempts, and set 15m quarantine', async () => {
      const res = await request(app)
        .post(`/api/v1/learning/lessons/${day1LessonId}/submit`)
        .set('Authorization', `Bearer ${learnerToken}`)
        .send({
          answers: [{ question_id: q1Id, selected_option_ids: [q1WrongOptId] }],
          elapsed_active_seconds: 120
        });

      expect(res.status).toBe(200);
      expect(res.body.passed).toBe(false);
      expect(res.body.score_percentage).toBe(0);
      expect(res.body.new_state).toBe('AVAILABLE');
      expect(res.body.quarantined).toBe(true);
      expect(res.body.quarantine_until).toBeDefined();

      const quarantineTime = new Date(res.body.quarantine_until).getTime();
      expect(quarantineTime).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
    });

    it('should flag sub-15-minute retry as PROVISIONAL_STUDY and refuse to unlock progression', async () => {
      const res = await request(app)
        .post(`/api/v1/learning/lessons/${day1LessonId}/submit`)
        .set('Authorization', `Bearer ${learnerToken}`)
        .send({
          answers: [{ question_id: q1Id, selected_option_ids: [q1CorrectOptId] }],
          elapsed_active_seconds: 90
        });

      expect(res.status).toBe(200);
      expect(res.body.provisional_study).toBe(true);
      expect(res.body.new_state).toBe('AVAILABLE'); // Quarantined, does not unlock
    });
  });

  describe('Authoritative Completion & Sequential Unlocking (Day N+1 Unlocks)', () => {
    beforeAll(async () => {
      // Clear quarantine for Day 1 to test authoritative pass
      await db.query('UPDATE user_progress SET quarantine_until = NULL WHERE lesson_id = $1;', [day1LessonId]);
    });

    it('should transition Day 1 to COMPLETED when score >= 80% and immediately unlock Day 2 to AVAILABLE', async () => {
      const res = await request(app)
        .post(`/api/v1/learning/lessons/${day1LessonId}/submit`)
        .set('Authorization', `Bearer ${learnerToken}`)
        .send({
          answers: [{ question_id: q1Id, selected_option_ids: [q1CorrectOptId] }],
          elapsed_active_seconds: 120
        });

      expect(res.status).toBe(200);
      expect(res.body.passed).toBe(true);
      expect(res.body.score_percentage).toBe(100);
      expect(res.body.previous_state).toBe('AVAILABLE');
      expect(res.body.new_state).toBe('COMPLETED');
      expect(res.body.unlocked_next_lesson_id).toBe(day2LessonId);

      // Verify Day 2 is now AVAILABLE on the user progression path
      const pathRes = await request(app)
        .get('/api/v1/learning/progress')
        .set('Authorization', `Bearer ${learnerToken}`);

      const day1 = pathRes.body.progress.find((p: { id: string }) => p.id === day1LessonId);
      const day2 = pathRes.body.progress.find((p: { id: string }) => p.id === day2LessonId);

      expect(day1.state).toBe('COMPLETED');
      // Crucial C.2 invariant: Day 2 is unlocked while Day 1 is ONLY COMPLETED, NOT MASTERED!
      expect(day2.state).toBe('AVAILABLE');
    });

    it('should now allow opening Day 2 lesson because it was unlocked to AVAILABLE', async () => {
      const res = await request(app)
        .get(`/api/v1/learning/lessons/${day2LessonId}`)
        .set('Authorization', `Bearer ${learnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.lesson.id).toBe(day2LessonId);
      expect(res.body.progress.state).toBe('AVAILABLE');
    });
  });

  describe('Mastery Transition via Day +1 Retrieval Drill', () => {
    it('should preserve COMPLETED if Day +1 retrieval drill fails (< 80%) without regressing state', async () => {
      const res = await request(app)
        .post(`/api/v1/learning/lessons/${day1LessonId}/mastery-review`)
        .set('Authorization', `Bearer ${learnerToken}`)
        .send({
          review_score: 70.0 // < 80%
        });

      expect(res.status).toBe(200);
      expect(res.body.progress.state).toBe('COMPLETED');
      expect(res.body.progress.mastered_at).toBeNull();
    });

    it('should elevate Day 1 to MASTERED when Day +1 retrieval drill passes (>= 80%)', async () => {
      const res = await request(app)
        .post(`/api/v1/learning/lessons/${day1LessonId}/mastery-review`)
        .set('Authorization', `Bearer ${learnerToken}`)
        .send({
          review_score: 95.0 // >= 80%
        });

      expect(res.status).toBe(200);
      expect(res.body.progress.state).toBe('MASTERED');
      expect(res.body.progress.mastered_at).toBeDefined();

      // Verify path reflects MASTERED
      const pathRes = await request(app)
        .get('/api/v1/learning/progress')
        .set('Authorization', `Bearer ${learnerToken}`);

      const day1 = pathRes.body.progress.find((p: { id: string }) => p.id === day1LessonId);
      expect(day1.state).toBe('MASTERED');
    });
  });

  describe('Invariant & Anti-Regression Enforcements', () => {
    it('should prevent jumping directly to MASTERED for an uncompleted AVAILABLE lesson', async () => {
      // Day 2 is currently AVAILABLE (not COMPLETED)
      const res = await request(app)
        .post(`/api/v1/learning/lessons/${day2LessonId}/mastery-review`)
        .set('Authorization', `Bearer ${learnerToken}`)
        .send({
          review_score: 100.0
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('Must reach COMPLETED first');
    });

    it('should prevent replaying a MASTERED lesson from regressing backwards', async () => {
      // Replaying Day 1 with a poor attempt (e.g. 0 score)
      const res = await request(app)
        .post(`/api/v1/learning/lessons/${day1LessonId}/submit`)
        .set('Authorization', `Bearer ${learnerToken}`)
        .send({
          answers: [{ question_id: q1Id, selected_option_ids: [q1WrongOptId] }],
          elapsed_active_seconds: 100
        });

      expect(res.status).toBe(200);
      expect(res.body.new_state).toBe('MASTERED'); // Never regresses!
    });
  });
});
