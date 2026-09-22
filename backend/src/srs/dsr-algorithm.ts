import { DsrRating } from './types.js';

export interface DsrCalculationResult {
  rating: DsrRating;
  newStability: number;
  intervalDays: number;
  newRetrievability: number;
  lapsed: boolean;
}

export class DsrAlgorithm {
  /**
   * Calculates Retrievability R at elapsed time t (in days) given stability S:
   * R(t) = (1 + t / (9 * S))^(-1)
   */
  static calculateRetrievability(elapsedDays: number, stabilityDays: number): number {
    if (stabilityDays <= 0) return 0.0;
    const t = Math.max(0, elapsedDays);
    const r = Math.pow(1 + t / (9 * stabilityDays), -1);
    return Math.round(Math.min(1.0, Math.max(0.0, r)) * 10000) / 10000;
  }

  /**
   * Converts score percentage (0-100) to standard 4-point DSR rating:
   * - < 80%: 1 (Again)
   * - 80-84%: 2 (Hard)
   * - 85-94%: 3 (Good)
   * - 95-100%: 4 (Easy)
   */
  static scoreToRating(scorePercentage: number): DsrRating {
    if (scorePercentage < 80.0) return 1;
    if (scorePercentage < 85.0) return 2;
    if (scorePercentage < 95.0) return 3;
    return 4;
  }

  /**
   * Updates Stability and calculates next Interval according to DSR adaptation.
   */
  static evaluateReview(params: {
    currentStability: number;
    scorePercentage: number;
    explicitRating?: DsrRating | undefined;
  }): DsrCalculationResult {
    const { currentStability, scorePercentage, explicitRating } = params;
    const rating = explicitRating ?? this.scoreToRating(scorePercentage);
    const S = Math.max(1.0, currentStability);

    let newStability: number;
    let intervalDays: number;
    let lapsed = false;

    switch (rating) {
      case 1: // Again (< 80%)
        newStability = Math.max(1.0, Math.round(S * 0.2 * 1000) / 1000);
        intervalDays = 1.0; // Reset to 1 day
        lapsed = true;
        break;

      case 2: // Hard (80-84%)
        newStability = Math.round(S * 1.15 * 1000) / 1000;
        intervalDays = Math.max(1, Math.round(newStability * 1.2));
        break;

      case 3: // Good (85-94%)
        newStability = Math.round(S * 2.20 * 1000) / 1000;
        intervalDays = Math.max(1, Math.round(newStability));
        break;

      case 4: // Easy (95-100%)
        newStability = Math.round(S * 3.50 * 1000) / 1000;
        intervalDays = Math.max(1, Math.round(newStability * 1.5));
        break;
    }

    return {
      rating,
      newStability,
      intervalDays,
      newRetrievability: 1.0, // Immediately after successful review, R is 1.0
      lapsed
    };
  }
}
