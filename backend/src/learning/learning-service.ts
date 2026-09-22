import { IDatabase, getDb } from '../db/index.js';
import { GradingEngine } from './grading-engine.js';
import { ProgressionEngine } from './progression-engine.js';
import { SrsService } from '../srs/srs-service.js';
import { XpService } from '../gamification/xp-service.js';
import { StreakService } from '../gamification/streak-service.js';
import {
  GradingResult,
  LessonAttemptSubmission,
  LessonSummary,
  ProgressionState,
  UserProgressRecord
} from './types.js';
import { ForbiddenError, NotFoundError } from '../errors/app-error.js';

export class LearningService {
  private dbInstance: IDatabase | undefined;

  constructor(db?: IDatabase) {
    this.dbInstance = db;
  }

  private get db(): IDatabase {
    return this.dbInstance ?? getDb();
  }

  private get gradingEngine(): GradingEngine {
    return new GradingEngine(this.db);
  }

  private get progressionEngine(): ProgressionEngine {
    return new ProgressionEngine(this.db);
  }

  private get srsService(): SrsService {
    return new SrsService(this.db);
  }

  private get xpService(): XpService {
    return new XpService(this.db);
  }

  private get streakService(): StreakService {
    return new StreakService(this.db);
  }

  /**
   * Retrieves all lessons and the authenticated user's current progression state for each.
   */
  async getUserPathProgress(userId: string): Promise<LessonSummary[]> {
    const lessonsRes = await this.db.query<{
      id: string;
      day_number: number;
      title: string;
      activity_type: string;
      duration_minutes: number;
      difficulty_level: number;
      prerequisite_lesson_id: string | null;
      state: ProgressionState | null;
      best_score_percentage: number | null;
      attempts_count: number | null;
      completed_at: string | null;
      mastered_at: string | null;
      quarantine_until: string | null;
    }>(
      `SELECT 
        l.id,
        l.day_number,
        l.title,
        l.activity_type,
        l.duration_minutes,
        l.difficulty_level,
        l.prerequisite_lesson_id,
        up.state,
        up.best_score_percentage,
        up.attempts_count,
        up.completed_at,
        up.mastered_at,
        up.quarantine_until
      FROM lessons l
      LEFT JOIN user_progress up ON up.lesson_id = l.id AND up.user_id = $1
      ORDER BY l.day_number ASC;`,
      [userId]
    );

    const result: LessonSummary[] = [];

    for (const row of lessonsRes.rows) {
      let state: ProgressionState = row.state ?? 'LOCKED';

      if (!row.state) {
        // Evaluate dynamic state if not yet tracked in user_progress
        if (!row.prerequisite_lesson_id) {
          state = 'AVAILABLE';
        } else {
          // Check if prerequisite was completed
          const prereqRow = result.find((item) => item.id === row.prerequisite_lesson_id);
          if (prereqRow && (prereqRow.state === 'COMPLETED' || prereqRow.state === 'MASTERED')) {
            state = 'AVAILABLE';
          }
        }
      }

      result.push({
        id: row.id,
        day_number: row.day_number,
        title: row.title,
        activity_type: row.activity_type,
        duration_minutes: row.duration_minutes,
        difficulty_level: row.difficulty_level,
        prerequisite_lesson_id: row.prerequisite_lesson_id,
        state,
        best_score_percentage: Number(row.best_score_percentage ?? 0),
        attempts_count: Number(row.attempts_count ?? 0),
        completed_at: row.completed_at,
        mastered_at: row.mastered_at,
        quarantine_until: row.quarantine_until
      });
    }

    return result;
  }

