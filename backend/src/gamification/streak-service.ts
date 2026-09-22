import { getDb, IDatabase } from '../db/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/app-error.js';
import {
  getDaysDifference,
  getPreviousDateString,
  getZonedTime,
  isValidIanaTimezone,
  toCalendarDateString
} from './timezone-utils.js';
import { StreakStatus, UserStreakRecord } from './types.js';

export class StreakService {
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
   * Fetches user's registered profile timezone authoritatively.
   */
  async getUserTimezone(userId: string): Promise<string> {
    const res = await this.db.query<{ profile_timezone: string }>(
      'SELECT profile_timezone FROM users WHERE id = $1;',
      [userId]
    );
    if (!res.rows[0]) {
      throw new NotFoundError('User', userId);
    }
    return res.rows[0].profile_timezone || 'Asia/Jakarta';
  }

  /**
   * Updates profile timezone in Settings.
   * Enforces 30-day throttle to prevent timezone-hopping streak manipulation.
   */
  async updateUserTimezone(userId: string, newTimezone: string): Promise<{ profile_timezone: string; last_timezone_changed_at: string }> {
    if (!isValidIanaTimezone(newTimezone)) {
      throw new ValidationError(`Invalid IANA timezone format: '${newTimezone}'`);
    }

    const userRes = await this.db.query<{
      profile_timezone: string;
      last_timezone_changed_at: string | null;
    }>(
      'SELECT profile_timezone, last_timezone_changed_at FROM users WHERE id = $1;',
      [userId]
    );

    if (!userRes.rows[0]) {
      throw new NotFoundError('User', userId);
    }

    const { last_timezone_changed_at } = userRes.rows[0];

    if (last_timezone_changed_at) {
      const lastChanged = new Date(last_timezone_changed_at);
      const now = new Date();
      const diffDays = (now.getTime() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);

      if (diffDays < 30) {
        const remainingDays = Math.ceil(30 - diffDays);
        throw new ConflictError(
          `Profile timezone can only be updated once every 30 days to prevent streak manipulation. Please try again in ${remainingDays} day(s).`
        );
      }
    }

    const updateRes = await this.db.query<{
      profile_timezone: string;
      last_timezone_changed_at: string;
    }>(
      `UPDATE users 
       SET profile_timezone = $1, 
           last_timezone_changed_at = NOW(), 
           updated_at = NOW() 
       WHERE id = $2 
       RETURNING profile_timezone, last_timezone_changed_at;`,
      [newTimezone, userId]
    );

    const updated = updateRes.rows[0];
    if (!updated) {
      throw new Error(`Failed to update timezone for user ${userId}`);
    }
    return updated;
  }

  /**
   * Fetches or initializes user streak record in user_streaks.
   */
  async getOrCreateUserStreak(userId: string): Promise<UserStreakRecord> {
    const res = await this.db.query<UserStreakRecord>(
      'SELECT * FROM user_streaks WHERE user_id = $1;',
      [userId]
    );

    if (res.rows[0]) {
      return res.rows[0];
    }

    const insertRes = await this.db.query<UserStreakRecord>(
      `INSERT INTO user_streaks (user_id, current_streak, longest_streak, banked_freezes, last_activity_date, last_streak_evaluated_at, updated_at)
       VALUES ($1, 0, 0, 0, NULL, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
       RETURNING *;`,
      [userId]
    );

    const inserted = insertRes.rows[0];
    if (!inserted) {
      throw new Error(`Failed to initialize streak for user ${userId}`);
    }
    return inserted;
  }

  /**
   * Gets current user streak status evaluated against authoritative profile timezone.
   */
  async getStreakStatus(userId: string): Promise<StreakStatus> {
    const streak = await this.getOrCreateUserStreak(userId);
    const timezone = await this.getUserTimezone(userId);
    const zoned = getZonedTime(new Date(), timezone);

    const lastActivityDateStr = toCalendarDateString(streak.last_activity_date);
    const isActiveToday = lastActivityDateStr === zoned.calendarDate;
    const inGraceRecovery = Boolean(
      streak.grace_window_ends_at && new Date(streak.grace_window_ends_at) > new Date()
    );

    return {
      current_streak: streak.current_streak,
      longest_streak: streak.longest_streak,
      banked_freezes: streak.banked_freezes,
      last_activity_date: lastActivityDateStr,
      profile_timezone: timezone,
      is_active_today: isActiveToday,
      in_grace_recovery: inGraceRecovery,
      grace_recovery_expires_at: streak.grace_window_ends_at,
      seconds_until_midnight: zoned.secondsUntilMidnight
    };
  }

