import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { ReviewPlayer } from '../components/ReviewPlayer';
import { learningService } from '../services/learning-service';

describe('ReviewPlayer Component (Spaced Retrieval)', () => {
  const mockQueue = [
    {
      id: 'rc-1',
      skill_id: 'skill-1',
      prompt: 'Jelaskan 3 elemen utama dalam siklus feedback simultan model transaksional!',
      back_content: 'Elemen: 1. Konteks relasional, 2. Gangguan (noise) internal/eksternal, 3. Isyarat nonverbal berkesinambungan.',
      ideal_response: 'Konteks relasional, noise, dan isyarat simultan.',
      due_date: '2026-09-22T00:00:00Z',
    },
    {
      id: 'rc-2',
      skill_id: 'skill-1',
      prompt: 'Bagaimana cara membedakan niat vs dampak dalam komunikasi asertif?',
      back_content: 'Niat berfokus pada motivasi internal pembicara, sedangkan dampak diukur dari respons emosional dan kognitif lawan bicara.',
      ideal_response: 'Pemisahan motivasi subjektif dari efek teramati.',
      due_date: '2026-09-22T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(learningService, 'getReviewQueue').mockResolvedValue({
      queue: mockQueue,
      total_due: 2,
      debt_tier: 'TIER_1_SOFT_REMINDER',
    });
    vi.spyOn(learningService, 'submitReview').mockResolvedValue({ success: true });
  });

  it('renders flashcard front, reveals back on click, and advances through ratings to completion', async () => {
    const mockClose = vi.fn();
    const mockCompleted = vi.fn();

    render(<ReviewPlayer onClose={mockClose} onSessionCompleted={mockCompleted} />);

    // Card 1 Front
    await waitFor(() => {
      expect(screen.getByText(/Jelaskan 3 elemen utama dalam siklus feedback/i)).toBeInTheDocument();
      expect(screen.getByText(/Kartu 1 dari 2/i)).toBeInTheDocument();
    });

    // Reveal Back
    const revealBtn = screen.getByRole('button', { name: /Lihat Jawaban & Rubrik/i });
    fireEvent.click(revealBtn);

    expect(screen.getByText(/Konteks relasional, noise, dan isyarat simultan/i)).toBeInTheDocument();

    // Rate Good (3)
    const goodBtn = screen.getByRole('button', { name: /Bagus \(3\)/i });
    fireEvent.click(goodBtn);

    expect(learningService.submitReview).toHaveBeenCalledWith('rc-1', 3, expect.any(Number));

    // Card 2 Front
    await waitFor(() => {
      expect(screen.getByText(/Bagaimana cara membedakan niat vs dampak/i)).toBeInTheDocument();
      expect(screen.getByText(/Kartu 2 dari 2/i)).toBeInTheDocument();
    });

    // Reveal and Rate Easy (4)
    fireEvent.click(screen.getByRole('button', { name: /Lihat Jawaban & Rubrik/i }));
    fireEvent.click(screen.getByRole('button', { name: /Mudah \(4\)/i }));

    expect(learningService.submitReview).toHaveBeenCalledWith('rc-2', 4, expect.any(Number));

    // Session Completed Summary
    await waitFor(() => {
      expect(screen.getByText(/Sesi Review Selesai!/i)).toBeInTheDocument();
      expect(screen.getByText(/Anda telah meninjau 2 kartu memori/i)).toBeInTheDocument();
    });

    expect(mockCompleted).toHaveBeenCalled();
  });
});
