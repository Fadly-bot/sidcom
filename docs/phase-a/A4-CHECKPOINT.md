# Phase A.4 Checkpoint: Learning Domain & Progression State Machine
## SIDCOM / Karsa Communication Learning Platform

**Checkpoint Date:** September 22, 2026  
**Auditor / Engineer:** Lead Software Architect & Learning Domain Engineer  
**Document Status:** Approved Engineering Checkpoint  
**Target Milestone:** Phase A.4 Completion & Phase A.5 Gate Authorization  

---

## 1. Executive Summary

Phase A.4 establishes the server-authoritative learning progression and state machine engine for the SIDCOM / Karsa platform. In strict adherence to `PHASE-C2-FINAL-AUDIT.md`, `PRODUCT-RULES.md`, and `LEARNING-SYSTEM.md`, the learning progression model enforces zero client trust: client-reported scores, client timestamps, and local attempts are strictly treated as untrusted inputs.

Key architectural deliverables:
1. **Canonical State Machine:**
   $$\text{LOCKED} \xrightarrow{\text{Unlock}} \text{AVAILABLE} \xrightarrow{\text{Pass } \ge 80\%} \text{COMPLETED} \xrightarrow{\text{Pass Day +1 } I_1 \ge 80\%} \text{MASTERED}$$
   and $\text{MASTERED} \xrightarrow{R < 0.70} \text{REVIEW_REQUIRED} \xrightarrow{\text{Pass } \ge 80\%} \text{MASTERED}$.
2. **Strict Separation Between Sequential Unlocking and Mastery:**
   - Day $N$ achieving `COMPLETED` ($\ge 80.0\%$) **immediately** unlocks Day $N+1$ to `AVAILABLE`.
   - `MASTERED` status is **NOT** required to unlock Day $N+1$.
   - `MASTERED` is awarded strictly upon passing the Day +1 ($I_1 = 1\text{ day}$) spaced retrieval drill ($\ge 80.0\%$).
3. **Anti-Regression & Preserve-Max Invariant:** Progress never moves backwards. A lesson that is `MASTERED` can never regress to `COMPLETED`, `AVAILABLE`, or `LOCKED`. A lesson that is `COMPLETED` can never regress to `AVAILABLE` or `LOCKED`.
4. **Anti-Brute-Force 15-Minute Quarantine:** Submissions that fail ($< 80.0\%$) lock the student into a 15-minute pedagogical reflection cool-down. Attempts submitted before the cool-down expires are flagged as `PROVISIONAL_STUDY` and denied progression unlock.
5. **Anti-Speed Bot Guard:** Submissions with active elapsed duration $< 45\text{ seconds}$ are automatically rejected and flagged as invalid `PROVISIONAL_STUDY`.
6. **Authoritative Server-Side Grading:** Client-provided scores are discarded; the server grades student choices against `answer_options.is_correct` in PostgreSQL.

---

## 2. State Machine Specification & Invariant Table

| State Transition | Trigger Condition | Authorization Rule | Resulting State |
| :--- | :--- | :--- | :--- |
| `LOCKED` $\rightarrow$ `AVAILABLE` | Prerequisite lesson attains `COMPLETED` or `MASTERED` (or Day 1) | Server evaluates DAG dependencies | `AVAILABLE` |
| `AVAILABLE` $\rightarrow$ `COMPLETED` | Daily lesson attempt scored $\ge 80.0\%$ (active time $\ge 45$s) | Authoritative server grading | `COMPLETED` (Unlocks Day $N+1$) |
| `AVAILABLE` $\rightarrow$ `AVAILABLE` | Daily lesson attempt scored $< 80.0\%$ | 15-minute cool-down applied | `AVAILABLE` (`quarantine_until = NOW() + 15m`) |
| `AVAILABLE` $\rightarrow$ `AVAILABLE` | Attempt submitted while quarantine is active | Quarantine guard active | `AVAILABLE` (`PROVISIONAL_STUDY`) |
| `COMPLETED` $\rightarrow$ `MASTERED` | Day +1 Spaced Retrieval drill ($I_1$) scored $\ge 80.0\%$ | Spaced Retrieval clearance | `MASTERED` (Golden Crown Badge) |
| `COMPLETED` $\rightarrow$ `COMPLETED` | Day +1 Spaced Retrieval drill scored $< 80.0\%$ | Preserve-Max retention | `COMPLETED` (No regression) |
| `MASTERED` $\rightarrow$ `REVIEW_REQUIRED` | Memory stability retrievability $R < 0.70$ | Spaced Repetition engine | `REVIEW_REQUIRED` (Amber Clock Badge) |
| `REVIEW_REQUIRED` $\rightarrow$ `MASTERED` | Spaced Review session cleared with $\ge 80.0\%$ | Spaced Retrieval clearance | `MASTERED` (Restored) |
| `LOCKED` $\rightarrow$ `COMPLETED` | Direct jump attempt | **ILLEGAL INVARIANT** | **BLOCKED (HTTP 409 Conflict)** |
| `LOCKED` $\rightarrow$ `MASTERED` | Direct jump attempt | **ILLEGAL INVARIANT** | **BLOCKED (HTTP 409 Conflict)** |
| `AVAILABLE` $\rightarrow$ `MASTERED` | Direct jump without $I_1$ retrieval | **ILLEGAL INVARIANT** | **BLOCKED (HTTP 409 Conflict)** |
| `COMPLETED` $\rightarrow$ `LOCKED` | Replay or regression attempt | **ILLEGAL INVARIANT** | **BLOCKED (Preserve-Max)** |
| `MASTERED` $\rightarrow$ `COMPLETED` | Replay or regression attempt | **ILLEGAL INVARIANT** | **BLOCKED (Preserve-Max)** |