  /**
   * Authoritatively records a qualifying educational action (Lesson, Review Session, Recovery Challenge).
   * Handles consecutive streak increments, 14-day freeze earnings, automatic freeze consumption,
   * 15-minute midnight grace attribution, and 24-hour grace window recovery.
   */
  async recordQualifyingActivity(
    userId: string,
    options: {
      actionType: 'LESSON' | 'REVIEW_SESSION' | 'RECOVERY_CHALLENGE';
      clientTimestamp?: string | undefined;
    }
  ): Promise<{
    streakIncremented: boolean;
    currentStreak: number;
    bankedFreezes: number;
    savedByGraceWindow: boolean;
    savedByFreeze: boolean;
    savedByMidnightGrace: boolean;
    calendarDateUsed: string;
  }> {
    const streak = await this.getOrCreateUserStreak(userId);
    const timezone = await this.getUserTimezone(userId);

    const submissionDate = options.clientTimestamp ? new Date(options.clientTimestamp) : new Date();
    const validDate = isNaN(submissionDate.getTime()) ? new Date() : submissionDate;
    const zoned = getZonedTime(validDate, timezone);

    let effectiveCalendarDate = zoned.calendarDate;
    let savedByMidnightGrace = false;
    const lastActivityDateStr = toCalendarDateString(streak.last_activity_date);

    // 1. Midnight Grace Attribution (15-minute window post-midnight: 00:00:00 to 00:15:00)
    if (zoned.isWithinMidnightGrace) {
      const yesterday = getPreviousDateString(zoned.calendarDate);
      // If yesterday missed activity, and attributing to yesterday preserves unbroken streak:
      if (lastActivityDateStr !== yesterday && lastActivityDateStr !== zoned.calendarDate) {
        effectiveCalendarDate = yesterday;
        savedByMidnightGrace = true;
      }
    }

    // 2. Same-day completion check (no duplicate streak increment for same calendar day)
    if (lastActivityDateStr === effectiveCalendarDate) {
      return {
        streakIncremented: false,
        currentStreak: streak.current_streak,
        bankedFreezes: streak.banked_freezes,
        savedByGraceWindow: false,
        savedByFreeze: false,
        savedByMidnightGrace: false,
        calendarDateUsed: effectiveCalendarDate
      };
    }

    let newStreak = streak.current_streak;
    let longestStreak = streak.longest_streak;
    let bankedFreezes = streak.banked_freezes;
    let savedByFreeze = false;
    let savedByGraceWindow = false;
    let graceWindowEndsAt: string | null = streak.grace_window_ends_at;

    if (!lastActivityDateStr) {
      // First ever qualifying activity
      newStreak = 1;
      longestStreak = Math.max(longestStreak, 1);
    } else {
      const diff = getDaysDifference(lastActivityDateStr, effectiveCalendarDate);

      if (diff === 1) {
        // Consecutive calendar day
        newStreak += 1;
        longestStreak = Math.max(longestStreak, newStreak);
        graceWindowEndsAt = null;

        // Earn 1 banked freeze every 14 days of unbroken streak (max 2 banked freezes)
        if (newStreak % 14 === 0 && bankedFreezes < 2) {
          bankedFreezes += 1;
        }
      } else if (diff === 2) {
        // Missed exactly 1 day
        if (bankedFreezes > 0) {
          // Automatic Streak Freeze consumption!
          bankedFreezes -= 1;
          savedByFreeze = true;
          newStreak += 1;
          longestStreak = Math.max(longestStreak, newStreak);
          graceWindowEndsAt = null;
        } else {
          // Check 24-hour Grace Recovery Challenge
          const now = new Date();
          const inGrace = streak.grace_window_ends_at && new Date(streak.grace_window_ends_at) > now;
          if (inGrace && options.actionType === 'RECOVERY_CHALLENGE') {
            newStreak += 1;
            longestStreak = Math.max(longestStreak, newStreak);
            savedByGraceWindow = true;
            graceWindowEndsAt = null;
          } else {
            // Streak broken -> reset to 1 and open 24h grace recovery window
            newStreak = 1;
            const graceExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            graceWindowEndsAt = graceExpiry.toISOString();
          }
        }
      } else {
        // Missed > 1 day
        const now = new Date();
        const inGrace = streak.grace_window_ends_at && new Date(streak.grace_window_ends_at) > now;
        if (inGrace && options.actionType === 'RECOVERY_CHALLENGE') {
          newStreak += 1;
          longestStreak = Math.max(longestStreak, newStreak);
          savedByGraceWindow = true;
          graceWindowEndsAt = null;
        } else {
          newStreak = 1;
          const graceExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
          graceWindowEndsAt = graceExpiry.toISOString();
        }
      }
    }

    // 3. Persist updated streak record
    await this.db.query(
      `UPDATE user_streaks 
       SET current_streak = $1, 
           longest_streak = $2, 
           banked_freezes = $3, 
           last_activity_date = $4, 
           last_streak_evaluated_at = NOW(), 
           grace_window_ends_at = $5, 
           updated_at = NOW() 
       WHERE user_id = $6;`,
      [newStreak, longestStreak, bankedFreezes, effectiveCalendarDate, graceWindowEndsAt, userId]
    );

    return {
      streakIncremented: true,
      currentStreak: newStreak,
      bankedFreezes,
      savedByGraceWindow,
      savedByFreeze,
      savedByMidnightGrace,
      calendarDateUsed: effectiveCalendarDate
    };
  }
}
