import { IDatabase, getDb } from '../db/index.js';
import { NotFoundError } from '../errors/app-error.js';

export interface CurriculumValidationResult {
  valid: boolean;
  totalDays: number;
  totalPhases: number;
  totalWeeks: number;
  phaseDurationsValid: boolean;
  noMissingDays: boolean;
  noDuplicateDays: boolean;
  prerequisitesChainValid: boolean;
  reviewCardsValid: boolean;
  dualTrackVocalicsValid: boolean;
  errors: string[];
}

export class CurriculumService {
  private dbInstance: IDatabase | null = null;

  constructor(customDb?: IDatabase) {
    if (customDb) {
      this.dbInstance = customDb;
    }
  }

  private get db(): IDatabase {
    return this.dbInstance ?? getDb();
  }

  /**
   * Retrieves overall curriculum hierarchy: Course, all 12 Phases, and 52 Weeks.
   */
  async getCurriculumOverview(): Promise<any> {
    const courseRes = await this.db.query('SELECT * FROM courses LIMIT 1;');
    const phasesRes = await this.db.query('SELECT * FROM phases ORDER BY phase_number ASC;');
    const weeksRes = await this.db.query('SELECT * FROM weeks ORDER BY week_number ASC;');

    return {
      course: courseRes.rows[0],
      phases: phasesRes.rows,
      weeks: weeksRes.rows
    };
  }

  /**
   * Retrieves full details for a given lesson by day number (1 to 365).
   */
  async getLessonByDay(dayNumber: number): Promise<any> {
    const lessonRes = await this.db.query('SELECT * FROM lessons WHERE day_number = $1;', [dayNumber]);
    if (!lessonRes.rows[0]) {
      throw new NotFoundError('Lesson for Day', String(dayNumber));
    }

    const lesson = lessonRes.rows[0];
    const mcRes = await this.db.query('SELECT * FROM mastery_criteria WHERE lesson_id = $1;', [lesson.id]);
    const rcRes = await this.db.query('SELECT * FROM review_cards WHERE lesson_id = $1 ORDER BY id ASC;', [lesson.id]);
    const quizRes = await this.db.query('SELECT * FROM quizzes WHERE lesson_id = $1;', [lesson.id]);
    
    // Check if there is an audio exercise linked to this lesson
    const audioRes = await this.db.query(`
      SELECT ae.*, r.title as rubric_title 
      FROM audio_exercises ae
      JOIN exercises e ON e.id = ae.exercise_id
      JOIN rubrics r ON r.id = ae.rubric_id
      WHERE e.lesson_id = $1;
    `, [lesson.id]);

    return {
      lesson,
      mastery_criteria: mcRes.rows[0] ?? null,
      review_cards: rcRes.rows,
      quiz: quizRes.rows[0] ?? null,
      audio_exercise: audioRes.rows[0] ?? null
    };
  }

