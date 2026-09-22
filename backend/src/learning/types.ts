export type ProgressionState =
  | 'LOCKED'
  | 'AVAILABLE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'MASTERED'
  | 'REVIEW_REQUIRED';

export interface UserProgressRecord {
  id: string;
  user_id: string;
  lesson_id: string;
  state: ProgressionState;
  best_score_percentage: number;
  attempts_count: number;
  completed_at: string | null;
  mastered_at: string | null;
  quarantine_until: string | null;
  updated_at: string;
}

export interface QuestionAnswerSubmission {
  question_id: string;
  selected_option_ids: string[];
}

export interface LessonAttemptSubmission {
  lesson_id: string;
  answers: QuestionAnswerSubmission[];
  elapsed_active_seconds: number;
  client_timestamp?: string;
}

export interface QuestionGradingDetail {
  question_id: string;
  correct: boolean;
  correct_option_ids: string[];
  explanation: string;
}

export interface GradingResult {
  lesson_id: string;
  total_questions: number;
  correct_questions: number;
  score_percentage: number;
  passed: boolean;
  min_active_seconds_met: boolean;
  quarantined: boolean;
  provisional_study: boolean;
  previous_state: ProgressionState;
  new_state: ProgressionState;
  unlocked_next_lesson_id: string | null;
  quarantine_until: string | null;
  question_details: QuestionGradingDetail[];
}

export interface LessonSummary {
  id: string;
  day_number: number;
  title: string;
  activity_type: string;
  duration_minutes: number;
  difficulty_level: number;
  prerequisite_lesson_id: string | null;
  state: ProgressionState;
  best_score_percentage: number;
  attempts_count: number;
  completed_at: string | null;
  mastered_at: string | null;
  quarantine_until: string | null;
}
