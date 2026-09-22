import { IDatabase, getDb } from '../db/index.js';
import { logger } from '../utils/logger.js';

export interface PhaseMetadata {
  num: number;
  title: string;
  days: number;
  startDay: number;
  endDay: number;
  weeksCount: number;
  startWeek: number;
  endWeek: number;
}

export const CANONICAL_PHASES: PhaseMetadata[] = [
  { num: 1, title: 'Fondasi Komunikasi, Filter Kognitif & Hambatan Persepsi', days: 30, startDay: 1, endDay: 30, weeksCount: 4, startWeek: 1, endWeek: 4 },
  { num: 2, title: 'Komunikasi Verbal, Presisi & Struktur Piramida Minto', days: 30, startDay: 31, endDay: 60, weeksCount: 4, startWeek: 5, endWeek: 8 },
  { num: 3, title: 'Komunikasi Nonverbal, Vokalika & Kongruensi Perilaku', days: 30, startDay: 61, endDay: 90, weeksCount: 4, startWeek: 9, endWeek: 12 },
  { num: 4, title: 'Mendengarkan Aktif, Klarifikasi & Pertanyaan Sokrates', days: 30, startDay: 91, endDay: 120, weeksCount: 5, startWeek: 13, endWeek: 17 },
  { num: 5, title: 'Empati, Keamanan Psikologis & Umpan Balik Konstruktif', days: 30, startDay: 121, endDay: 150, weeksCount: 4, startWeek: 18, endWeek: 21 },
  { num: 6, title: 'Bicara Publik, Dinamika Presentasi & Retorika Klasik', days: 30, startDay: 151, endDay: 180, weeksCount: 4, startWeek: 22, endWeek: 25 },
  { num: 7, title: 'Storytelling & Narasi Strategis dalam Bisnis', days: 30, startDay: 181, endDay: 210, weeksCount: 5, startWeek: 26, endWeek: 30 },
  { num: 8, title: 'Persuasi Etis, Pengaruh Sosial & Framing Kognitif', days: 30, startDay: 211, endDay: 240, weeksCount: 4, startWeek: 31, endWeek: 34 },
  { num: 9, title: 'Negosiasi Berbasis Prinsip & Penciptaan Nilai Bersama', days: 30, startDay: 241, endDay: 270, weeksCount: 4, startWeek: 35, endWeek: 38 },
  { num: 10, title: 'Komunikasi Klien, Penjualan Konsultatif & Kepercayaan', days: 30, startDay: 271, endDay: 300, weeksCount: 4, startWeek: 39, endWeek: 42 },
  { num: 11, title: 'Dinamika Tempat Kerja, Politik Kantor & Resolusi Konflik', days: 30, startDay: 301, endDay: 330, weeksCount: 5, startWeek: 43, endWeek: 47 },
  { num: 12, title: 'Sintesis Terintegrasi, Diplomasi Kompleks & Master Capstone', days: 35, startDay: 331, endDay: 365, weeksCount: 5, startWeek: 48, endWeek: 52 }
];

