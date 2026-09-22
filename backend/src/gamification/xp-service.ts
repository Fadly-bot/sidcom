import { getDb, IDatabase } from '../db/index.js';
import { NotFoundError } from '../errors/app-error.js';
import { getZonedTime } from './timezone-utils.js';
import { AwardXpOptions, AwardXpResult, XpSummary, XpCategory } from './types.js';

export const DAILY_PRACTICE_XP_CEILING = 150;

export class XpService {
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
   * Fetches user's registered profile timezone authoritatively from database.
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
   * Authoritatively awards XP according to non-inflationary category economics.
   * Enforces 150 Practice XP daily ceiling while exempting Milestone & Recovery XP.
   */
  async awardXp(userId: string, options: AwardXpOptions): Promise<AwardXpResult> {
    const { category, baseXp, bonusXp = 0, referenceId, referenceType } = options;

    const userTimezone = await this.getUserTimezone(userId);
    const now = options.clientTimestamp ? new Date(options.clientTimestamp) : new Date();
    // Validate if clientTimestamp is a valid Date, fallback to current server time if invalid
    const validDate = isNaN(now.getTime()) ? new Date() : now;
    const zonedTime = getZonedTime(validDate, userTimezone);
    const calendarDate = zonedTime.calendarDate;

    // 1. Anti-farming / Zero-XP replay check
    if (referenceId && referenceType && category === 'PRACTICE') {
      const existingRes = await this.db.query(
        'SELECT id FROM xp_ledger WHERE user_id = $1 AND reference_id = $2 AND reference_type = $3 LIMIT 1;',
        [userId, referenceId, referenceType]
      );
      if (existingRes.rows.length > 0) {
        return {
          awarded: false,
          totalXpAwarded: 0,
          baseXpAwarded: 0,
          bonusXpAwarded: 0,
          category,
          reason: 'Already awarded for this reference (zero-XP replay)'
        };
      }
    }

    let allowedBase = baseXp;
    let allowedBonus = bonusXp;
    let totalAward = allowedBase + allowedBonus;

    // 2. Practice XP Daily Ceiling Enforcement (150 Practice XP per calendar day)
    if (category === 'PRACTICE') {
      const todayPracticeRes = await this.db.query<{ current_practice_xp: string }>(
        `SELECT COALESCE(SUM(total_xp), 0) as current_practice_xp 
         FROM xp_ledger 
         WHERE user_id = $1 AND calendar_date = $2 AND category = 'PRACTICE';`,
        [userId, calendarDate]
      );

      const currentPracticeXp = parseInt(todayPracticeRes.rows[0]?.current_practice_xp ?? '0', 10);
      const remainingAllowance = Math.max(0, DAILY_PRACTICE_XP_CEILING - currentPracticeXp);

      if (remainingAllowance === 0) {
        return {
          awarded: false,
          totalXpAwarded: 0,
          baseXpAwarded: 0,
          bonusXpAwarded: 0,
          category,
          reason: `Daily Practice XP ceiling reached (${DAILY_PRACTICE_XP_CEILING} XP)`
        };
      }

      if (totalAward > remainingAllowance) {
        totalAward = remainingAllowance;
        // Distribute to base first, remainder to bonus
        allowedBase = Math.min(baseXp, totalAward);
        allowedBonus = Math.max(0, totalAward - allowedBase);
      }
    }
    // Milestone and Recovery categories are strictly EXEMPT from the 150 daily ceiling!

    if (totalAward <= 0) {
      return {
        awarded: false,
        totalXpAwarded: 0,
        baseXpAwarded: 0,
        bonusXpAwarded: 0,
        category,
        reason: 'Zero XP to award'
      };
    }

    // 3. Persist to xp_ledger
    const ledgerId = `xp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await this.db.query(
      `INSERT INTO xp_ledger (id, user_id, category, base_xp, bonus_xp, total_xp, reference_id, reference_type, awarded_at, calendar_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9);`,
      [ledgerId, userId, category, allowedBase, allowedBonus, totalAward, referenceId ?? null, referenceType ?? null, calendarDate]
    );

    return {
      awarded: true,
      totalXpAwarded: totalAward,
      baseXpAwarded: allowedBase,
      bonusXpAwarded: allowedBonus,
      category,
      ledgerId
    };
  }

  /**
   * Retrieves user XP summary, daily cap usage, and category breakdown.
   */
  async getXpSummary(userId: string): Promise<XpSummary> {
    const userTimezone = await this.getUserTimezone(userId);
    const zonedTime = getZonedTime(new Date(), userTimezone);
    const calendarDate = zonedTime.calendarDate;

    // Total XP across all time and categories
    const totalsRes = await this.db.query<{
      category: XpCategory;
      total: string;
    }>(
      `SELECT category, COALESCE(SUM(total_xp), 0) as total 
       FROM xp_ledger 
       WHERE user_id = $1 
       GROUP BY category;`,
      [userId]
    );

    let totalXp = 0;
    let practiceXp = 0;
    let milestoneXp = 0;
    let recoveryXp = 0;

    for (const row of totalsRes.rows) {
      const amount = parseInt(row.total, 10);
      totalXp += amount;
      if (row.category === 'PRACTICE') practiceXp = amount;
      if (row.category === 'MILESTONE') milestoneXp = amount;
      if (row.category === 'RECOVERY') recoveryXp = amount;
    }

    // Today's practice XP
    const todayRes = await this.db.query<{ today_practice: string }>(
      `SELECT COALESCE(SUM(total_xp), 0) as today_practice 
       FROM xp_ledger 
       WHERE user_id = $1 AND calendar_date = $2 AND category = 'PRACTICE';`,
      [userId, calendarDate]
    );
    const todayPracticeXp = parseInt(todayRes.rows[0]?.today_practice ?? '0', 10);

    return {
      total_xp: totalXp,
      today_practice_xp: todayPracticeXp,
      daily_practice_ceiling: DAILY_PRACTICE_XP_CEILING,
      breakdown: {
        practice_xp: practiceXp,
        milestone_xp: milestoneXp,
        recovery_xp: recoveryXp
      }
    };
  }
}
