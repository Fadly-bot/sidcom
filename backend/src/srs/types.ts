export type DsrRating = 1 | 2 | 3 | 4; // 1: Again, 2: Hard, 3: Good, 4: Easy

export interface ReviewCardRecord {
  id: string;
  lesson_id: string;
  skill_id: string;
  prompt_type: string;
  prompt_text: string;
  stimulus_text: string | null;
  answer_payload: any;
  explanation: string;
  card_difficulty: number;
  estimated_seconds: number;
  created_at: string;
}

export interface ReviewItemRecord {
  id: string;
  user_id: string;
  review_card_id: string;
  lesson_id: string;
  stability_days: number;
  difficulty_rating: number;
  retrievability_estimate: number;
  last_reviewed_at: string | null;
  due_at: string;
  review_count: number;
  lapses_count: number;
  updated_at: string;
}

export type ReviewDebtTier = 1 | 2 | 3;

export interface ReviewDebtStatus {
  overdue_count: number;
  tier: ReviewDebtTier;
  hard_locked: boolean;
  tier_name: 'NORMAL' | 'HEAVY_DEBT' | 'CRITICAL_DEBT';
  message: string;
}

export interface ReviewCardSubmission {
  review_card_id: string;
  score_percentage: number;
  rating?: DsrRating;
  elapsed_active_seconds?: number;
}

export interface ReviewProcessResult {
  review_item_id: string;
  review_card_id: string;
  previous_stability: number;
  new_stability: number;
  calculated_rating: DsrRating;
  new_due_at: string;
  new_retrievability: number;
  parent_lesson_state?: string | undefined;
  debt_status: ReviewDebtStatus;
}

export interface DueReviewCard {
  review_item_id: string;
  review_card_id: string;
  lesson_id: string;
  stability_days: number;
  difficulty_rating: number;
  current_retrievability: number;
  due_at: string;
  prompt_type: string;
  prompt_text: string;
  stimulus_text: string | null;
  answer_payload: any;
  explanation: string;
}
