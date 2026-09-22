import { IDatabase } from '../db/index.js';
import { ProgressionState, UserProgressRecord } from './types.js';
import { ConflictError, NotFoundError } from '../errors/app-error.js';

export class ProgressionEngine {
  constructor(private db: IDatabase) {}

  /**
   * Evaluates and returns the user's progress record for a lesson.
   * If no record exists, calculates whether it should be AVAILABLE (e.g. Day 1) or LOCKED.
   */
  async getOrCreateUserProgress(
    userId: string,
    lessonId: string
  ): Promise<UserProgressRecord> {
    const existing = await this.db.query<UserProgressRecord>(
      'SELECT * FROM user_progress WHERE user_id = $1 AND lesson_id = $2;',
      [userId, lessonId]
    );

    const firstRow = existing.rows[0];
    if (firstRow) {
      return firstRow;
    }

    // Determine initial state based on prerequisites
    const lessonRes = await this.db.query<{
      id: string;
      prerequisite_lesson_id: string | null;
      day_number: number;
    }>('SELECT id, prerequisite_lesson_id, day_number FROM lessons WHERE id = $1;', [lessonId]);

    const lesson = lessonRes.rows[0];
    if (!lesson) {
      throw new NotFoundError('Lesson', lessonId);
    }

    let initialState: ProgressionState = 'LOCKED';

    if (!lesson.prerequisite_lesson_id) {
      // Day 1 / no prerequisite -> AVAILABLE by default
      initialState = 'AVAILABLE';
    } else {
      // Check if prerequisite is already COMPLETED or MASTERED
      const prereqProgress = await this.db.query<UserProgressRecord>(
        'SELECT state FROM user_progress WHERE user_id = $1 AND lesson_id = $2;',
        [userId, lesson.prerequisite_lesson_id]
      );

      const prereq = prereqProgress.rows[0];
      if (
        prereq &&
        (prereq.state === 'COMPLETED' || prereq.state === 'MASTERED')
      ) {
        initialState = 'AVAILABLE';
      }
    }

    const newId = `prog_${userId}_${lessonId}`;
    const insertRes = await this.db.query<UserProgressRecord>(
      `INSERT INTO user_progress (id, user_id, lesson_id, state, best_score_percentage, attempts_count)
       VALUES ($1, $2, $3, $4, 0.00, 0)
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET updated_at = NOW()
       RETURNING *;`,
      [newId, userId, lessonId, initialState]
    );

    const created = insertRes.rows[0];
    if (!created) {
      throw new Error(`Failed to initialize progress for lesson ${lessonId}`);
    }
    return created;
  }

  /**
   * Authoritatively updates lesson progression upon completing a formative lesson attempt.
   */
  async processLessonAttempt(params: {
    userId: string;
    lessonId: string;
    scorePercentage: number;
    passed: boolean;
    elapsedActiveSeconds: number;
  }): Promise<{
    previousState: ProgressionState;
    newState: ProgressionState;
    unlockedNextLessonId: string | null;
    quarantineUntil: string | null;
    provisionalStudy: boolean;
  }> {
    const { userId, lessonId, scorePercentage, passed, elapsedActiveSeconds } = params;
    const progress = await this.getOrCreateUserProgress(userId, lessonId);

    // Rule: Minimum active seconds (anti-speed bot guard)
    if (elapsedActiveSeconds < 45) {
      return {
        previousState: progress.state,
        newState: progress.state,
        unlockedNextLessonId: null,
        quarantineUntil: progress.quarantine_until,
        provisionalStudy: true
      };
    }

    // Rule: Invariant check - LOCKED lessons cannot be completed directly
    if (progress.state === 'LOCKED') {
      throw new ConflictError(
        `Cannot complete lesson ${lessonId}: prerequisites have not been satisfied (state: LOCKED).`
      );
    }

    const now = new Date();

    // Rule: Anti-brute-force quarantine check
    if (progress.quarantine_until && new Date(progress.quarantine_until) > now) {
      // Submitting during 15-minute cool-down -> recorded as PROVISIONAL_STUDY
      return {
        previousState: progress.state,
        newState: progress.state,
        unlockedNextLessonId: null,
        quarantineUntil: progress.quarantine_until,
        provisionalStudy: true
      };
    }

    // Preserve-Max rule: if already MASTERED, stay MASTERED.
    // If already COMPLETED, stay COMPLETED (or MASTERED).
    if (progress.state === 'MASTERED') {
      const bestScore = Math.max(Number(progress.best_score_percentage), scorePercentage);
      await this.db.query(
        'UPDATE user_progress SET best_score_percentage = $1, attempts_count = attempts_count + 1, updated_at = NOW() WHERE id = $2;',
        [bestScore, progress.id]
      );
      return {
        previousState: 'MASTERED',
        newState: 'MASTERED',
        unlockedNextLessonId: null,
        quarantineUntil: null,
        provisionalStudy: false
      };
    }

    if (passed) {
      // Attempt passed! (score >= 80%)
      const newState: ProgressionState = 'COMPLETED';
      const bestScore = Math.max(Number(progress.best_score_percentage), scorePercentage);

      await this.db.query(
        `UPDATE user_progress 
         SET state = $1, 
             best_score_percentage = $2, 
             attempts_count = attempts_count + 1,
             completed_at = COALESCE(completed_at, NOW()),
             quarantine_until = NULL,
             updated_at = NOW() 
         WHERE id = $3;`,
        [newState, bestScore, progress.id]
      );

      // Unlock subsequent lesson(s) that have this lesson as prerequisite
      const unlockedNextLessonId = await this.unlockSubsequentLessons(userId, lessonId);

      return {
        previousState: progress.state,
        newState,
        unlockedNextLessonId,
        quarantineUntil: null,
        provisionalStudy: false
      };
    } else {
      // Attempt failed (< 80%)
      // Quarantine user on this lesson for 15 minutes to prevent guessing
      const quarantineDate = new Date(now.getTime() + 15 * 60 * 1000);
      const quarantineIso = quarantineDate.toISOString();
      const bestScore = Math.max(Number(progress.best_score_percentage), scorePercentage);

      await this.db.query(
        `UPDATE user_progress 
         SET best_score_percentage = $1, 
             attempts_count = attempts_count + 1,
             quarantine_until = $2,
             updated_at = NOW() 
         WHERE id = $3;`,
        [bestScore, quarantineIso, progress.id]
      );

      return {
        previousState: progress.state,
        newState: progress.state, // Remains AVAILABLE
        unlockedNextLessonId: null,
        quarantineUntil: quarantineIso,
        provisionalStudy: false
      };
    }
  }

