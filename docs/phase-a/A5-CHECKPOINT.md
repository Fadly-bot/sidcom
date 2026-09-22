# Phase A.5 Checkpoint: Spaced Repetition System (SRS) & Review Debt Gate
## SIDCOM / Karsa Communication Learning Platform

**Checkpoint Date:** September 22, 2026  
**Auditor / Engineer:** Lead Software Architect & Cognitive Systems Engineer  
**Document Status:** Approved Engineering Checkpoint  
**Target Milestone:** Phase A.5 Completion & Phase A.6 Gate Authorization  

---

## 1. Executive Summary

Phase A.5 implements the deliberate retrieval and memory retention infrastructure for the SIDCOM / Karsa platform. In strict accordance with `LEARNING-SYSTEM.md` §4, `PRODUCT-RULES.md` §3 & §7, and `PHASE-C2-FINAL-AUDIT.md`, communication mastery is treated as an athletic, retrievable competency governed by the modern **Difficulty-Stability-Retrievability (DSR)** cognitive model.

Key architectural deliverables:
1. **Mathematical DSR Engine (`backend/src/srs/dsr-algorithm.ts`):**
   - Retrievability curve: $R(t) = \left(1 + \frac{t}{9 \cdot S}\right)^{-1}$
   - Dynamic stability adaptation mapping 4-point rating scales:
     - **Rating 1 (Again, $<80\%$):** $S_{\text{new}} = \max(1.0, S \times 0.2)$, interval resets to 1 day ($I_1$). Parent lesson decays to `REVIEW_REQUIRED`.
     - **Rating 2 (Hard, $80–84\%$):** $S_{\text{new}} = S \times 1.15$, interval expands conservatively.
     - **Rating 3 (Good, $85–94\%$):** $S_{\text{new}} = S \times 2.20$, interval advances to next standard milestone.
     - **Rating 4 (Easy, $95–100\%$):** $S_{\text{new}} = S \times 3.50$, accelerated expansion ($1.5\times$).
2. **Atomic Granularity (ReviewCard $\rightarrow$ ReviewItem):**
   - Daily lessons yield 2 atomic `ReviewCards` (30–45 seconds).
   - Upon initial completion of Day $N$, its 2 ReviewCards are automatically scheduled for Day +1 retrieval ($I_1 = 1\text{ day}$).
   - Study sessions serve **5 to 8 ReviewCards** (3–5 minutes total), prioritized by lowest retrievability $R(t)$ and oldest due dates.
3. **Day +1 Mastery Elevation & Memory Preservation:**
   - Clearing the Day +1 ($I_1 = 1\text{ day}$) retrieval drill with score $\ge 80.0\%$ promotes the parent lesson to `MASTERED`.
   - Failing Day +1 retrieval ($< 80.0\%$) preserves `COMPLETED` state without backward regression.
4. **3-Tier Review Debt & Hard Progression Lock:**
   - **Tier 1 (Normal Load: 1–5 Overdue Cards):** Soft reminder banner; daily lessons remain accessible.
   - **Tier 2 (Heavy Debt: 6–12 Overdue Cards):** High-friction nudge modal recommending review clearance before starting new lessons.
   - **Tier 3 (Critical Debt: $\ge 13$ Overdue Cards):** **HARD PROGRESSION LOCK** on daily lessons (`getLessonDetail` and `submitLessonAttempt` return HTTP 403 Forbidden).
   - **One-Session Unlock Tenet:** Completing 1 review session (5–8 cards) drops debt by $\ge 5$ cards (e.g. $15 - 5 = 10 \le 12$), dropping the student into Tier 2 and immediately unlocking daily lesson access.

---

## 2. Review Debt Governance Model

```text
Overdue ReviewCards Count (due_at <= NOW())
   │
   ├── 0 to 5 Overdue   ──► [Tier 1: NORMAL LOAD]
   │                         • Soft banner indicator
   │                         • Daily lesson fully unlocked
   │
   ├── 6 to 12 Overdue  ──► [Tier 2: HEAVY DEBT]
   │                         • High-friction prioritized nudge modal
   │                         • Daily lesson fully unlocked
   │
   └── >= 13 Overdue    ──► [Tier 3: CRITICAL DEBT]
                             • HARD PROGRESSION LOCK on Daily Lessons
                             • HTTP 403 on /lessons/:id and /lessons/:id/submit
                             • Student completes 1 Review Session (5–8 cards)
                                  │
                                  ▼
                             Debt drops below 13 (Tier 2) -> UNLOCKED!
```

---

## 3. Subsystem Architecture

