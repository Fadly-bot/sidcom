# Phase A.7 Checkpoint: XP Economics, Daily Streak & Timezone Governance Engine
## SIDCOM / Karsa Communication Learning Platform

**Checkpoint Date:** September 22, 2026  
**Auditor / Engineer:** Lead Software Architect, Behavioral Economics & Security Engineer  
**Document Status:** Approved Engineering Checkpoint  
**Target Milestone:** Phase A.7 Completion & Phase A.8 Gate Authorization  

---

## 1. Executive Summary

Phase A.7 implements the ethical gamification, non-inflationary XP economics, streak calculation engine, and timezone governance rules in strict compliance with `PRODUCT-RULES.md` §4 & §5, `LEARNING-SYSTEM.md` §10, and `PHASE-C2-FINAL-AUDIT.md`.

All gamification calculations are **strictly server-authoritative**: client devices and timestamps are untrusted, and progression cannot be gamed via local clock manipulation or timezone spoofing.

Key architectural deliverables:
1. **Non-Inflationary Categorized XP Ledger (`backend/src/gamification/xp-service.ts`):**
   - **`PRACTICE` Category:** Subject to an unbreachable hard ceiling of **150 Practice XP per calendar day** (evaluated in user's profile timezone).
   - **`MILESTONE` Category (Weekly Checkpoints / Phase Capstones):** Completely **exempt** from the 150 daily practice ceiling (awarded in full).
   - **`RECOVERY` Category (Grace Recovery Challenges):** Completely **exempt** from the 150 daily practice ceiling.
   - **Zero-XP Replay Protection:** Re-attempting an already completed or mastered lesson yields 0 XP.
   - **Provisional Study Protection:** Sub-15m retries or $< 45$s attempts award 0 XP.
2. **Authoritative Daily Streak Engine (`backend/src/gamification/streak-service.ts`):**
   - Requires genuine educational actions ($\ge 1$ passed lesson or full spaced review session).
   - App opens, passive browsing, and quarantined attempts award **0 streak credit**.
   - **14-Day Streak Freeze Earning:** Exactly 1 banked freeze earned every 14 days of unbroken practice, capped at **2 banked freezes** (no pay-to-win purchases allowed).
   - **Automatic Freeze Consumption:** Missing 1 day consumes 1 banked freeze, preserving and advancing the streak.
   - **24-Hour Grace Recovery Window:** If a streak breaks with 0 freezes, the learner enters a 24-hour grace window where completing a recovery challenge restores the unbroken streak count.
3. **Timezone Profile Governance & Anti-Hopping Throttle (`backend/src/gamification/timezone-utils.ts`):**
   - Authoritative evaluation strictly references `users.profile_timezone` (registered IANA timezone). Client `X-Timezone` header is advisory only.
   - Profile timezone updates in Settings are throttled to **at most 1 change every 30 days** (`409 Conflict`), preventing timezone-hopping streak abuse.
   - **15-Minute Midnight Grace Window:** Activities submitted between `00:00:00` and `00:15:00` local time are credited to the previous calendar day if yesterday missed activity, accommodating late-night practice and transmission latency.

---

## 2. XP & Streak Architecture Specification

```text
Student Action (Lesson Attempt / Review Session / Recovery Challenge)
  │
  ▼
Domain Service Evaluation (LearningService / SrsService)
  ├── 1. Authoritative Grading & Completion Check
  │       (Score >= 80%, elapsedActiveSeconds >= 45s, NOT provisionalStudy)
  │
  ├── 2. Award XP (XpService.awardXp)
  │       ├── Category == PRACTICE
  │       │     ├── Replay Check: Already awarded for reference? ──► Return 0 XP
  │       │     └── Daily Cap Check: Sum today's Practice XP
  │       │           ├── Already >= 150 ──► Return 0 XP (Ceiling Reached)
  │       │           └── Cap partial reward: min(award, 150 - currentPracticeXp)
  │       │
  │       └── Category in (MILESTONE, RECOVERY)
  │             └── Award in full (EXEMPT from 150 daily cap)
  │
  └── 3. Record Streak Activity (StreakService.recordQualifyingActivity)
          ├── Fetch authoritative IANA timezone (users.profile_timezone)
          ├── Determine Zoned Time & Midnight Grace (00:00:00 - 00:15:00)
          │     └── Yesterday missed? ──► Attribute to yesterday
          │
          ├── Same calendar day? ──► Idempotent skip (no duplicate streak increment)
          ├── Consecutive day? ──► Increment streak (+1); every 14d earn freeze (max 2)
          ├── Missed 1 day with freeze? ──► Consume 1 freeze (-1), preserve & increment
          ├── Missed days without freeze? ──► Reset to 1; open 24h Grace Recovery Window
          └── Recovery Challenge during 24h grace? ──► Restore previous streak!
```

---

## 3. Automated Verification Matrix

| Test Suite / Area | Scenario Tested | Assertions | Status |
| :--- | :--- | :--- | :--- |
| **XP: Practice & Bonus** | High score attempt ($\ge 90\%$) | Awards Base 15 XP + 10 Bonus = 25 Practice XP | **PASS** |
| **XP: Replay Protection** | Replay of same lesson | Rejects duplicate reward, awards 0 XP | **PASS** |
| **XP: Daily Ceiling** | 150 Practice XP ceiling | Enforces 150 daily cap, scales partial awards, rejects $>150$ | **PASS** |
| **XP: Milestone Exemption** | Capstone after cap | Awards 125 Milestone XP in full even when Practice cap is 150 | **PASS** |
| **XP: Recovery Exemption** | Recovery Challenge after cap | Awards 20 Recovery XP in full, completely exempt from 150 cap | **PASS** |
| **XP: Summary API** | `GET /api/v1/gamification/xp` | Returns accurate total, today usage (150/150), and breakdown | **PASS** |
| **Streak: Initial** | First qualifying action | Starts streak at 1, 0 freezes | **PASS** |
| **Streak: Same Day** | Multiple same-day actions | Does not duplicate increment streak on same calendar date | **PASS** |
| **Streak: Consecutive** | Consecutive calendar day | Increments streak to 2 | **PASS** |
| **Streak: Freeze Earning** | 14 days consecutive practice | Awards 1 banked freeze on day 14 (banked: 1) | **PASS** |
| **Streak: Freeze Consumption** | Missed 1 day with banked freeze | Consumes 1 freeze, preserves unbroken streak (15) | **PASS** |
| **Streak: Streak Break** | Missed 2 days with 0 freezes | Resets streak to 1, flags `in_grace_recovery = true` | **PASS** |
| **Streak: Grace Recovery** | 24-hour Recovery Challenge | Restores previous streak to 16 | **PASS** |
| **Streak: Midnight Grace** | Activity at 00:05 next day | Attributed to yesterday via 15m grace; saves consecutive streak | **PASS** |
| **Timezone: Status API** | `GET /api/v1/gamification/streak` | Returns timezone, active status, countdown to local midnight | **PASS** |
| **Timezone: Update** | `PUT /api/v1/gamification/timezone` | Successfully updates profile timezone to `Asia/Makassar` | **PASS** |
| **Timezone: 30d Throttle** | Second timezone change within 30d | Rejected with HTTP 409 Conflict | **PASS** |
| **Timezone: Format Validation** | Invalid IANA timezone string | Rejected with HTTP 400 Validation Error | **PASS** |
| **Security: Auth Boundary** | Unauthenticated access | Returns HTTP 401 Unauthorized | **PASS** |

**Regression Suite Result:**
- **Test Files:** 12 passed (12)
- **Total Tests:** 110 passed (110)
- **Time:** ~71s
- **Failures:** 0

---

## 4. Quality Guardian & Security Audit

| Tool | Target / Command | Result | Findings |
| :--- | :--- | :--- | :--- |
| **npm audit** | `npm.cmd audit` | **PASS** | `found 0 vulnerabilities` |
| **TypeScript Compiler** | `tsc --noEmit` | **PASS** | 0 compilation errors across entire backend |
| **Client Header Boundary** | `X-Timezone` Spoofing | **PASS** | Authoritative calculations strictly ignore client headers; DB `profile_timezone` is used |
| **Streak Hopping Defense** | Timezone Throttle | **PASS** | 30-day throttle prevents hopping across timezones to harvest streaks |
| **Anti-Farming Ledger** | `xp_ledger` unique reference | **PASS** | Replaying completed lessons yields 0 XP |

---

## 5. Architectural Compliance Verification

- [x] **Categorized XP Ledger (`PRODUCT-RULES.md` §5.1):** Explicitly isolates `PRACTICE`, `MILESTONE`, and `RECOVERY`.
- [x] **150 Practice XP Ceiling (`PHASE-C2-FINAL-AUDIT.md`):** Strictly enforced per calendar day; Milestone & Recovery exempt.
- [x] **Server-Authoritative Timezone (`PRD.md` §8.5):** Evaluated against registered IANA profile timezone.
- [x] **Timezone Modification Throttle (`PRODUCT-RULES.md` §4.2):** Restricted to at most 1 update per 30 days.
- [x] **15-Minute Midnight Grace (`PRD.md` FR-STRK-01):** Accommodates late submissions and latency.
- [x] **Earned Streak Freezes (No Pay-to-Win) (`PRD.md` §8.5):** Max 2 freezes, earned exclusively via 14-day practice.
- [x] **24-Hour Grace Recovery Window (`PRODUCT-RULES.md` §4.5):** Double spaced-review challenge restores broken streak.

---

## 6. Phase A.7 Checkpoint Verdict

```text
=====================================================
PHASE A.7 STATUS: PASS
ALL TESTS: 110 / 110 PASSING (100%)
QUALITY GUARDIAN: PASS (0 VULNERABILITIES)
PHASE A.8 GATE: OPEN (UNLOCKED)
=====================================================
```