---

## 3. Subsystem Architecture

```text
POST /api/v1/learning/lessons/:lessonId/submit
                  │
                  ▼
       [Authentication Middleware]
                  │
                  ▼
       [Request Validation (Zod)]
                  │
                  ▼
        [LearningService]
        ├── [GradingEngine.gradeQuiz()]
        │     └── SELECT ao.is_correct FROM answer_options ao ...
        │     └── Server computes accurate score percentage
        │
        └── [ProgressionEngine.processLessonAttempt()]
              ├── Check elapsed_active_seconds >= 45s (Anti-Speed Bot Guard)
              ├── Check quarantine_until > NOW() (15-min Quarantine Guard)
              ├── If state == LOCKED: Throw ConflictError (Invariant Guard)
              ├── If score >= 80%:
              │     ├── UPDATE user_progress SET state = 'COMPLETED', completed_at = NOW()
              │     └── unlockSubsequentLessons() -> Day N+1 transitions to AVAILABLE
              └── If score < 80%:
                    └── UPDATE user_progress SET quarantine_until = NOW() + 15m
```

---

## 4. Test & Verification Matrix

Automated verification suite: `backend/tests/progression.test.ts` (12 automated integration tests covering all state machine branches).

| Test Category | Target Vector | Expected Behavior | Result |
| :--- | :--- | :--- | :--- |
| **Day 1 Access** | New learner progression map | Day 1 is `AVAILABLE`, Day 2 is `LOCKED` | **PASS** |
| **Day 1 Detail** | Fetching Day 1 lesson detail | 200 OK with lesson payload & quiz questions | **PASS** |
| **Gated Lesson** | Fetching Day 2 lesson detail while LOCKED | 403 Forbidden ("This lesson is locked") | **PASS** |
| **Anti-Speed Guard** | Attempt with active time $< 45$ seconds | Flagged `provisional_study: true`, 0 unlock | **PASS** |
| **Failure Quarantine** | Attempt scored $< 80\%$ | Remains `AVAILABLE`, sets 15m quarantine | **PASS** |
| **Sub-15m Retry** | Immediate resubmission within 15m | Flagged `provisional_study: true`, 0 unlock | **PASS** |
| **Sequential Unlock** | Attempt scored $\ge 80\%$ | Day 1 transitions to `COMPLETED`, Day 2 unlocks to `AVAILABLE` | **PASS** |
| **Day N+1 Access** | Fetching Day 2 after unlock | 200 OK with lesson payload | **PASS** |
| **Failed Mastery** | Day +1 retrieval $< 80\%$ | Lesson remains `COMPLETED` (preserve-max, no regression) | **PASS** |
| **Mastery Promotion**| Day +1 retrieval $\ge 80\%$ | Lesson elevates to `MASTERED` with `mastered_at` timestamp | **PASS** |
| **Direct Jump Invariant**| Attempting `AVAILABLE` $\rightarrow$ `MASTERED` directly | 409 Conflict ("Must reach COMPLETED first") | **PASS** |
| **Replay Invariant** | Replaying `MASTERED` lesson with 0 score | State remains `MASTERED` (never regresses) | **PASS** |

---

## 5. Security & Invariant Audit

```text
Exploit: Client spoofing 100% score in payload
Defense: Score field in client request is ignored. Server computes score directly from answer options.
Status: BLOCKED

Exploit: Student brute-force guessing options repeatedly
Defense: Server enforces 15-minute cool-down after any failure (< 80%). Sub-15m attempts are flagged as PROVISIONAL_STUDY.
Status: BLOCKED

Exploit: Script/bot instant submission (< 45s)
Defense: Submissions with elapsed_active_seconds < 45 are flagged as invalid PROVISIONAL_STUDY.
Status: BLOCKED

Exploit: Skipping to Day 50 by directly calling /submit
Defense: ProgressionEngine asserts lesson is not in LOCKED state; throws 409 Conflict.
Status: BLOCKED

Exploit: Direct promotion to MASTERED
Defense: promoteToMastered rejects any lesson that has not achieved COMPLETED.
Status: BLOCKED

Exploit: Overwriting MASTERED node with a failed attempt
Defense: Preserve-max logic strictly retains MASTERED status.
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
Total Test Files: 9
Total Tests: 67 passed (100%)
Code Coverage: 83.11% lines (src/learning: 90.14%, src/middlewares: 96.29%)
Status: PASS
```

---

## 7. Checkpoint Gate Status

```text
==========================================
PHASE A.4 STATUS: PASS
NEXT PHASE (A.5 - Spaced Repetition System & Review Debt): UNLOCKED
==========================================
```
