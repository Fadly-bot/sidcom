export type XpCategory = 'PRACTICE' | 'MILESTONE' | 'RECOVERY';

export interface XpLedgerRecord {
  id: string;
  user_id: string;
  category: XpCategory;
  base_xp: number;
  bonus_xp: number;
  total_xp: number;
  reference_id: string | null;
  reference_type: string | null;
  awarded_at: string;
  calendar_date: string;
}

export interface AwardXpOptions {
  category: XpCategory;
  baseXp: number;
  bonusXp?: number | undefined;
  referenceId?: string | undefined;
  referenceType?: string | undefined;
  clientTimestamp?: string | undefined;
}

export interface AwardXpResult {
  awarded: boolean;
  totalXpAwarded: number;
  baseXpAwarded: number;
  bonusXpAwarded: number;
  category: XpCategory;
  reason?: string | undefined;
  ledgerId?: string | undefined;
}

export interface XpSummary {
  total_xp: number;
  today_practice_xp: number;
  daily_practice_ceiling: number;
  breakdown: {
    practice_xp: number;
    milestone_xp: number;
    recovery_xp: number;
  };
}

export interface UserStreakRecord {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  banked_freezes: number;
  last_activity_date: string | null;
  last_streak_evaluated_at: string | null;
  grace_window_ends_at: string | null;
  updated_at: string;
}

export interface StreakStatus {
  current_streak: number;
  longest_streak: number;
  banked_freezes: number;
  last_activity_date: string | null;
  profile_timezone: string;
  is_active_today: boolean;
  in_grace_recovery: boolean;
  grace_recovery_expires_at: string | null;
  seconds_until_midnight: number;
}
