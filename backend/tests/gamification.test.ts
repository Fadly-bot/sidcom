import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createTestDatabase, IDatabase, setDb } from '../src/db/index.js';
import { migrateUp } from '../src/db/migrator.js';
import { seedDatabase } from '../src/db/seed.js';
import { AuthService } from '../src/auth/auth-service.js';
import { XpService } from '../src/gamification/xp-service.js';
import { StreakService } from '../src/gamification/streak-service.js';
import { getZonedTime } from '../src/gamification/timezone-utils.js';

describe('Phase A.7: XP, Streak & Timezone Gamification Engine Suite', () => {
  let db: IDatabase;
  let app: ReturnType<typeof createApp>;
  let authService: AuthService;
  let xpService: XpService;
  let streakService: StreakService;
  let userAToken: string;
  let userAId: string;
  let userBToken: string;
  let userBId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    setDb(db);
    await migrateUp(db);
    await seedDatabase(db);
    authService = new AuthService(db);
    xpService = new XpService(db);
    streakService = new StreakService(db);
    app = createApp();

    const regA = await authService.register({
      email: 'gamer_a@example.com',
      password: 'StrongPassword123!',
      displayName: 'Gamer A'
    });
    userAToken = regA.tokens.accessToken;
    userAId = regA.user.id;

    const regB = await authService.register({
      email: 'gamer_b@example.com',
      password: 'StrongPassword123!',
      displayName: 'Gamer B'
    });
    userBToken = regB.tokens.accessToken;
    userBId = regB.user.id;
  });

  afterAll(async () => {
    setDb(null);
    await db.close();
  });

  describe('Non-Inflationary Categorized XP Economics', () => {
    it('should award Practice XP with bonus for high scoring (>= 90%)', async () => {
      const award = await xpService.awardXp(userAId, {
        category: 'PRACTICE',
        baseXp: 15,
        bonusXp: 10,
        referenceId: 'lesson_d1',
        referenceType: 'LESSON'
      });

      expect(award.awarded).toBe(true);
      expect(award.totalXpAwarded).toBe(25);
      expect(award.baseXpAwarded).toBe(15);
      expect(award.bonusXpAwarded).toBe(10);
      expect(award.category).toBe('PRACTICE');
    });

    it('should reject duplicate Practice XP for the same reference (zero-XP replay)', async () => {
      const replayAward = await xpService.awardXp(userAId, {
        category: 'PRACTICE',
        baseXp: 15,
        bonusXp: 10,
        referenceId: 'lesson_d1',
        referenceType: 'LESSON'
      });

      expect(replayAward.awarded).toBe(false);
      expect(replayAward.totalXpAwarded).toBe(0);
      expect(replayAward.reason).toContain('zero-XP replay');
    });

    it('should enforce the hard 150 Practice XP daily ceiling and cap partial rewards', async () => {
      // User A already has 25 Practice XP from first test.
      // Award 100 more Practice XP -> total 125
      const award2 = await xpService.awardXp(userAId, {
        category: 'PRACTICE',
        baseXp: 100,
        referenceId: 'lesson_d2',
        referenceType: 'LESSON'
      });
      expect(award2.awarded).toBe(true);
      expect(award2.totalXpAwarded).toBe(100);

      // Remaining allowance: 150 - 125 = 25 XP.
      // Attempting to award 50 XP should be capped at remaining 25 XP
      const award3 = await xpService.awardXp(userAId, {
        category: 'PRACTICE',
        baseXp: 30,
        bonusXp: 20,
        referenceId: 'lesson_d3',
        referenceType: 'LESSON'
      });
      expect(award3.awarded).toBe(true);
      expect(award3.totalXpAwarded).toBe(25); // Exactly reaches 150 ceiling

      // Next Practice XP attempt must be rejected with 0 XP
      const award4 = await xpService.awardXp(userAId, {
        category: 'PRACTICE',
        baseXp: 15,
        referenceId: 'lesson_d4',
        referenceType: 'LESSON'
      });
      expect(award4.awarded).toBe(false);
      expect(award4.totalXpAwarded).toBe(0);
      expect(award4.reason).toContain('Daily Practice XP ceiling reached');
    });

    it('should award Milestone XP in full even after hitting the 150 Practice XP ceiling', async () => {
      // Milestone XP (Checkpoint/Capstone) is exempt from 150 ceiling
      const milestoneAward = await xpService.awardXp(userAId, {
        category: 'MILESTONE',
        baseXp: 100,
        bonusXp: 25,
        referenceId: 'capstone_phase_1',
        referenceType: 'CAPSTONE'
      });

      expect(milestoneAward.awarded).toBe(true);
      expect(milestoneAward.totalXpAwarded).toBe(125);
      expect(milestoneAward.category).toBe('MILESTONE');
    });

    it('should award Recovery XP in full even after hitting the 150 Practice XP ceiling', async () => {
      const recoveryAward = await xpService.awardXp(userAId, {
        category: 'RECOVERY',
        baseXp: 20,
        referenceId: 'recovery_session_01',
        referenceType: 'RECOVERY'
      });

      expect(recoveryAward.awarded).toBe(true);
      expect(recoveryAward.totalXpAwarded).toBe(20);
      expect(recoveryAward.category).toBe('RECOVERY');
    });

    it('should return accurate XP summary and daily cap usage via API', async () => {
      const res = await request(app)
        .get('/api/v1/gamification/xp')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.daily_practice_ceiling).toBe(150);
      expect(res.body.today_practice_xp).toBe(150);
      expect(res.body.breakdown.practice_xp).toBe(150);
      expect(res.body.breakdown.milestone_xp).toBe(125);
      expect(res.body.breakdown.recovery_xp).toBe(20);
      expect(res.body.total_xp).toBe(150 + 125 + 20);
    });
  });

  describe('Authoritative Streak Engine & Qualifying Actions', () => {
    it('should start streak at 1 on first qualifying action', async () => {
      const result = await streakService.recordQualifyingActivity(userBId, {
        actionType: 'LESSON',
        clientTimestamp: '2026-09-20T10:00:00Z'
      });

      expect(result.streakIncremented).toBe(true);
      expect(result.currentStreak).toBe(1);
      expect(result.bankedFreezes).toBe(0);
    });

    it('should not duplicate increment streak on same calendar day', async () => {
      const repeatResult = await streakService.recordQualifyingActivity(userBId, {
        actionType: 'REVIEW_SESSION',
        clientTimestamp: '2026-09-20T14:00:00Z'
      });

      expect(repeatResult.streakIncremented).toBe(false);
      expect(repeatResult.currentStreak).toBe(1);
    });

    it('should increment streak on consecutive calendar day', async () => {
      const consecutiveResult = await streakService.recordQualifyingActivity(userBId, {
        actionType: 'LESSON',
        clientTimestamp: '2026-09-21T10:00:00Z'
      });

      expect(consecutiveResult.streakIncremented).toBe(true);
      expect(consecutiveResult.currentStreak).toBe(2);
    });

    it('should earn 1 banked freeze every 14 days of unbroken streak (max 2 freezes)', async () => {
      // Simulate streak advancing to 14
      await db.query(
        "UPDATE user_streaks SET current_streak = 13, last_activity_date = '2026-09-21', banked_freezes = 0 WHERE user_id = $1;",
        [userBId]
      );

      const day14Result = await streakService.recordQualifyingActivity(userBId, {
        actionType: 'LESSON',
        clientTimestamp: '2026-09-22T10:00:00Z'
      });

      expect(day14Result.currentStreak).toBe(14);
      expect(day14Result.bankedFreezes).toBe(1); // Earned 1 freeze!
    });

    it('should automatically consume 1 banked freeze when missing 1 calendar day', async () => {
      // Last activity date was 2026-09-22.
      // Next activity on 2026-09-24 (missed 2026-09-23).
      const freezeResult = await streakService.recordQualifyingActivity(userBId, {
        actionType: 'LESSON',
        clientTimestamp: '2026-09-24T10:00:00Z'
      });

      expect(freezeResult.savedByFreeze).toBe(true);
      expect(freezeResult.bankedFreezes).toBe(0); // Consumed the 1 banked freeze
      expect(freezeResult.currentStreak).toBe(15); // Preserved and advanced!
    });

    it('should break streak to 1 and open 24h grace recovery window when missing days without freeze', async () => {
      // Last activity 2026-09-24. Next activity 2026-09-27 (missed 2 days, 0 freezes left)
      const brokenResult = await streakService.recordQualifyingActivity(userBId, {
        actionType: 'LESSON',
        clientTimestamp: '2026-09-27T10:00:00Z'
      });

      expect(brokenResult.currentStreak).toBe(1); // Reset to 1
      expect(brokenResult.savedByFreeze).toBe(false);

      const status = await streakService.getStreakStatus(userBId);
      expect(status.in_grace_recovery).toBe(true);
      expect(status.grace_recovery_expires_at).toBeDefined();
    });

    it('should restore streak when completing 24h grace recovery challenge', async () => {
      // Set previous streak to 15 in grace window
      await db.query(
        "UPDATE user_streaks SET current_streak = 15, grace_window_ends_at = NOW() + INTERVAL '12 hours' WHERE user_id = $1;",
        [userBId]
      );

      const res = await request(app)
        .post('/api/v1/gamification/streak/recovery')
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(200);
      expect(res.body.savedByGraceWindow).toBe(true);
      expect(res.body.currentStreak).toBe(16); // Restored + incremented!
    });

    it('should attribute activity within 15-minute midnight grace to previous day', async () => {
      // Set user's last activity to 2026-09-28
      await db.query(
        "UPDATE user_streaks SET current_streak = 5, last_activity_date = '2026-09-28', banked_freezes = 0 WHERE user_id = $1;",
        [userBId]
      );

      // Activity at 00:05:00 on 2026-09-30 (local time)
      // 00:05 is within 15m midnight grace, so it is credited to 2026-09-29!
      // This bridges the consecutive gap from 2026-09-28 to 2026-09-29.
      const graceResult = await streakService.recordQualifyingActivity(userBId, {
        actionType: 'LESSON',
        clientTimestamp: '2026-09-29T17:05:00Z' // 17:05 UTC = 00:05 Asia/Jakarta (+7)
      });

      expect(graceResult.calendarDateUsed).toBe('2026-09-29'); // Attributed to yesterday via grace!
      expect(graceResult.currentStreak).toBe(6); // Streak saved!
    });
  });

  describe('Timezone Governance & Modification Throttle', () => {
    it('should retrieve streak status with authoritative IANA timezone countdown', async () => {
      const res = await request(app)
        .get('/api/v1/gamification/streak')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.profile_timezone).toBe('Asia/Jakarta');
      expect(res.body.seconds_until_midnight).toBeGreaterThan(0);
      expect(res.body.seconds_until_midnight).toBeLessThanOrEqual(86400);
    });

    it('should successfully update user profile timezone', async () => {
      const res = await request(app)
        .put('/api/v1/gamification/timezone')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ timezone: 'Asia/Makassar' }); // UTC+8

      expect(res.status).toBe(200);
      expect(res.body.profile_timezone).toBe('Asia/Makassar');
      expect(res.body.last_timezone_changed_at).toBeDefined();
    });

    it('should enforce 30-day throttle and reject second timezone change with 409 Conflict', async () => {
      const res = await request(app)
        .put('/api/v1/gamification/timezone')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ timezone: 'Asia/Jayapura' });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('30 days');
    });

    it('should reject invalid IANA timezone string with 400 Validation Error', async () => {
      const res = await request(app)
        .put('/api/v1/gamification/timezone')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ timezone: 'Invalid/City_Timezone_Nonexistent' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Invalid IANA timezone');
    });

    it('should reject unauthorized access without token (401)', async () => {
      const res = await request(app)
        .get('/api/v1/gamification/xp');

      expect(res.status).toBe(401);
    });
  });
});