  /**
   * Promotes a COMPLETED lesson to MASTERED upon passing the Day +1 ($I_1$) Spaced Retrieval drill.
   */
  async promoteToMastered(userId: string, lessonId: string, reviewScore: number): Promise<UserProgressRecord> {
    const progress = await this.getOrCreateUserProgress(userId, lessonId);

    // Rule: Cannot jump to MASTERED from LOCKED or AVAILABLE without initial completion
    if (progress.state === 'LOCKED' || progress.state === 'AVAILABLE') {
      throw new ConflictError(
        `Cannot elevate lesson ${lessonId} to MASTERED: current state is ${progress.state}. Must reach COMPLETED first.`
      );
    }

    if (reviewScore >= 80.0) {
      // Pass retrieval drill -> elevated to MASTERED
      const res = await this.db.query<UserProgressRecord>(
        `UPDATE user_progress 
         SET state = 'MASTERED', 
             mastered_at = COALESCE(mastered_at, NOW()),
             updated_at = NOW() 
         WHERE id = $1
         RETURNING *;`,
        [progress.id]
      );
      return res.rows[0] ?? progress;
    } else {
      // Failed Day +1 retrieval -> preserve COMPLETED state (never regresses backwards)
      return progress;
    }
  }

  /**
   * Marks a MASTERED lesson as REVIEW_REQUIRED when retrievability decays below 0.70.
   */
  async markReviewRequired(userId: string, lessonId: string): Promise<UserProgressRecord> {
    const progress = await this.getOrCreateUserProgress(userId, lessonId);
    if (progress.state === 'MASTERED') {
      const res = await this.db.query<UserProgressRecord>(
        "UPDATE user_progress SET state = 'REVIEW_REQUIRED', updated_at = NOW() WHERE id = $1 RETURNING *;",
        [progress.id]
      );
      return res.rows[0] ?? progress;
    }
    return progress;
  }

  /**
   * Unlocks any dependent lessons whose prerequisite is the specified lessonId.
   */
  private async unlockSubsequentLessons(userId: string, prerequisiteLessonId: string): Promise<string | null> {
    const nextLessonsRes = await this.db.query<{ id: string }>(
      'SELECT id FROM lessons WHERE prerequisite_lesson_id = $1;',
      [prerequisiteLessonId]
    );

    let firstUnlockedId: string | null = null;

    for (const nextLesson of nextLessonsRes.rows) {
      if (!firstUnlockedId) firstUnlockedId = nextLesson.id;

      // Upsert progress for next lesson to AVAILABLE
      const progId = `prog_${userId}_${nextLesson.id}`;
      await this.db.query(
        `INSERT INTO user_progress (id, user_id, lesson_id, state, best_score_percentage, attempts_count)
         VALUES ($1, $2, $3, 'AVAILABLE', 0.00, 0)
         ON CONFLICT (user_id, lesson_id) 
         DO UPDATE SET state = CASE 
           WHEN user_progress.state = 'LOCKED' THEN 'AVAILABLE'
           ELSE user_progress.state 
         END,
         updated_at = NOW();`,
        [progId, userId, nextLesson.id]
      );
    }

    return firstUnlockedId;
  }
}
