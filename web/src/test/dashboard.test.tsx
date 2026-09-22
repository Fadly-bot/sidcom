import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { Dashboard } from '../components/Dashboard';
import { learningService } from '../services/learning-service';

describe('Dashboard Component & 3-Tier Debt Gate', () => {
  const mockOnStartLesson = vi.fn();
  const mockOnStartReview = vi.fn();
  const mockOnNavigatePath = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders normal dashboard when review debt is Tier 1 (Soft Reminder)', async () => {
    vi.spyOn(learningService, 'getDashboard').mockResolvedValue({
      active_streak: 7,
      banked_freezes: 1,
      today_completed: false,
      local_day_remaining_seconds: 14400,
      today_lesson: {
        lesson_id: 'L-P01-W01-D03',
        title: 'Niat vs. Dampak: Menjembatani Kesenjangan Komunikasi',
        state: 'AVAILABLE',
        duration_minutes: 6,
      },
      due_reviews_count: 3,
      review_debt_tier: 'TIER_1_SOFT_REMINDER',
      weak_skill_alert: null,
    });

    render(
      <Dashboard
        onStartLesson={mockOnStartLesson}
        onStartReview={mockOnStartReview}
        onNavigatePath={mockOnNavigatePath}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Pemberitahuan Review Spaced Retrieval/i)).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
      expect(screen.getByText(/Hari Beruntun/i)).toBeInTheDocument();
    });

    const startLessonBtn = screen.getByRole('button', { name: /Mulai Latihan Hari Ini/i });
    expect(startLessonBtn).not.toBeDisabled();
    fireEvent.click(startLessonBtn);
    expect(mockOnStartLesson).toHaveBeenCalledWith('L-P01-W01-D03');
  });

  it('renders Tier 2 modal gate recommending review first', async () => {
    vi.spyOn(learningService, 'getDashboard').mockResolvedValue({
      active_streak: 10,
      banked_freezes: 2,
      today_completed: false,
      local_day_remaining_seconds: 7200,
      today_lesson: {
        lesson_id: 'L-P01-W01-D05',
        title: 'Skenario Refleksi Kolaboratif',
        state: 'AVAILABLE',
        duration_minutes: 8,
      },
      due_reviews_count: 9,
      review_debt_tier: 'TIER_2_PRIORITIZED_GATE',
      weak_skill_alert: null,
    });

    render(
      <Dashboard
        onStartLesson={mockOnStartLesson}
        onStartReview={mockOnStartReview}
        onNavigatePath={mockOnNavigatePath}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Rekomendasi Review Memori/i)).toBeInTheDocument();
    });

    // Can dismiss modal
    const proceedBtn = screen.getByRole('button', { name: /Lanjut ke Pelajaran/i });
    fireEvent.click(proceedBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('enforces Tier 3 hard progression lock when review debt is >= 13 cards', async () => {
    vi.spyOn(learningService, 'getDashboard').mockResolvedValue({
      active_streak: 12,
      banked_freezes: 0,
      today_completed: false,
      local_day_remaining_seconds: 3600,
      today_lesson: {
        lesson_id: 'L-P01-W02-D08',
        title: 'Kerangka Komunikasi Asertif',
        state: 'AVAILABLE',
        duration_minutes: 6,
      },
      due_reviews_count: 14,
      review_debt_tier: 'TIER_3_HARD_LOCK',
      weak_skill_alert: null,
    });

    render(
      <Dashboard
        onStartLesson={mockOnStartLesson}
        onStartReview={mockOnStartReview}
        onNavigatePath={mockOnNavigatePath}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Kunci Progresi Aktif: Utang Review Menumpuk/i);
    });

    // Lesson button is disabled
    const lockedLessonBtn = screen.getByRole('button', { name: /Pelajaran Terkunci/i });
    expect(lockedLessonBtn).toBeDisabled();

    // Direct review unlock button works
    const unlockReviewBtn = screen.getByRole('button', { name: /Buka Kunci Lewat Review/i });
    fireEvent.click(unlockReviewBtn);
    expect(mockOnStartReview).toHaveBeenCalled();
  });
});
