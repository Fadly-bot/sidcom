import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createTestDatabase, IDatabase, setDb } from '../src/db/index.js';
import { migrateUp } from '../src/db/migrator.js';
import { seedDatabase } from '../src/db/seed.js';
import { AuthService } from '../src/auth/auth-service.js';

describe('Phase A.6: LearningCommand Offline Sync & Idempotency Suite', () => {
  let db: IDatabase;
  let app: ReturnType<typeof createApp>;
  let authService: AuthService;
  let userAToken: string;
  let userAId: string;
  let userBToken: string;
  let userBId: string;
  let day1LessonId: string;
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

    // Register User A
    const regA = await authService.register({
      email: 'sync_a@example.com',
      password: 'StrongPassword123!',
      displayName: 'User A Sync'
    });
    userAToken = regA.tokens.accessToken;
    userAId = regA.user.id;

    // Register User B
    const regB = await authService.register({
      email: 'sync_b@example.com',
      password: 'StrongPassword123!',
      displayName: 'User B Sync'
    });
    userBToken = regB.tokens.accessToken;
    userBId = regB.user.id;

    // Fetch Day 1 Lesson ID
    const day1Res = await db.query<{ id: string }>('SELECT id FROM lessons WHERE day_number = 1;');
    day1LessonId = day1Res.rows[0].id;

    // Setup quiz for Day 1
    const quizId = 'quiz_sync_d1';
    await db.query(
      'INSERT INTO quizzes (id, lesson_id, passing_threshold_percentage) VALUES ($1, $2, 80.00);',
      [quizId, day1LessonId]
    );

    q1Id = 'q_sync_d1_01';
    await db.query(
      "INSERT INTO questions (id, quiz_id, question_text, question_type, sequence_order) VALUES ($1, $2, 'Pertanyaan Sync', 'MULTIPLE_CHOICE', 1);",
      [q1Id, quizId]
    );

    q1CorrectOptId = 'opt_sync_correct';
    q1WrongOptId = 'opt_sync_wrong';
    await db.query(
      `INSERT INTO answer_options (id, question_id, option_key, option_text, is_correct, explanation_text)
       VALUES 
       ($1, $2, 'A', 'Pilihan Benar', true, 'Penjelasan benar'),
       ($3, $2, 'B', 'Pilihan Salah', false, 'Penjelasan salah');`,
      [q1CorrectOptId, q1Id, q1WrongOptId]
    );
  });

  afterAll(async () => {
    setDb(null);
    await db.close();
  });

  describe('Single Command Synchronization', () => {
    it('should successfully process a single SUBMIT_LESSON_ATTEMPT command envelope', async () => {
      const commandId = '018e6a32-7f22-7901-b28f-1a98234bc501';

      const res = await request(app)
        .post('/api/v1/learning/sync')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          commands: [
            {
              command_id: commandId,
              installation_id: 'inst_web_client_01',
              client_seq: 1,
              command_type: 'SUBMIT_LESSON_ATTEMPT',
              payload: {
                lesson_id: day1LessonId,
                answers: [{ question_id: q1Id, selected_option_ids: [q1CorrectOptId] }],
                elapsed_active_seconds: 120
              },
              client_timestamp: new Date().toISOString()
            }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.synced_count).toBe(1);
      expect(res.body.accepted_count).toBe(1);
      expect(res.body.receipts).toHaveLength(1);

      const receipt = res.body.receipts[0];
      expect(receipt.command_id).toBe(commandId);
      expect(receipt.client_seq).toBe(1);
      expect(receipt.status).toBe('ACCEPTED');
      expect(receipt.result_payload.passed).toBe(true);
      expect(receipt.result_payload.new_state).toBe('COMPLETED');

      // Verify command recorded in processed_commands ledger
      const ledgerRes = await db.query(
        'SELECT * FROM processed_commands WHERE command_id = $1;',
        [commandId]
      );
      expect(ledgerRes.rows).toHaveLength(1);
      expect(ledgerRes.rows[0].status).toBe('ACCEPTED');
    });
  });

  describe('Idempotency & Duplicate Replay Defense', () => {
    it('should return cached receipt on duplicate command replay without re-executing business logic', async () => {
      const commandId = '018e6a32-7f22-7901-b28f-1a98234bc501'; // Replaying earlier command!

      const res = await request(app)
        .post('/api/v1/learning/sync')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          commands: [
            {
              command_id: commandId,
              installation_id: 'inst_web_client_01',
              client_seq: 1,
              command_type: 'SUBMIT_LESSON_ATTEMPT',
              payload: {
                lesson_id: day1LessonId,
                answers: [{ question_id: q1Id, selected_option_ids: [q1CorrectOptId] }],
                elapsed_active_seconds: 120
              },
              client_timestamp: new Date().toISOString()
            }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.synced_count).toBe(1);
      expect(res.body.duplicate_count).toBe(1);
      expect(res.body.receipts[0].status).toBe('DUPLICATE');
      expect(res.body.receipts[0].result_payload).toBeDefined();

      // Ledger still has exactly 1 entry (no duplicate spend)
      const ledgerRes = await db.query(
        'SELECT COUNT(*) as count FROM processed_commands WHERE command_id = $1;',
        [commandId]
      );
      expect(parseInt(ledgerRes.rows[0].count, 10)).toBe(1);
    });
  });

  describe('Ordered Processing & Out-of-Order Sorting', () => {
    it('should sort batch by client_seq ASC and execute in deterministic order', async () => {
      const cmdSeq3 = {
        command_id: '018e6a32-7f22-7901-b28f-1a98234bc503',
        installation_id: 'inst_web_02',
        client_seq: 3,
        command_type: 'SUBMIT_REFLECTION' as const,
        payload: { reflection: { note: 'Refleksi ke-3' } },
        client_timestamp: new Date().toISOString()
      };

      const cmdSeq2 = {
        command_id: '018e6a32-7f22-7901-b28f-1a98234bc502',
        installation_id: 'inst_web_02',
        client_seq: 2,
        command_type: 'SUBMIT_REFLECTION' as const,
        payload: { reflection: { note: 'Refleksi ke-2' } },
        client_timestamp: new Date().toISOString()
      };

      // Send out of order: seq 3 before seq 2
      const res = await request(app)
        .post('/api/v1/learning/sync')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ commands: [cmdSeq3, cmdSeq2] });

      expect(res.status).toBe(200);
      expect(res.body.synced_count).toBe(2);
      expect(res.body.accepted_count).toBe(2);

      // Receipts should be returned ordered by client_seq (seq 2 first, then seq 3)
      expect(res.body.receipts[0].client_seq).toBe(2);
      expect(res.body.receipts[1].client_seq).toBe(3);
    });
  });

  describe('Partial Batch Failure Tolerance', () => {
    it('should process valid commands and mark invalid commands as REJECTED without failing entire batch', async () => {
      const validCmd = {
        command_id: '018e6a32-7f22-7901-b28f-1a98234bc504',
        installation_id: 'inst_web_03',
        client_seq: 4,
        command_type: 'SUBMIT_REFLECTION' as const,
        payload: { reflection: { note: 'Valid reflection' } },
        client_timestamp: new Date().toISOString()
      };

      const invalidCmd = {
        command_id: '018e6a32-7f22-7901-b28f-1a98234bc505',
        installation_id: 'inst_web_03',
        client_seq: 5,
        command_type: 'SUBMIT_LESSON_ATTEMPT' as const,
        payload: {
          lesson_id: 'non_existent_lesson_id', // Invalid lesson
          answers: [],
          elapsed_active_seconds: 60
        },
        client_timestamp: new Date().toISOString()
      };

      const res = await request(app)
        .post('/api/v1/learning/sync')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ commands: [validCmd, invalidCmd] });

      expect(res.status).toBe(200);
      expect(res.body.synced_count).toBe(2);
      expect(res.body.accepted_count).toBe(1);
      expect(res.body.rejected_count).toBe(1);

      const receiptValid = res.body.receipts.find((r: { client_seq: number }) => r.client_seq === 4);
      const receiptInvalid = res.body.receipts.find((r: { client_seq: number }) => r.client_seq === 5);

      expect(receiptValid.status).toBe('ACCEPTED');
      expect(receiptInvalid.status).toBe('REJECTED');
      expect(receiptInvalid.error_message).toBeDefined();
    });
  });

  describe('Offline Quarantine Stamping in Sync', () => {
    it('should flag sub-15m retry attempts in sync as QUARANTINED and prevent progression unlock', async () => {
      // Ensure user_progress exists with an active quarantine on Day 1
      await db.query(
        `INSERT INTO user_progress (id, user_id, lesson_id, state, best_score_percentage, attempts_count, quarantine_until)
         VALUES ($1, $2, $3, 'AVAILABLE', 40.00, 1, NOW() + INTERVAL '10 minutes')
         ON CONFLICT (user_id, lesson_id) DO UPDATE SET quarantine_until = NOW() + INTERVAL '10 minutes';`,
        [`prog_${userBId}_${day1LessonId}`, userBId, day1LessonId]
      );

      const quarantineCmd = {
        command_id: '018e6a32-7f22-7901-b28f-1a98234bc506',
        installation_id: 'inst_android_b',
        client_seq: 1,
        command_type: 'SUBMIT_LESSON_ATTEMPT' as const,
        payload: {
          lesson_id: day1LessonId,
          answers: [{ question_id: q1Id, selected_option_ids: [q1CorrectOptId] }],
          elapsed_active_seconds: 120
        },
        client_timestamp: new Date().toISOString()
      };

      const res = await request(app)
        .post('/api/v1/learning/sync')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ commands: [quarantineCmd] });

      expect(res.status).toBe(200);
      expect(res.body.quarantined_count).toBe(1);
      expect(res.body.receipts[0].status).toBe('QUARANTINED');
      expect(res.body.receipts[0].result_payload.provisional_study).toBe(true);
    });
  });

  describe('Security Boundaries & Validation', () => {
    it('should reject sync request without Authorization token (401)', async () => {
      const res = await request(app)
        .post('/api/v1/learning/sync')
        .send({ commands: [] });

      expect(res.status).toBe(401);
    });

    it('should reject malformed command_id (non-UUID) with 400 Validation Error', async () => {
      const res = await request(app)
        .post('/api/v1/learning/sync')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          commands: [
            {
              command_id: 'invalid-not-a-uuid',
              installation_id: 'inst_01',
              client_seq: 1,
              command_type: 'SUBMIT_REFLECTION',
              payload: {},
              client_timestamp: new Date().toISOString()
            }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should isolate commands between User A and User B', async () => {
      const commandId = '018e6a32-7f22-7901-b28f-1a98234bc599';

      // User A submits command
      await request(app)
        .post('/api/v1/learning/sync')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          commands: [
            {
              command_id: commandId,
              installation_id: 'inst_user_a',
              client_seq: 99,
              command_type: 'SUBMIT_REFLECTION',
              payload: { note: 'A private reflection' },
              client_timestamp: new Date().toISOString()
            }
          ]
        });

      // User B checks ledger for this command
      const ledgerResB = await db.query(
        'SELECT * FROM processed_commands WHERE command_id = $1 AND user_id = $2;',
        [commandId, userBId]
      );
      expect(ledgerResB.rows).toHaveLength(0); // Fully isolated!
    });
  });

  describe('Stress Testing: 1, 10, and 100 Commands Batch Sync', () => {
    it('should handle a 10-command batch synchronously without error', async () => {
      const tenCommands = Array.from({ length: 10 }, (_, i) => ({
        command_id: `018e6a32-7f22-7901-b28f-${(100 + i).toString().padStart(12, '0')}`,
        installation_id: 'stress_inst',
        client_seq: 100 + i,
        command_type: 'SUBMIT_REFLECTION' as const,
        payload: { item_index: i },
        client_timestamp: new Date().toISOString()
      }));

      const res = await request(app)
        .post('/api/v1/learning/sync')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ commands: tenCommands });

      expect(res.status).toBe(200);
      expect(res.body.synced_count).toBe(10);
      expect(res.body.accepted_count).toBe(10);
    });

    it('should handle a 100-command batch synchronously with full idempotency guarantee', async () => {
      const hundredCommands = Array.from({ length: 100 }, (_, i) => ({
        command_id: `018e6a32-7f22-7901-b28f-${(1000 + i).toString().padStart(12, '0')}`,
        installation_id: 'stress_inst_100',
        client_seq: 1000 + i,
        command_type: 'SUBMIT_REFLECTION' as const,
        payload: { item_index: i },
        client_timestamp: new Date().toISOString()
      }));

      const res = await request(app)
        .post('/api/v1/learning/sync')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ commands: hundredCommands });

      expect(res.status).toBe(200);
      expect(res.body.synced_count).toBe(100);
      expect(res.body.accepted_count).toBe(100);

      // Replay the exact same 100 commands immediately (Stress test duplicate batch)
      const replayRes = await request(app)
        .post('/api/v1/learning/sync')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ commands: hundredCommands });

      expect(replayRes.status).toBe(200);
      expect(replayRes.body.synced_count).toBe(100);
      expect(replayRes.body.duplicate_count).toBe(100);
      expect(replayRes.body.accepted_count).toBe(0); // 0 double-spends!
    });
  });
});