```text
POST /api/v1/srs/review
         │
         ▼
[Authentication Middleware]
         │
         ▼
[Validation (score: 0-100)]
         │
         ▼
   [SrsService.processReviewSubmission()]
   ├── Query review_items WHERE user_id = $1 AND review_card_id = $2
   ├── DsrAlgorithm.evaluateReview()
   │     ├── Computes rating (Again, Hard, Good, Easy)
   │     ├── Computes newStability = S * factor
   │     └── Computes newDueDate = NOW() + intervalDays
   ├── UPDATE review_items SET stability_days, retrievability_estimate, due_at...
   ├── Parent Lesson State Synchronization:
   │     ├── If COMPLETED and score >= 80% ──► promoteToMastered() -> MASTERED
   │     ├── If MASTERED and score < 80%   ──► markReviewRequired() -> REVIEW_REQUIRED
   │     └── If REVIEW_REQUIRED and >= 80% ──► promoteToMastered() -> MASTERED
   └── SrsService.calculateReviewDebt() ──► Return current tier & debt status
```

---

## 4. Test & Verification Matrix

Automated verification suite: `backend/tests/srs.test.ts` (14 automated integration tests).

| Test Category | Target Vector | Expected Behavior | Result |
| :--- | :--- | :--- | :--- |
| **DSR Formula** | $R(t)$ at $t=0, 1, 9$ days | Exponential decay matches $R(0)=1.0, R(1)=0.9, R(9)=0.5$ | **PASS** |
| **Score to Rating**| Score thresholds (75, 82, 90, 98%) | Accurately maps to Again (1), Hard (2), Good (3), Easy (4) | **PASS** |
| **Stability Math** | Rating 4 vs Rating 1 updates | Rating 4 expands ($3.5\times$); Rating 1 lapses to 1.0 day | **PASS** |
| **Card Ingestion** | Day 1 completion triggers ingestion | 2 atomic `ReviewCards` ingested with $I_1 = 1\text{ day}$ due date | **PASS** |
| **Session Delivery**| Due card retrieval | Serves due cards in 5–8 card batch sorted by lowest $R$ | **PASS** |
| **Mastery Elevation**| Day +1 retrieval scored $\ge 80\%$ | Elevates parent lesson to `MASTERED` | **PASS** |
| **Memory Decay** | Retrievability decay / lapsed review | Transitions parent lesson from `MASTERED` to `REVIEW_REQUIRED` | **PASS** |
| **Mastery Restored**| Re-clearing review with $\ge 80\%$ | Restores parent lesson to `MASTERED` | **PASS** |
| **Tier 3 Threshold**| 15 overdue cards | Triggers Tier 3 Critical Debt (`hard_locked: true`) | **PASS** |
| **Lesson Detail Lock**| Fetching lesson while in Tier 3 | 403 Forbidden ("critical review debt (15 overdue cards)") | **PASS** |
| **Lesson Submit Lock**| Submitting attempt while in Tier 3 | 403 Forbidden ("critical review debt") | **PASS** |
| **One-Session Unlock**| Completing 5 cards in 1 session | Debt drops from 15 to 10 (Tier 2); daily lesson unlocks! | **PASS** |
| **Validation Guard**| Submitting score $> 100$ or $< 0$ | 400 Validation Error | **PASS** |
| **User Isolation** | User A debt vs User B debt | User B has 0 debt when User A has heavy debt | **PASS** |

---

## 5. Security & Invariant Audit

```text
Exploit: User attempts to bypass Tier 3 hard lock by calling /learning/lessons/:id/submit
Defense: Both getLessonDetail and submitLessonAttempt call SrsService.calculateReviewDebt(userId) and reject requests with HTTP 403 when hard_locked is true.
Status: BLOCKED

Exploit: Learner submits tampered negative or inflated (>100%) review score
Defense: Zod schema validation and SrsService reject scores outside [0, 100].
Status: BLOCKED

Exploit: User A attempts to review User B's review items
Defense: All queries filter strictly by WHERE user_id = $1 (authenticated token identity).
Status: BLOCKED

Exploit: Failed review corrupts progression backwards to LOCKED
Defense: Parent lesson progression transitions only between COMPLETED <-> MASTERED <-> REVIEW_REQUIRED; never regresses to AVAILABLE or LOCKED.
Status: BLOCKED
```

---

## 6. Quality Guardian Scan Results

```text
Scanner: npm audit
Vulnerabilities Found: 0
Status: PASS

TypeScript Compilation: tsc --noEmit / build
Status: PASS (0 errors)

Unit & Integration Tests:
Total Test Files: 10
Total Tests: 81 passed (100%)
Status: PASS
```

---

## 7. Checkpoint Gate Status

```text
==========================================
PHASE A.5 STATUS: PASS
NEXT PHASE (A.6 - LearningCommand Offline Sync & Idempotency): UNLOCKED
==========================================
```
