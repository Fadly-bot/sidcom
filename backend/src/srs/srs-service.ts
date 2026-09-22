import { IDatabase, getDb } from '../db/index.js';
import { DsrAlgorithm } from './dsr-algorithm.js';
import { ProgressionEngine } from '../learning/progression-engine.js';
import { XpService } from '../gamification/xp-service.js';
import { StreakService } from '../gamification/streak-service.js';
import {
  DueReviewCard,
  ReviewCardRecord,
  ReviewCardSubmission,
  ReviewDebtStatus,
  ReviewItemRecord,
  ReviewProcessResult
} from './types.js';
import { NotFoundError, ValidationError } from '../errors/app-error.js';

export class SrsService {
  private dbInstance: IDatabase | undefined;

  constructor(db?: IDatabase) {
    this.dbInstance = db;
  }

  private get db(): IDatabase {
    return this.dbInstance ?? getDb();
  }

  private get progressionEngine(): ProgressionEngine {
    return new ProgressionEngine(this.db);
  }

  private get xpService(): XpService {
    return new XpService(this.db);
  }

  private get streakService(): StreakService {
    return new StreakService(this.db);
  }

  /**
   * Automatically ingests the 2 atomic ReviewCards of a newly COMPLETED lesson
   * into the user's review_items queue scheduled for Day +1 (I1 = 1 day).
   */
  async ingestLessonCards(userId: string, lessonId: string): Promise<ReviewItemRecord[]> {
    const cardsRes = await this.db.query<ReviewCardRecord>(
      'SELECT * FROM review_cards WHERE lesson_id = $1 ORDER BY id ASC;',
      [lessonId]
    );

    const createdItems: ReviewItemRecord[] = [];
    const now = new Date();
    // Schedule initial review for 24 hours later (I1 = 1 day)
    const dueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    for (const card of cardsRes.rows) {
      const itemId = `rev_${userId}_${card.id}`;
      const diffRating = card.card_difficulty ? Number(card.card_difficulty) * 5.0 : 5.0;

      const res = await this.db.query<ReviewItemRecord>(
        `INSERT INTO review_items (
          id, user_id, review_card_id, lesson_id, 
          stability_days, difficulty_rating, retrievability_estimate, 
          due_at, review_count, lapses_count
        )
        VALUES ($1, $2, $3, $4, 1.000, $5, 1.0000, $6, 0, 0)
        ON CONFLICT (user_id, review_card_id) DO NOTHING
        RETURNING *;`,
        [itemId, userId, card.id, lessonId, diffRating, dueAt]
      );

      const firstItem = res.rows[0];
      if (firstItem) {
        createdItems.push(firstItem);
      }
    }

    return createdItems;
  }

  /**
   * Calculates the authoritative 3-tier review debt for the user:
   * - 0: Normal Load (No debt)
   * - 1–5: Tier 1 (Soft warning banner; daily lessons accessible)
   * - 6–12: Tier 2 (Prioritized review nudge modal)
   * - >=13: Tier 3 (Critical debt; HARD PROGRESSION LOCK on daily lessons)
   */
  async calculateReviewDebt(userId: string): Promise<ReviewDebtStatus> {
    const res = await this.db.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM review_items WHERE user_id = $1 AND due_at <= NOW();',
      [userId]
    );

    const firstRow = res.rows[0];
    const overdueCount = parseInt(firstRow?.count ?? '0', 10);

    if (overdueCount <= 5) {
      return {
        overdue_count: overdueCount,
        tier: 1,
        hard_locked: false,
        tier_name: 'NORMAL',
        message:
          overdueCount === 0
            ? 'Ingatan prima! Tidak ada kartu review yang tertunda.'
            : `Ada ${overdueCount} kartu review yang siap diulang.`
      };
    }

    if (overdueCount <= 12) {
      return {
        overdue_count: overdueCount,
        tier: 2,
        hard_locked: false,
        tier_name: 'HEAVY_DEBT',
        message: `Beban review tinggi (${overdueCount} kartu). Disarankan menyelesaikan review sebelum materi baru.`
      };
    }

