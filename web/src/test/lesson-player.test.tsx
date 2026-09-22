import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { LessonPlayer } from '../components/LessonPlayer';
import { learningService, LessonDetail } from '../services/learning-service';

describe('LessonPlayer Component', () => {
  const mockLesson: LessonDetail = {
    id: 'L-P01-W01-D01',
    phase_id: 'phase-1',
    day_number: 1,
    title: 'Model Transaksional Komunikasi: Peta Wilayah Percakapan',
    lesson_type: 'SKILL',
    state: 'AVAILABLE',
    objectives: [
      { id: 'obj-1', description: 'Membedakan model linear vs transaksional' },
    ],
    concepts: [
      {
        id: 'c-1',
        title: 'Komunikasi Bersifat Sirkular dan Simultan',
        explanation: 'Setiap pihak dalam percakapan adalah pengirim dan penerima pesan sekaligus.',
        example_bad: 'Kamu tidak pernah mendengarkan instruksi saya.',
        example_good: 'Mari kita samakan persepsi terkait prioritas proyek ini.',
      },
    ],
    scenarios: [
      {
        id: 'sc-1',
        context: 'Rekan kerja Anda tampak frustrasi saat mendiskusikan revisi anggaran.',
        counterpart_name: 'Dewi',
        counterpart_role: 'Manajer Keuangan',
        counterpart_mood: 'DEFENSIVE',
        branches: [
          {
            id: 'b-1',
            option_text: 'Dewi, saya melihat Anda cemas. Apa poin revisi yang paling mendesak bagi Anda?',
            feedback_text: 'Sangat baik: mengakui emosi tanpa memvalidasi kecemasan berlebih.',
            is_optimal: true,
          },
        ],
      },
    ],
    audio_exercises: [
      {
        id: 'ae-1',
        title: 'Artikulasi Nada Tenang Berwibawa',
        prompt: 'Sampaikan kalimat berikut dengan tempo 120 WPM',
        transcript: 'Mari kita telaah data pendukung agar keputusan kita berpijak pada fakta yang jelas.',
        target_wpm_min: 110,
        target_wpm_max: 145,
        target_pause_seconds: 2.0,
        exemplar_audio_url: 'https://storage.karsa.id/audio/exemplar-d01.mp3',
        written_fallback_allowed: true,
        rubrics: [
          {
            id: 'rub-1',
            criteria: [
              { id: 'crit-1', name: 'Artikulasi', description: 'Pengucapan vokal/konsonan tegas', weight: 1.0 },
            ],
          },
        ],
      },
    ],
    quizzes: [
      {
        id: 'qz-1',
        title: 'Evaluasi Formatif Day 1',
        questions: [
          {
            id: 'q-1',
            prompt: 'Mengapa model transaksional lebih akurat menggambarkan komunikasi manusia dibanding model linear?',
            options: [
              {
                id: 'opt-a',
                option_text: 'Karena feedback terjadi terus-menerus secara simultan melalui isyarat verbal dan nonverbal.',
                is_correct: true,
                feedback: 'Tepat sekali.',
              },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(learningService, 'getLesson').mockResolvedValue(mockLesson);
  });

  it('renders concept card and allows stepping through to completion', async () => {
    vi.spyOn(learningService, 'submitAttempt').mockResolvedValue({
      status: 'ACCEPTED',
      details: {
        score_percentage: 100,
        is_passed: true,
        new_node_state: 'COMPLETED',
        next_unlocked_lesson_id: 'L-P01-W01-D02',
        xp_awarded: { practice_xp: 20, milestone_xp: 0, total_awarded: 20 },
      },
    });

    const mockClose = vi.fn();
    const mockCompleted = vi.fn();

    render(
      <LessonPlayer
        lessonId="L-P01-W01-D01"
        onClose={mockClose}
        onLessonCompleted={mockCompleted}
      />
    );

    // 1. Concept Card
    await waitFor(() => {
      expect(screen.getByText(/Komunikasi Bersifat Sirkular dan Simultan/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Studi Komparatif/i }));

    // 2. Worked Example Card
    expect(screen.getByText(/Bandingkan Dua Pola Respons/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Skenario Percakapan/i }));

    // 3. Scenario Card
    expect(screen.getByText(/Suasana: DEFENSIVE/i)).toBeInTheDocument();
    const branchOption = screen.getByText(/Dewi, saya melihat Anda cemas/i);
    fireEvent.click(branchOption);
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Kalibrasi Vokal/i }));

    // 4. Audio Practice Card (test Written Fallback Toggle)
    expect(screen.getByText(/Mode Tulisan \(Tanpa Mikrofon\)/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Mode Tulisan \(Tanpa Mikrofon\)/i));
    expect(screen.getByText(/Formulasi Respons Tertulis/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Evaluasi Formatif/i }));

    // 5. Quiz Card
    expect(screen.getByText(/Mengapa model transaksional lebih akurat/i)).toBeInTheDocument();
    const quizOption = screen.getByText(/Karena feedback terjadi terus-menerus/i);
    fireEvent.click(quizOption);
    fireEvent.click(screen.getByRole('button', { name: /Lanjut ke Refleksi Gibbs/i }));

    // 6. Reflection Card
    expect(screen.getByText(/Siklus Refleksi Gibbs/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Selesaikan & Kirim Evaluasi/i }));

    // 7. Celebration Modal
    await waitFor(() => {
      expect(screen.getByText(/Sesi Pembelajaran Tuntas!/i)).toBeInTheDocument();
      expect(screen.getByText(/COMPLETED/i)).toBeInTheDocument();
      expect(screen.getByText(/\+20 XP/i)).toBeInTheDocument();
    });

    expect(mockCompleted).toHaveBeenCalledWith('COMPLETED');
  });
});
