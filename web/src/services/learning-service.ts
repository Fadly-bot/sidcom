import { apiClient } from './api-client';
import { enqueueCommand } from './offline-queue';

export interface DashboardData {
  active_streak: number;
  banked_freezes: number;
  today_completed: boolean;
  local_day_remaining_seconds: number;
  today_lesson: {
    lesson_id: string;
    title: string;
    state: 'LOCKED' | 'AVAILABLE' | 'COMPLETED' | 'MASTERED' | 'REVIEW_REQUIRED';
    duration_minutes: number;
  } | null;
  due_reviews_count: number;
  review_debt_tier: 'NONE' | 'TIER_1_SOFT_REMINDER' | 'TIER_2_PRIORITIZED_GATE' | 'TIER_3_HARD_LOCK';
  weak_skill_alert: string | null;
}

export interface PathNode {
  lesson_id: string;
  phase_number: number;
  week_number: number;
  day_number: number;
  title: string;
  lesson_type: string;
  state: 'LOCKED' | 'AVAILABLE' | 'COMPLETED' | 'MASTERED' | 'REVIEW_REQUIRED';
  score?: number;
}

export interface PathData {
  user_id: string;
  total_lessons: number;
  completed_count: number;
  mastered_count: number;
  nodes: PathNode[];
}

export interface LessonDetail {
  id: string;
  phase_id: string;
  day_number: number;
  title: string;
  lesson_type: string;
  state: string;
  objectives: Array<{ id: string; description: string }>;
  concepts: Array<{ id: string; title: string; explanation: string; example_bad?: string; example_good?: string }>;
  scenarios: Array<{
    id: string;
    context: string;
    counterpart_name: string;
    counterpart_role: string;
    counterpart_mood: string;
    branches: Array<{ id: string; option_text: string; feedback_text: string; is_optimal: boolean }>;
  }>;
  audio_exercises: Array<{
    id: string;
    title: string;
    prompt: string;
    transcript: string;
    target_wpm_min: number;
    target_wpm_max: number;
    target_pause_seconds: number;
    exemplar_audio_url: string;
    written_fallback_allowed: boolean;
    rubrics: Array<{
      id: string;
      criteria: Array<{ id: string; name: string; description: string; weight: number }>;
    }>;
  }>;
  quizzes: Array<{
    id: string;
    title: string;
    questions: Array<{
      id: string;
      prompt: string;
      options: Array<{ id: string; option_text: string; is_correct?: boolean; feedback?: string }>;
    }>;
  }>;
}

export interface ReviewCardItem {
  id: string;
  skill_id: string;
  prompt: string;
  back_content: string;
  ideal_response: string;
  due_date: string;
}

export const learningService = {
  async getDashboard(): Promise<DashboardData> {
    return apiClient<DashboardData>('/api/v1/users/me/dashboard');
  },

  async getPath(): Promise<PathData> {
    return apiClient<PathData>('/api/v1/learning/path');
  },

  async getLesson(lessonId: string): Promise<LessonDetail> {
    const res = await apiClient<{ lesson: LessonDetail }>(`/api/v1/learning/lessons/${lessonId}`);
    return res.lesson;
  },

  async submitAttempt(lessonId: string, payload: any, elapsedSeconds: number): Promise<any> {
    // Check if network is offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      // Enqueue to offline IndexedDB
      const cmd = await enqueueCommand('SUBMIT_LESSON_ATTEMPT', {
        lesson_id: lessonId,
        elapsed_seconds: elapsedSeconds,
        answers: payload.answers,
        audio_delivery: payload.audio_delivery,
        reflection: payload.reflection,
      });
      return {
        is_offline: true,
        command_id: cmd.command_id,
        message: 'Hasil latihan disimpan secara lokal dan akan disinkronkan saat online.',
      };
    }

    try {
      // Direct submission via sync endpoint for parity
      const syncPayload = {
        installation_id: 'web_session',
        sync_timestamp: new Date().toISOString(),
        commands: [
          {
            command_id: (await import('./offline-queue')).generateUUIDv7(),
            command_type: 'SUBMIT_LESSON_ATTEMPT',
            client_seq: 1,
            created_at: new Date().toISOString(),
            payload: {
              lesson_id: lessonId,
              elapsed_seconds: elapsedSeconds,
              answers: payload.answers,
              audio_delivery: payload.audio_delivery,
              reflection: payload.reflection,
            },
          },
        ],
      };

      const syncRes = await apiClient<any>('/api/v1/learning/sync', {
        method: 'POST',
        body: JSON.stringify(syncPayload),
      });

      return syncRes.results?.[0] || { status: 'ACCEPTED' };
    } catch (err: any) {
      if (err.isOffline) {
        // Fallback to offline queue
        const cmd = await enqueueCommand('SUBMIT_LESSON_ATTEMPT', {
          lesson_id: lessonId,
          elapsed_seconds: elapsedSeconds,
          answers: payload.answers,
          audio_delivery: payload.audio_delivery,
          reflection: payload.reflection,
        });
        return {
          is_offline: true,
          command_id: cmd.command_id,
          message: 'Gagal terhubung ke server. Tersimpan di antrian offline.',
        };
      }
      throw err;
    }
  },

  async getReviewQueue(): Promise<{ queue: ReviewCardItem[]; total_due: number; debt_tier: string }> {
    return apiClient<{ queue: ReviewCardItem[]; total_due: number; debt_tier: string }>('/api/v1/srs/queue');
  },

  async submitReview(reviewCardId: string, rating: number, elapsedSeconds: number): Promise<any> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cmd = await enqueueCommand('SUBMIT_SRS_REVIEW', {
        review_card_id: reviewCardId,
        rating,
        elapsed_seconds: elapsedSeconds,
      });
      return { is_offline: true, command_id: cmd.command_id };
    }

    return apiClient('/api/v1/srs/review', {
      method: 'POST',
      body: JSON.stringify({
        review_card_id: reviewCardId,
        rating,
        elapsed_seconds: elapsedSeconds,
      }),
    });
  },

  async updateTimezone(timezone: string): Promise<{ success: boolean; timezone: string }> {
    return apiClient<{ success: boolean; timezone: string }>('/api/v1/gamification/timezone', {
      method: 'PUT',
      body: JSON.stringify({ timezone }),
    });
  },
};