    return {
      overdue_count: overdueCount,
      tier: 3,
      hard_locked: true,
      tier_name: 'CRITICAL_DEBT',
      message: `Hambatan Retensi Kritis (${overdueCount} kartu). Selesaikan 1 sesi review (5–8 kartu) untuk membuka kembali materi harian.`
    };
  }

  /**
   * Retrieves a personalized review session (5 to 8 ReviewCards),
   * ordered by lowest Retrievability R(t) and oldest due date.
   */
  async getReviewSession(userId: string, limit = 8): Promise<DueReviewCard[]> {
    const maxCards = Math.min(8, Math.max(5, limit));

    const res = await this.db.query<{
      review_item_id: string;
      review_card_id: string;
      lesson_id: string;
      stability_days: number;
      difficulty_rating: number;
      retrievability_estimate: number;
      last_reviewed_at: string | null;
      due_at: string;
      prompt_type: string;
      prompt_text: string;
      stimulus_text: string | null;
      answer_payload: any;
      explanation: string;
    }>(
      `SELECT 
        ri.id as review_item_id,
        ri.review_card_id,
        ri.lesson_id,
        ri.stability_days,
        ri.difficulty_rating,
        ri.retrievability_estimate,
        ri.last_reviewed_at,
        ri.due_at,
        rc.prompt_type,
        rc.prompt_text,
        rc.stimulus_text,
        rc.answer_payload,
        rc.explanation
      FROM review_items ri
      JOIN review_cards rc ON rc.id = ri.review_card_id
      WHERE ri.user_id = $1 AND ri.due_at <= NOW()
      ORDER BY ri.due_at ASC
      LIMIT $2;`,
      [userId, maxCards]
    );

    const now = Date.now();

    return res.rows.map((row) => {
      const stability = Number(row.stability_days);
      const lastReviewed = row.last_reviewed_at ? new Date(row.last_reviewed_at).getTime() : now;
      const elapsedDays = Math.max(0, (now - lastReviewed) / (24 * 60 * 60 * 1000));
      const currentR = DsrAlgorithm.calculateRetrievability(elapsedDays, stability);

      return {
        review_item_id: row.review_item_id,
        review_card_id: row.review_card_id,
        lesson_id: row.lesson_id,
        stability_days: stability,
        difficulty_rating: Number(row.difficulty_rating),
        current_retrievability: currentR,
        due_at: row.due_at,
        prompt_type: row.prompt_type,
        prompt_text: row.prompt_text,
        stimulus_text: row.stimulus_text,
        answer_payload: row.answer_payload,
        explanation: row.explanation
      };
    });
  }

  /**
   * Processes a single ReviewCard submission, updates DSR stability and retrievability,
   * calculates the next interval, and manages parent lesson MASTERED / REVIEW_REQUIRED transitions.
   */
  async processReviewSubmission(
    userId: string,
    submission: ReviewCardSubmission
  ): Promise<ReviewProcessResult> {
    const { review_card_id, score_percentage, rating } = submission;

    if (score_percentage < 0 || score_percentage > 100) {
      throw new ValidationError('Score percentage must be between 0 and 100', [
        { field: 'score_percentage', message: 'Must be between 0 and 100' }
      ]);
    }

    const itemRes = await this.db.query<ReviewItemRecord>(
      'SELECT * FROM review_items WHERE user_id = $1 AND review_card_id = $2;',
      [userId, review_card_id]
    );

    const item = itemRes.rows[0];
    if (!item) {
      throw new NotFoundError('ReviewItem for card', review_card_id);
    }

    const currentStability = Number(item.stability_days);
    const dsrResult = DsrAlgorithm.evaluateReview({
      currentStability,
      scorePercentage: score_percentage,
      explicitRating: rating
    });

    const now = new Date();
    const nextDueDate = new Date(now.getTime() + dsrResult.intervalDays * 24 * 60 * 60 * 1000);
    const nextDueIso = nextDueDate.toISOString();

    // Update review item in DB
    await this.db.query(
      `UPDATE review_items
       SET stability_days = $1,
           retrievability_estimate = $2,
           due_at = $3,
           last_reviewed_at = NOW(),
           review_count = review_count + 1,
           lapses_count = lapses_count + $4,
           updated_at = NOW()
       WHERE id = $5;`,
      [
        dsrResult.newStability,
        dsrResult.newRetrievability,
        nextDueIso,
        dsrResult.lapsed ? 1 : 0,
        item.id
      ]
    );

    // Evaluate parent lesson progression (Day +1 Mastery or Decay)
    let parentLessonState: string | undefined;
    const lessonProgress = await this.progressionEngine.getOrCreateUserProgress(userId, item.lesson_id);

    if (lessonProgress.state === 'COMPLETED') {
      if (score_percentage >= 80.0) {
        // Day +1 Spaced Retrieval passed! Elevate to MASTERED
        const updated = await this.progressionEngine.promoteToMastered(userId, item.lesson_id, score_percentage);
        parentLessonState = updated.state;
      } else {
        parentLessonState = 'COMPLETED'; // Retains COMPLETED (preserve-max)
      }
    } else if (lessonProgress.state === 'MASTERED') {
      if (dsrResult.lapsed) {
        // Lapsed review decays MASTERED -> REVIEW_REQUIRED
        const updated = await this.progressionEngine.markReviewRequired(userId, item.lesson_id);
        parentLessonState = updated.state;
      } else {
        parentLessonState = 'MASTERED';
      }
    } else if (lessonProgress.state === 'REVIEW_REQUIRED') {
      if (score_percentage >= 80.0) {
        // Cleared review drill restores MASTERED
        const updated = await this.progressionEngine.promoteToMastered(userId, item.lesson_id, score_percentage);
        parentLessonState = updated.state;
      } else {
        parentLessonState = 'REVIEW_REQUIRED';
      }
    }

    const debtStatus = await this.calculateReviewDebt(userId);

    // Award Practice XP and record qualifying streak activity
    if (score_percentage >= 80.0) {
      const bonusXp = score_percentage >= 90.0 ? 5 : 0;
      await this.xpService.awardXp(userId, {
        category: 'PRACTICE',
        baseXp: 10,
        bonusXp,
        referenceId: review_card_id,
        referenceType: 'REVIEW_CARD'
      });

      await this.streakService.recordQualifyingActivity(userId, {
        actionType: 'REVIEW_SESSION'
      });
    }

    return {
      review_item_id: item.id,
      review_card_id,
      previous_stability: currentStability,
      new_stability: dsrResult.newStability,
      calculated_rating: dsrResult.rating,
      new_due_at: nextDueIso,
      new_retrievability: dsrResult.newRetrievability,
      parent_lesson_state: parentLessonState,
      debt_status: debtStatus
    };
  }
}