  /**
   * Validates complete 365-day curriculum against all pedagogical and architectural invariants.
   */
  async validateCurriculumIntegrity(): Promise<CurriculumValidationResult> {
    const errors: string[] = [];

    // 1. Phases Check
    const phasesRes = await this.db.query<{
      phase_number: number;
      duration_days: number;
      title: string;
    }>('SELECT phase_number, duration_days, title FROM phases ORDER BY phase_number ASC;');

    if (phasesRes.rows.length !== 12) {
      errors.push(`Expected exactly 12 phases, found ${phasesRes.rows.length}`);
    }

    let phaseDurationsValid = true;
    for (const p of phasesRes.rows) {
      if (p.phase_number >= 1 && p.phase_number <= 11) {
        if (p.duration_days !== 30) {
          phaseDurationsValid = false;
          errors.push(`Phase ${p.phase_number} duration must be 30 days, got ${p.duration_days}`);
        }
      } else if (p.phase_number === 12) {
        if (p.duration_days !== 35) {
          phaseDurationsValid = false;
          errors.push(`Phase 12 duration must be 35 days, got ${p.duration_days}`);
        }
      }
    }

    // 2. Weeks Check
    const weeksRes = await this.db.query('SELECT id, week_number FROM weeks ORDER BY week_number ASC;');
    if (weeksRes.rows.length !== 52) {
      errors.push(`Expected exactly 52 weeks, found ${weeksRes.rows.length}`);
    }

    // 3. Lessons & Days Check (1 to 365)
    const lessonsRes = await this.db.query<{
      id: string;
      day_number: number;
      activity_type: string;
      prerequisite_lesson_id: string | null;
    }>('SELECT id, day_number, activity_type, prerequisite_lesson_id FROM lessons ORDER BY day_number ASC;');

    const totalDays = lessonsRes.rows.length;
    if (totalDays !== 365) {
      errors.push(`Expected 365 lessons, found ${totalDays}`);
    }

    const seenDays = new Set<number>();
    let duplicateDaysFound = false;
    let missingDaysFound = false;
    let prerequisitesChainValid = true;

    for (let i = 0; i < lessonsRes.rows.length; i++) {
      const lesson = lessonsRes.rows[i]!;
      const expectedDay = i + 1;

      if (seenDays.has(lesson.day_number)) {
        duplicateDaysFound = true;
        errors.push(`Duplicate day number found: ${lesson.day_number}`);
      }
      seenDays.add(lesson.day_number);

      if (lesson.day_number !== expectedDay) {
        missingDaysFound = true;
        errors.push(`Sequence mismatch at index ${i}: expected Day ${expectedDay}, got Day ${lesson.day_number}`);
      }

      // Prerequisite check
      if (lesson.day_number === 1) {
        if (lesson.prerequisite_lesson_id !== null) {
          prerequisitesChainValid = false;
          errors.push('Day 1 must not have a prerequisite lesson');
        }
      } else {
        const prevLesson = lessonsRes.rows[i - 1]!;
        if (lesson.prerequisite_lesson_id !== prevLesson.id) {
          prerequisitesChainValid = false;
          errors.push(`Day ${lesson.day_number} prerequisite mismatch: expected ${prevLesson.id}, got ${lesson.prerequisite_lesson_id}`);
        }
      }
    }

    // Check Day 1 and Day 365 exist
    if (!seenDays.has(1)) errors.push('Day 1 does not exist');
    if (!seenDays.has(365)) errors.push('Day 365 does not exist');

    // 4. ReviewCards check (every lesson has >= 2 ReviewCards)
    const rcRes = await this.db.query<{ lesson_id: string; card_count: string }>(`
      SELECT lesson_id, COUNT(id) as card_count 
      FROM review_cards 
      GROUP BY lesson_id;
    `);

    let reviewCardsValid = true;
    if (rcRes.rows.length !== 365) {
      reviewCardsValid = false;
      errors.push(`Expected all 365 lessons to have ReviewCards, only ${rcRes.rows.length} lessons have ReviewCards`);
    }

    for (const row of rcRes.rows) {
      const count = parseInt(row.card_count, 10);
      if (count < 2) {
        reviewCardsValid = false;
        errors.push(`Lesson ${row.lesson_id} has fewer than 2 ReviewCards (${count})`);
      }
    }

    // 5. Dual-Track Vocalics AudioExercise Check
    const vocalicsRes = await this.db.query(`
      SELECT ae.*, r.id as rubric_exists
      FROM audio_exercises ae
      JOIN rubrics r ON r.id = ae.rubric_id
      WHERE ae.written_fallback_mode_allowed = TRUE
        AND ae.target_wpm_min >= 100
        AND ae.target_wpm_max <= 160
        AND ae.model_exemplar_audio_url IS NOT NULL
        AND ae.model_transcript_text IS NOT NULL;
    `);

    const dualTrackVocalicsValid = vocalicsRes.rows.length > 0;
    if (!dualTrackVocalicsValid) {
      errors.push('No valid AudioExercise found with native Indonesian exemplar and written fallback');
    }

    return {
      valid: errors.length === 0,
      totalDays,
      totalPhases: phasesRes.rows.length,
      totalWeeks: weeksRes.rows.length,
      phaseDurationsValid,
      noMissingDays: !missingDaysFound,
      noDuplicateDays: !duplicateDaysFound,
      prerequisitesChainValid,
      reviewCardsValid,
      dualTrackVocalicsValid,
      errors
    };
  }
}