export class CurriculumSeeder {
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
   * Seeds the complete 365-day curriculum with high performance batching.
   */
  async seedFullCurriculum(): Promise<{
    coursesCount: number;
    phasesCount: number;
    weeksCount: number;
    lessonsCount: number;
    masteryCriteriaCount: number;
    reviewCardsCount: number;
    quizzesCount: number;
    audioExercisesCount: number;
  }> {
    const db = this.db;
    logger.info('Starting canonical 365-day curriculum seeding...');

    // 1. Course Master Record
    await db.query(`
      INSERT INTO courses (id, title, description, default_locale, total_phases, total_days, content_version)
      VALUES (
        'course_karsa_id',
        'Karsa: Penguasaan Komunikasi 365 Hari',
        'Kurikulum 365 hari penguasaan komunikasi interpersonal, verbal, nonverbal, dan kepemimpinan.',
        'id-ID',
        12,
        365,
        '1.0.0'
      )
      ON CONFLICT (id) DO UPDATE SET
        total_phases = EXCLUDED.total_phases,
        total_days = EXCLUDED.total_days;
    `);

    // 1b. Canonical Skills (Foreign key reference for review cards)
    await db.query(`
      INSERT INTO skills (id, name, domain)
      VALUES 
      ('skill_shannon_weaver', 'Analisis Gangguan Transmisi (Noise)', 'ARTIKULASI'),
      ('skill_prep_structuring', 'Struktur Spontan PREP', 'ARTIKULASI'),
      ('skill_active_listening', 'Mendengarkan Reflektif', 'EMPATI'),
      ('skill_assertive_boundary', 'Penetapan Batasan Asertif', 'ASERTIVITAS')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 2. All 12 Phases (Phases 1-11 = 30 days, Phase 12 = 35 days)
    for (const p of CANONICAL_PHASES) {
      const phaseId = `phase_${String(p.num).padStart(2, '0')}`;
      const prereqId = p.num > 1 ? `phase_${String(p.num - 1).padStart(2, '0')}` : null;
      const milestoneLessonId = `L-P${String(p.num).padStart(2, '0')}-W${String(p.endWeek).padStart(2, '0')}-D${String(p.endDay).padStart(2, '0')}`;

      await db.query(`
        INSERT INTO phases (id, course_id, phase_number, title, description, prerequisite_phase_id, duration_days, milestone_lesson_id)
        VALUES ($1, 'course_karsa_id', $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          duration_days = EXCLUDED.duration_days,
          title = EXCLUDED.title,
          milestone_lesson_id = EXCLUDED.milestone_lesson_id;
      `, [phaseId, p.num, p.title, `Deskripsi komprehensif untuk ${p.title}`, prereqId, p.days, milestoneLessonId]);
    }

    // 3. All 52 Weeks
    for (const p of CANONICAL_PHASES) {
      const phaseId = `phase_${String(p.num).padStart(2, '0')}`;
      for (let w = p.startWeek; w <= p.endWeek; w++) {
        const weekId = `phase_${String(p.num).padStart(2, '0')}_week_${String(w).padStart(2, '0')}`;
        const weekInPhase = w - p.startWeek + 1;
        await db.query(`
          INSERT INTO weeks (id, phase_id, week_number, week_in_phase, title, learning_goal)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO NOTHING;
        `, [
          weekId,
          phaseId,
          w,
          weekInPhase,
          `Minggu ${w}: Fokus Modul Pembelajaran Fase ${p.num}`,
          `Tujuan pembelajaran minggu ${w}: internalisasi prinsip komunikasi dan penguasaan refleks praktis.`
        ]);
      }
    }

    // 4. Shared Rubrics for Vocalics and Presentations
    await db.query(`
      INSERT INTO rubrics (id, title, description)
      VALUES 
      ('rubric_vocalics_pacing', 'Rubrik Evaluasi Vokalika & Kecepatan Bicara', 'Rubrik multi-dimensi untuk artikulasi, jeda strategis, dan kecepatan wpm.'),
      ('rubric_assertive_scenario', 'Rubrik Evaluasi Komunikasi Asertif', 'Rubrik penilaian respon asertif tanpa agresi atau kepasifan.')
      ON CONFLICT (id) DO NOTHING;
    `);

    await db.query(`
      INSERT INTO rubric_criteria (id, rubric_id, dimension_name, weight_percentage, self_calibration_prompt, anchor_poor_description, anchor_optimal_description)
      VALUES 
      ('rc_vocal_01', 'rubric_vocalics_pacing', 'Artikulasi Konsonan', 30.00, 'Apakah setiap konsonan terdengar jernih tanpa gumaman?', 'Bicara bergumam, akhiran kata tertelan.', 'Artikulasi tegas, presisi tinggi pada tiap suku kata.'),
      ('rc_vocal_02', 'rubric_vocalics_pacing', 'Kecepatan Bicara (120-140 WPM)', 35.00, 'Apakah ritme bicara stabil dalam rentang ideal?', 'Terlalu terburu-buru (>160 WPM) atau monoton lambat (<100 WPM).', 'Tempo terjaga tenang di 120-140 WPM.'),
      ('rc_vocal_03', 'rubric_vocalics_pacing', 'Jeda Strategis (2 Detik)', 35.00, 'Apakah jeda dimanfaatkan untuk penekanan makna?', 'Tidak ada jeda atau diisi filler words (e.g. emm, aaa).', 'Jeda hening 2 detik sebelum poin kunci memberikan gravitasi.')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 5. Generate and seed all 365 Days
    let previousLessonId: string | null = null;
    let lessonsCount = 0;
    let masteryCount = 0;
    let reviewCardsCount = 0;
    let quizzesCount = 0;
    let audioCount = 0;

    for (const p of CANONICAL_PHASES) {
      for (let day = p.startDay; day <= p.endDay; day++) {
        // Calculate week
        const dayInPhase = day - p.startDay + 1;
        let weekNumber = p.startWeek + Math.floor((dayInPhase - 1) / 7);
        if (weekNumber > p.endWeek) weekNumber = p.endWeek;

        const weekId = `phase_${String(p.num).padStart(2, '0')}_week_${String(weekNumber).padStart(2, '0')}`;
        const lessonId = `L-P${String(p.num).padStart(2, '0')}-W${String(weekNumber).padStart(2, '0')}-D${String(day).padStart(2, '0')}`;

        // Determine activity type by weekly cadence (7-day rhythm)
        const dayOfWeekInCadence = ((day - 1) % 7) + 1;
        let activityType = 'LESSON';
        let durationMinutes = 7;
        let difficultyLevel = 1 + Math.floor(day / 60);

        if (day === p.endDay) {
          // Final day of phase is Phase Milestone Capstone!
          activityType = 'MILESTONE_CAPSTONE';
          durationMinutes = 20;
          difficultyLevel = Math.min(5, difficultyLevel + 1);
        } else if (dayOfWeekInCadence === 5) {
          // Day 5: Scenario Application
          activityType = 'SCENARIO';
          durationMinutes = 10;
        } else if (dayOfWeekInCadence === 6) {
          // Day 6: Interleaved Checkpoint
          activityType = 'CHECKPOINT';
          durationMinutes = 8;
        } else if (dayOfWeekInCadence === 7) {
          // Day 7: Spaced Review + Gibbs Reflection
          activityType = 'REVIEW_REFLECTION';
          durationMinutes = 8;
        }

        const title = `Hari ${day}: ${activityType === 'MILESTONE_CAPSTONE' ? 'Milestone Capstone' : 'Pelajaran ' + day} - Fase ${p.num}`;

        // Insert Lesson
        await db.query(`
          INSERT INTO lessons (
            id, week_id, day_number, title, activity_type, duration_minutes,
            difficulty_level, prerequisite_lesson_id, content_version, content_hash, payload_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '1.0.0', 'hash_${lessonId}', $9)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            activity_type = EXCLUDED.activity_type,
            prerequisite_lesson_id = EXCLUDED.prerequisite_lesson_id;
        `, [
          lessonId,
          weekId,
          day,
          title,
          activityType,
          durationMinutes,
          difficultyLevel,
          previousLessonId,
          JSON.stringify({ day, phase: p.num, week: weekNumber, activityType })
        ]);
        lessonsCount++;

        // Insert Mastery Criteria
        const mcId = `mc_${lessonId}`;
        await db.query(`
          INSERT INTO mastery_criteria (id, lesson_id, initial_passing_threshold, retrieval_passing_threshold, min_active_seconds)
          VALUES ($1, $2, 80.00, 80.00, 45)
          ON CONFLICT (id) DO NOTHING;
        `, [mcId, lessonId]);
        masteryCount++;

        // Insert 2 Canonical ReviewCards for spaced retrieval
        const card1Id = `RC-P${String(p.num).padStart(2, '0')}-W${String(weekNumber).padStart(2, '0')}-D${String(day).padStart(2, '0')}-01`;
        const card2Id = `RC-P${String(p.num).padStart(2, '0')}-W${String(weekNumber).padStart(2, '0')}-D${String(day).padStart(2, '0')}-02`;

        await db.query(`
          INSERT INTO review_cards (id, lesson_id, skill_id, prompt_type, prompt_text, answer_payload, explanation, card_difficulty, estimated_seconds)
          VALUES 
          ($1, $2, 'skill_shannon_weaver', 'CONCEPT_RECALL', $3, '{"correct": true}'::jsonb, 'Penjelasan retrieval aktif konsep hari ' || $4, 1.00, 35),
          ($5, $2, 'skill_shannon_weaver', 'FLAW_DETECTION', $6, '{"flaw_identified": true}'::jsonb, 'Penjelasan deteksi kelemahan komunikasi hari ' || $4, 1.10, 40)
          ON CONFLICT (id) DO NOTHING;
        `, [
          card1Id,
          lessonId,
          `Retrieval Konsep Hari ${day}: Sebutkan inti dari prinsip komunikasi ini.`,
          day,
          card2Id,
          `Deteksi Distorsi Hari ${day}: Identifikasi kesalahan komunikasi pada dialog kasus ini.`
        ]);
        reviewCardsCount += 2;

        // Formative Quiz for daily assessment
        const quizId = `quiz_${lessonId}`;
        await db.query(`
          INSERT INTO quizzes (id, lesson_id, passing_threshold_percentage)
          VALUES ($1, $2, 80.00)
          ON CONFLICT (id) DO NOTHING;
        `, [quizId, lessonId]);
        quizzesCount++;

        const qId = `q_${lessonId}_01`;
        await db.query(`
          INSERT INTO questions (id, quiz_id, question_text, question_type, sequence_order)
          VALUES ($1, $2, $3, 'MULTIPLE_CHOICE', 1)
          ON CONFLICT (id) DO NOTHING;
        `, [qId, quizId, `Pertanyaan evaluasi untuk materi Hari ${day}`]);

        await db.query(`
          INSERT INTO answer_options (id, question_id, option_key, option_text, is_correct, explanation_text)
          VALUES 
          ($1, $2, 'A', 'Pilihan Tepat (Optimal)', true, 'Penjelasan jawaban tepat'),
          ($3, $2, 'B', 'Pilihan Distorsi (Kurang Tepat)', false, 'Penjelasan mengapa opsi B keliru')
          ON CONFLICT (id) DO NOTHING;
        `, [`opt_${qId}_a`, qId, `opt_${qId}_b`]);

        // Dual-Track Vocalics AudioExercise (Phase 3 Vocalics, e.g. Day 75)
        if (day === 75) {
          const exerciseId = `ex_${lessonId}_vocalics`;
          await db.query(`
            INSERT INTO exercises (id, lesson_id, exercise_type, prompt_text, drill_payload)
            VALUES ($1, $2, 'AUDIO_PRACTICE', 'Latihan Vokalika: Memperlambat Tempo dan Mengeksekusi Jeda 2 Detik', '{"drill_mode": "VOCAL_TEMPO"}'::jsonb)
            ON CONFLICT (id) DO NOTHING;
          `, [exerciseId, lessonId]);

          const audioExId = `audio_ex_${lessonId}`;
          await db.query(`
            INSERT INTO audio_exercises (
              id, exercise_id, prompt_text, model_exemplar_audio_url,
              target_wpm_min, target_wpm_max, target_pause_seconds,
              model_transcript_text, written_fallback_mode_allowed, rubric_id
            )
            VALUES (
              $1, $2,
              'Dengarkan contoh pelafalan model vokalika Indonesia berikut, lalu rekam suara Anda dengan jeda 2 detik sebelum poin inti.',
              'https://assets.karsa.id/audio/exemplars/vocalics_phase03_day75.mp3',
              115, 140, 2.0,
              'Selamat pagi rekan-rekan sekalian. [jeda 2 detik] Hari ini kita akan membahas tiga keputusan kunci yang akan menentukan arah proyek kita kuartal ini.',
              true,
              'rubric_vocalics_pacing'
            )
            ON CONFLICT (id) DO NOTHING;
          `, [audioExId, exerciseId]);
          audioCount++;
        }

        previousLessonId = lessonId;
      }
    }

    logger.info({
      phasesCount: CANONICAL_PHASES.length,
      weeksCount: 52,
      lessonsCount,
      reviewCardsCount
    }, 'Complete 365-day curriculum seeding finished successfully.');

    return {
      coursesCount: 1,
      phasesCount: CANONICAL_PHASES.length,
      weeksCount: 52,
      lessonsCount,
      masteryCriteriaCount: masteryCount,
      reviewCardsCount,
      quizzesCount,
      audioExercisesCount: audioCount
    };
  }
}
