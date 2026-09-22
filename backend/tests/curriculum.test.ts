import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createTestDatabase, IDatabase, setDb } from '../src/db/index.js';
import { migrateUp } from '../src/db/migrator.js';
import { CurriculumSeeder } from '../src/curriculum/curriculum-seeder.js';
import { CurriculumService } from '../src/curriculum/curriculum-service.js';

describe('Phase A.8: Complete 365-Day Curriculum & Content Integrity Suite', () => {
  let db: IDatabase;
  let app: ReturnType<typeof createApp>;
  let seeder: CurriculumSeeder;
  let curriculumService: CurriculumService;

  beforeAll(async () => {
    db = await createTestDatabase();
    setDb(db);
    await migrateUp(db);
    seeder = new CurriculumSeeder(db);
    curriculumService = new CurriculumService(db);
    app = createApp();

    // Seed full canonical 365-day curriculum
    await seeder.seedFullCurriculum();
  });

  afterAll(async () => {
    setDb(null);
    await db.close();
  });

  describe('365-Day Macro Structure & Phase Boundaries', () => {
    it('should contain exactly 12 phases and 52 weeks', async () => {
      const overview = await curriculumService.getCurriculumOverview();

      expect(overview.course).toBeDefined();
      expect(overview.course.total_phases).toBe(12);
      expect(overview.course.total_days).toBe(365);
      expect(overview.phases.length).toBe(12);
      expect(overview.weeks.length).toBe(52);
    });

    it('should strictly enforce Phase 1-11 = 30 days and Phase 12 = 35 days', async () => {
      const overview = await curriculumService.getCurriculumOverview();

      for (const phase of overview.phases) {
        if (phase.phase_number >= 1 && phase.phase_number <= 11) {
          expect(phase.duration_days).toBe(30);
        } else if (phase.phase_number === 12) {
          expect(phase.duration_days).toBe(35);
        }
      }
    });

    it('should contain exactly 365 contiguous days without gaps or duplicates', async () => {
      const validation = await curriculumService.validateCurriculumIntegrity();

      expect(validation.totalDays).toBe(365);
      expect(validation.noMissingDays).toBe(true);
      expect(validation.noDuplicateDays).toBe(true);
      expect(validation.errors).toEqual([]);
      expect(validation.valid).toBe(true);
    });

    it('should preserve strictly unbroken prerequisite chains from Day 1 to Day 365', async () => {
      const validation = await curriculumService.validateCurriculumIntegrity();

      expect(validation.prerequisitesChainValid).toBe(true);

      // Verify Day 1 has no prerequisite
      const day1 = await curriculumService.getLessonByDay(1);
      expect(day1.lesson.prerequisite_lesson_id).toBeNull();

      // Verify Day 2 references Day 1
      const day2 = await curriculumService.getLessonByDay(2);
      expect(day2.lesson.prerequisite_lesson_id).toBe(day1.lesson.id);

      // Verify Day 365 references Day 364
      const day364 = await curriculumService.getLessonByDay(364);
      const day365 = await curriculumService.getLessonByDay(365);
      expect(day365.lesson.prerequisite_lesson_id).toBe(day364.lesson.id);
    });
  });

  describe('Pedagogical Cadence & Weekly Rhythm', () => {
    it('should follow the 7-day weekly cognitive cadence (Skill, Scenario, Checkpoint, Review)', async () => {
      // Test Week 1 (Days 1 to 7)
      const day1 = await curriculumService.getLessonByDay(1);
      const day2 = await curriculumService.getLessonByDay(2);
      const day3 = await curriculumService.getLessonByDay(3);
      const day4 = await curriculumService.getLessonByDay(4);
      const day5 = await curriculumService.getLessonByDay(5);
      const day6 = await curriculumService.getLessonByDay(6);
      const day7 = await curriculumService.getLessonByDay(7);

      expect(day1.lesson.activity_type).toBe('LESSON');
      expect(day2.lesson.activity_type).toBe('LESSON');
      expect(day3.lesson.activity_type).toBe('LESSON');
      expect(day4.lesson.activity_type).toBe('LESSON');
      expect(day5.lesson.activity_type).toBe('SCENARIO');
      expect(day6.lesson.activity_type).toBe('CHECKPOINT');
      expect(day7.lesson.activity_type).toBe('REVIEW_REFLECTION');
    });

    it('should designate the final day of each phase as a MILESTONE_CAPSTONE', async () => {
      // Days 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 365
      const milestoneDays = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 365];

      for (const day of milestoneDays) {
        const detail = await curriculumService.getLessonByDay(day);
        expect(detail.lesson.activity_type).toBe('MILESTONE_CAPSTONE');
        expect(detail.lesson.duration_minutes).toBe(20);
      }
    });

    it('should ensure every lesson cleared has at least 2 canonical ReviewCards', async () => {
      const validation = await curriculumService.validateCurriculumIntegrity();
      expect(validation.reviewCardsValid).toBe(true);

      const day1 = await curriculumService.getLessonByDay(1);
      expect(day1.review_cards.length).toBeGreaterThanOrEqual(2);
      expect(day1.review_cards[0].estimated_seconds).toBeLessThanOrEqual(45);
      expect(day1.review_cards[0].prompt_type).toBeDefined();
    });
  });

  describe('Dual-Track Vocalics & Acoustic Architecture', () => {
    it('should include AudioExercise with native Indonesian exemplar audio and written fallback', async () => {
      const day75 = await curriculumService.getLessonByDay(75);

      expect(day75.audio_exercise).toBeDefined();
      expect(day75.audio_exercise.model_exemplar_audio_url).toContain('.mp3');
      expect(day75.audio_exercise.model_transcript_text).toBeDefined();
      expect(day75.audio_exercise.target_wpm_min).toBeGreaterThanOrEqual(110);
      expect(day75.audio_exercise.target_wpm_max).toBeLessThanOrEqual(145);
      expect(parseFloat(day75.audio_exercise.target_pause_seconds)).toBe(2.0);
      expect(day75.audio_exercise.written_fallback_mode_allowed).toBe(true);
      expect(day75.audio_exercise.rubric_title).toBeDefined();
    });

    it('should provide multi-dimensional rubric criteria for self-calibration without fake AI speech scoring', async () => {
      const criteriaRes = await db.query(`
        SELECT rc.* 
        FROM rubric_criteria rc
        JOIN rubrics r ON r.id = rc.rubric_id
        WHERE r.id = 'rubric_vocalics_pacing'
        ORDER BY rc.id ASC;
      `);

      expect(criteriaRes.rows.length).toBe(3);
      const dimensions = criteriaRes.rows.map((r: { dimension_name: string }) => r.dimension_name);
      expect(dimensions).toContain('Artikulasi Konsonan');
      expect(dimensions).toContain('Kecepatan Bicara (120-140 WPM)');
      expect(dimensions).toContain('Jeda Strategis (2 Detik)');

      // Verify weights sum to 100%
      const totalWeight = criteriaRes.rows.reduce(
        (sum: number, r: { weight_percentage: string }) => sum + parseFloat(r.weight_percentage),
        0
      );
      expect(totalWeight).toBe(100.0);
    });
  });

  describe('Curriculum API Endpoints', () => {
    it('GET /api/v1/curriculum/overview - should return 200 with 12 phases and 52 weeks', async () => {
      const res = await request(app).get('/api/v1/curriculum/overview');

      expect(res.status).toBe(200);
      expect(res.body.course.title).toContain('Karsa');
      expect(res.body.phases.length).toBe(12);
      expect(res.body.weeks.length).toBe(52);
    });

    it('GET /api/v1/curriculum/lessons/1 - should return Day 1 curriculum detail', async () => {
      const res = await request(app).get('/api/v1/curriculum/lessons/1');

      expect(res.status).toBe(200);
      expect(res.body.lesson.day_number).toBe(1);
      expect(res.body.mastery_criteria).toBeDefined();
      expect(res.body.review_cards.length).toBe(2);
      expect(res.body.quiz).toBeDefined();
    });

    it('GET /api/v1/curriculum/lessons/365 - should return Day 365 Grand Capstone detail', async () => {
      const res = await request(app).get('/api/v1/curriculum/lessons/365');

      expect(res.status).toBe(200);
      expect(res.body.lesson.day_number).toBe(365);
      expect(res.body.lesson.activity_type).toBe('MILESTONE_CAPSTONE');
    });

    it('GET /api/v1/curriculum/lessons/999 - should return 400 Validation Error for invalid day', async () => {
      const res = await request(app).get('/api/v1/curriculum/lessons/999');

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('between 1 and 365');
    });

    it('GET /api/v1/curriculum/validate - should return validation report with valid: true', async () => {
      const res = await request(app).get('/api/v1/curriculum/validate');

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.totalDays).toBe(365);
      expect(res.body.totalPhases).toBe(12);
      expect(res.body.totalWeeks).toBe(52);
      expect(res.body.errors.length).toBe(0);
    });
  });
});
