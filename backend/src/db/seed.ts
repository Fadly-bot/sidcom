import { IDatabase, getDb } from './index.js';
import { logger } from '../utils/logger.js';

export async function seedDatabase(db: IDatabase = getDb()): Promise<void> {
  logger.info('Seeding canonical reference data...');

  // 1. Reference Course
  await db.query(`
    INSERT INTO courses (id, title, description, default_locale, total_phases, total_days, content_version)
    VALUES (
      'course_karsa_id',
      'Karsa: Penguasaan Komunikasi 365 Hari',
      'Kurikulum 365 hari penguasaan komunikasi interpersonal, verbal, dan emosional.',
      'id-ID',
      12,
      365,
      '1.0.0'
    )
    ON CONFLICT (id) DO NOTHING;
  `);

  // 2. All 12 Phases with explicit durations (Phases 1-11 = 30 days, Phase 12 = 35 days)
  const phases = [
    { num: 1, title: 'Fondasi Komunikasi, Filter Kognitif & Hambatan Persepsi', days: 30 },
    { num: 2, title: 'Komunikasi Verbal, Presisi & Struktur Piramida Minto', days: 30 },
    { num: 3, title: 'Komunikasi Nonverbal, Vokalika & Kongruensi Perilaku', days: 30 },
    { num: 4, title: 'Mendengarkan Aktif, Klarifikasi & Pertanyaan Sokrates', days: 30 },
    { num: 5, title: 'Empati, Keamanan Psikologis & Umpan Balik Konstruktif', days: 30 },
    { num: 6, title: 'Bicara Publik, Dinamika Presentasi & Retorika Klasik', days: 30 },
    { num: 7, title: 'Storytelling & Narasi Strategis dalam Bisnis', days: 30 },
    { num: 8, title: 'Persuasi Etis, Pengaruh Sosial & Framing Kognitif', days: 30 },
    { num: 9, title: 'Negosiasi Berbasis Prinsip & Penciptaan Nilai Bersama', days: 30 },
    { num: 10, title: 'Komunikasi Klien, Penjualan Konsultatif & Kepercayaan', days: 30 },
    { num: 11, title: 'Dinamika Tempat Kerja, Politik Kantor & Resolusi Konflik', days: 30 },
    { num: 12, title: 'Sintesis Terintegrasi, Diplomasi Kompleks & Master Capstone', days: 35 }
  ];

  for (const p of phases) {
    const phaseId = `phase_${String(p.num).padStart(2, '0')}`;
    const prereqId = p.num > 1 ? `phase_${String(p.num - 1).padStart(2, '0')}` : null;
    await db.query(
      `
      INSERT INTO phases (id, course_id, phase_number, title, description, prerequisite_phase_id, duration_days)
      VALUES ($1, 'course_karsa_id', $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        duration_days = EXCLUDED.duration_days,
        title = EXCLUDED.title;
      `,
      [phaseId, p.num, p.title, `Deskripsi untuk ${p.title}`, prereqId, p.days]
    );
  }

  // 3. Week 1
  await db.query(`
    INSERT INTO weeks (id, phase_id, week_number, week_in_phase, title, learning_goal)
    VALUES (
      'phase_01_week_01',
      'phase_01',
      1,
      1,
      'Anatomi Pesan & Hambatan Komunikasi',
      'Menganalisis 4 komponen transmisi pesan dan membedakan niat dari dampak.'
    )
    ON CONFLICT (id) DO NOTHING;
  `);

  // 4. Core Skills
  const skills = [
    { id: 'skill_shannon_weaver', name: 'Analisis Gangguan Transmisi (Noise)', domain: 'ARTIKULASI' },
    { id: 'skill_prep_structuring', name: 'Struktur Spontan PREP', domain: 'ARTIKULASI' },
    { id: 'skill_active_listening', name: 'Mendengarkan Reflektif', domain: 'EMPATI' },
    { id: 'skill_assertive_boundary', name: 'Penetapan Batasan Asertif', domain: 'ASERTIVITAS' }
  ];

  for (const s of skills) {
    await db.query(
      `
      INSERT INTO skills (id, name, domain)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO NOTHING;
      `,
      [s.id, s.name, s.domain]
    );
  }

  // 5. Day 1 Lesson
  await db.query(`
    INSERT INTO lessons (
      id, week_id, day_number, title, activity_type, duration_minutes,
      difficulty_level, prerequisite_lesson_id, content_version, content_hash, payload_json
    )
    VALUES (
      'L-P01-W01-D01',
      'phase_01_week_01',
      1,
      'Anatomi Pesan & Filter Kognitif',
      'LESSON',
      7,
      1,
      NULL,
      '1.0.0',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      '{"intro": "Selamat datang di Karsa. Pelajari cara transmisi pesan bekerja."}'::jsonb
    )
    ON CONFLICT (id) DO NOTHING;
  `);

  // 6. Mastery Criteria for Day 1
  await db.query(`
    INSERT INTO mastery_criteria (id, lesson_id, initial_passing_threshold, retrieval_passing_threshold, min_active_seconds)
    VALUES (
      'mc_L-P01-W01-D01',
      'L-P01-W01-D01',
      80.00,
      80.00,
      45
    )
    ON CONFLICT (id) DO NOTHING;
  `);

  // 7. Exactly 2 ReviewCards for Day 1 (Decision 04)
  await db.query(`
    INSERT INTO review_cards (
      id, lesson_id, skill_id, prompt_type, prompt_text, stimulus_text,
      answer_payload, explanation, card_difficulty, estimated_seconds
    )
    VALUES
    (
      'RC-P01-W01-D01-01',
      'L-P01-W01-D01',
      'skill_shannon_weaver',
      'CONCEPT_RECALL',
      'Sebutkan 3 jenis kebisingan (noise) yang dapat mendistorsi pesan menurut model transmisi.',
      NULL,
      '{"correct_elements": ["Fisik", "Psikologis", "Semantik"]}'::jsonb,
      'Noise dalam komunikasi mencakup gangguan fisik (lingkungan), psikologis (emosi/bias), dan semantik (ambiguitas kata).',
      1.00,
      35
    ),
    (
      'RC-P01-W01-D01-02',
      'L-P01-W01-D01',
      'skill_shannon_weaver',
      'FLAW_DETECTION',
      'Identifikasi distorsi komunikasi utama pada respon atasan di bawah ini.',
      'Atasan: "Kerja begini saja tidak becus, saya tahu kamu memang malas."',
      '{"flaw_type": "FUNDAMENTAL_ATTRIBUTION_ERROR"}'::jsonb,
      'Atasan melakukan fundamental attribution error dengan mengaitkan kesalahan teknis dengan karakter personal.',
      1.20,
      40
    )
    ON CONFLICT (id) DO NOTHING;
  `);

  // 8. Demo User
  await db.query(`
    INSERT INTO users (id, email, password_hash, display_name, profile_timezone)
    VALUES (
      'user_demo_01',
      'demo@karsa.id',
      '$2b$10$epG41V8WcQWbK8kR51fT4O9aI2y7g5LzM8G3A.sP8Y5c2.mPqD.yO',
      'Budi Pembelajar',
      'Asia/Jakarta'
    )
    ON CONFLICT (id) DO NOTHING;
  `);

  logger.info('Reference data seeding completed.');
}

// CLI entrypoint
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  const db = getDb();
  (async () => {
    try {
      await seedDatabase(db);
      await db.close();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Seeding failed');
      await db.close();
      process.exit(1);
    }
  })();
}