  /**
   * Retrieves complete lesson content.
   * If the lesson is LOCKED for the user, throws ForbiddenError.
   */
  async getLessonDetail(userId: string, lessonId: string) {
    // Enforce Review Debt Tier 3 Hard Progression Lock
    const debt = await this.srsService.calculateReviewDebt(userId);
    if (debt.hard_locked) {
      throw new ForbiddenError(
        `Progression locked due to critical review debt (${debt.overdue_count} overdue cards). Complete one review session (5-8 cards) to unlock.`
      );
    }

    const progressionEngine = this.progressionEngine;
    const progress = await progressionEngine.getOrCreateUserProgress(userId, lessonId);

    if (progress.state === 'LOCKED') {
      throw new ForbiddenError('This lesson is locked. Complete previous lessons to unlock.');
    }

    const lessonRes = await this.db.query(
      'SELECT id, week_id, day_number, title, activity_type, duration_minutes, difficulty_level, payload_json FROM lessons WHERE id = $1;',
      [lessonId]
    );

    if (lessonRes.rows.length === 0) {
      throw new NotFoundError('Lesson', lessonId);
    }

    const lesson = lessonRes.rows[0];

    // Fetch quiz questions (without answers) for client display
    const quizRes = await this.db.query<{ id: string }>('SELECT id FROM quizzes WHERE lesson_id = $1;', [lessonId]);
    let questions: any[] = [];

    const firstQuiz = quizRes.rows[0];
    if (firstQuiz) {
      const qRes = await this.db.query(
        `SELECT q.id, q.question_text, q.question_type, q.sequence_order,
                json_agg(json_build_object('id', ao.id, 'option_key', ao.option_key, 'option_text', ao.option_text)) as options
         FROM questions q
         LEFT JOIN answer_options ao ON ao.question_id = q.id
         WHERE q.quiz_id = $1
         GROUP BY q.id
         ORDER BY q.sequence_order ASC;`,
        [firstQuiz.id]
      );
      questions = qRes.rows;
    }

    return {
      lesson,
      progress,
      questions
    };
  }

  /**
   * Submits a formative lesson attempt, performs authoritative server grading,
   * updates progression state, and enforces 15-minute quarantine upon failure.
   */
  async submitLessonAttempt(userId: string, submission: LessonAttemptSubmission): Promise<GradingResult> {
    const { lesson_id, answers, elapsed_active_seconds } = submission;

    // Enforce Review Debt Tier 3 Hard Progression Lock
    const debt = await this.srsService.calculateReviewDebt(userId);
    if (debt.hard_locked) {
      throw new ForbiddenError(
        `Progression locked due to critical review debt (${debt.overdue_count} overdue cards). Complete one review session (5-8 cards) to unlock.`
      );
    }

    const gradingEngine = this.gradingEngine;
    const progressionEngine = this.progressionEngine;

    // 1. Authoritative Grading
    const grading = await gradingEngine.gradeQuiz(lesson_id, answers);

    // 2. Process State Machine Transition
    const transition = await progressionEngine.processLessonAttempt({
      userId,
      lessonId: lesson_id,
      scorePercentage: grading.scorePercentage,
      passed: grading.passed,
      elapsedActiveSeconds: elapsed_active_seconds
    });

    // 3. If newly completed, automatically ingest its 2 ReviewCards for Day +1 retrieval
    if (transition.newState === 'COMPLETED' && transition.previousState !== 'COMPLETED' && transition.previousState !== 'MASTERED') {
      await this.srsService.ingestLessonCards(userId, lesson_id);
    }

    // 4. Award XP and advance streak if passed and not provisional study
    if (grading.passed && !transition.provisionalStudy) {
      const bonusXp = grading.scorePercentage >= 90 ? 10 : 0;
      await this.xpService.awardXp(userId, {
        category: 'PRACTICE',
        baseXp: 15,
        bonusXp,
        referenceId: lesson_id,
        referenceType: 'LESSON',
        clientTimestamp: submission.client_timestamp
      });

      await this.streakService.recordQualifyingActivity(userId, {
        actionType: 'LESSON',
        clientTimestamp: submission.client_timestamp
      });
    }

    return {
      lesson_id,
      total_questions: grading.totalQuestions,
      correct_questions: grading.correctQuestions,
      score_percentage: grading.scorePercentage,
      passed: grading.passed,
      min_active_seconds_met: elapsed_active_seconds >= 45,
      quarantined: transition.quarantineUntil !== null,
      provisional_study: transition.provisionalStudy,
      previous_state: transition.previousState,
      new_state: transition.newState,
      unlocked_next_lesson_id: transition.unlockedNextLessonId,
      quarantine_until: transition.quarantineUntil,
      question_details: grading.questionDetails
    };
  }

  /**
   * Evaluates Day +1 Spaced Retrieval drill and elevates lesson to MASTERED if passed.
   */
  async submitDayPlusOneMasteryReview(
    userId: string,
    lessonId: string,
    reviewScore: number
  ): Promise<UserProgressRecord> {
    const progressionEngine = this.progressionEngine;
    return progressionEngine.promoteToMastered(userId, lessonId, reviewScore);
  }
}
