# Phase A.6 Checkpoint: LearningCommand Offline Sync & Idempotency Engine
## SIDCOM / Karsa Communication Learning Platform

**Checkpoint Date:** September 22, 2026  
**Auditor / Engineer:** Lead Software Architect, Distributed Systems & Security Engineer  
**Document Status:** Approved Engineering Checkpoint  
**Target Milestone:** Phase A.6 Completion & Phase A.7 Gate Authorization  

---

## 1. Executive Summary

Phase A.6 implements the offline synchronization and command idempotency engine for the SIDCOM / Karsa platform in strict accordance with `PHASE-C2-FINAL-AUDIT.md` §3, `LEARNING-SYSTEM.md` §11, and `PRODUCT-RULES.md` §11.

Clients (Web PWA and Android Room) operate under an untrusted boundary model with intermittent connectivity. Offline mutations are enqueued as deterministic `LearningCommand` envelopes and synchronized through the canonical authoritative endpoint:

```http
POST /api/v1/learning/sync
```

Key architectural deliverables:
1. **Canonical `LearningCommand` Envelope (`backend/src/sync/types.ts`):**
   - Strictly validates `command_id` (UUIDv7/UUID), `installation_id`, `client_seq` (integer $\ge 1$), `command_type`, `payload`, and `client_timestamp`.
   - Command ID serves strictly as a client-generated idempotency key, NOT an authentication token.
2. **Authoritative Idempotency Ledger (`processed_commands`):**
   - Replay protection: duplicates are detected against `(user_id, command_id)` and return cached `CommandReceipt` with status `DUPLICATE` without re-executing business logic.
3. **Monotonic Sequence Ordering & Out-of-Order Healing:**
   - Batches are deterministically sorted by `client_seq ASC` prior to execution, preventing out-of-order race conditions from asynchronous network delivery.
4. **Partial Batch Failure Tolerance:**
   - An invalid command in a batch is marked `REJECTED` with a descriptive `error_message` while valid sibling commands in the batch are executed and marked `ACCEPTED`.
5. **Anti-Guessing Quarantine Stamping:**
   - Retries submitted within the 15-minute cool-down window are stamped as `QUARANTINED` with `provisional_study = true`, guaranteeing server-authoritative progression protection while acknowledging offline learning activity.
6. **Stress Testing Resilience:**
   - Tested and verified under 1, 10, and 100-command synchronous batch bursts with zero deadlocks and 100% duplicate immunity.

---

## 2. Command Envelope Architecture & Data Flow

```text
Client Device (Web PWA / Android Room)
  │ (Offline Actions: Quiz Attempt, Review Card, Reflection)
  ▼
[Offline Command Queue (IndexedDB / SQLite)]
  │
  │ Online Reconnect: POST /api/v1/learning/sync
  ▼
API Gateway / Authentication Middleware (JWT Bearer Token Validation)
  │
  ▼
Sync Engine (SyncService)
  ├── 1. Validate Command Envelopes (UUID, payload structure)
  ├── 2. Sort batch by client_seq ASC (monotonic processing)
  └── 3. For each command:
          │
          ├── Check `processed_commands` (user_id, command_id)
          │    └── IF EXISTS ──► Return cached receipt (Status: DUPLICATE)
          │
          └── IF NEW ──► Dispatch to Authoritative Domain:
               ├── SUBMIT_LESSON_ATTEMPT ──► LearningService.submitLessonAttempt()
               │                              ├── Sub-15m retry? ──► Status: QUARANTINED
               │                              └── Score >= 80%?  ──► Status: ACCEPTED (COMPLETED)
               │
               ├── SUBMIT_REVIEW_CARD    ──► SrsService.processReviewSubmission()
               │                              └── Status: ACCEPTED
               │
               └── SUBMIT_REFLECTION     ──► Acknowledge Reflection
                                              └── Status: ACCEPTED
          │
          └── Record execution receipt in `processed_commands`
  │
  ▼
HTTP 200 OK Response
{
  "synced_count": N,
  "accepted_count": A,
  "duplicate_count": D,
  "quarantined_count": Q,
  "rejected_count": R,
  "receipts": [ { command_id, client_seq, status, result_payload, processed_at } ]
}
```

---

## 3. Automated Verification Matrix

| Test Category | Test Case | Assertions | Status |
| :--- | :--- | :--- | :--- |
| **Single Sync** | `SUBMIT_LESSON_ATTEMPT` | Validates envelope, executes authoritative grading, records receipt | **PASS** |
| **Idempotency** | Duplicate Replay Defense | Duplicate command returns cached receipt, increments duplicate_count | **PASS** |
| **Ordering** | Monotonic Sequence Ordering | Reordered payloads `[seq 3, seq 2]` are executed deterministically `[seq 2, seq 3]` | **PASS** |
| **Partial Failure** | Fault Tolerance | Valid command `ACCEPTED`, invalid command `REJECTED`, batch succeeds | **PASS** |
| **Quarantine** | Sub-15m Retry Cool-down | Flags sub-15m retry as `QUARANTINED`, `provisional_study = true` | **PASS** |
| **Security: Auth** | Missing Token (401) | Unauthenticated sync requests are rejected with 401 Unauthorized | **PASS** |
| **Security: Validation** | Non-UUID command_id (400) | Malformed command IDs rejected with 400 Validation Error | **PASS** |
| **Security: IDOR** | Cross-User Isolation | User A cannot query or replay User B commands or mutate their progress | **PASS** |
| **Stress: 10 Batch** | 10 Synchronous Commands | Sequential submission across 10 commands executed reliably | **PASS** |
| **Stress: 100 Batch** | 100 Commands + Replay | 100 commands processed synchronously; second pass returns 100 DUPLICATEs | **PASS** |

**Regression Suite Result:**
- **Test Files:** 11 passed (11)
- **Total Tests:** 91 passed (91)
- **Time:** ~63s
- **Failures:** 0

---

## 4. Quality Guardian & Security Audit

| Tool | Target / Command | Result | Findings |
| :--- | :--- | :--- | :--- |
| **npm audit** | `npm.cmd audit` | **PASS** | `found 0 vulnerabilities` |
| **TypeScript Compiler** | `tsc --noEmit` | **PASS** | 0 compilation errors across entire backend |
| **Auth Boundary** | Token & User Isolation | **PASS** | User ID extracted strictly from server JWT claims |
| **Client Spoofing** | Scores & Timestamps | **PASS** | Client scores and client timestamps are strictly ignored for authoritative progression |

---

## 5. Architectural Compliance Verification

- [x] **Command Envelope Schema (`LEARNING-SYSTEM.md` §11):** Includes `command_id`, `installation_id`, `client_seq`, `command_type`, `payload`, `client_timestamp`.
- [x] **Monotonic Failure Quarantine (`PHASE-C2-FINAL-AUDIT.md`):** Sub-15 minute retries recorded as `PROVISIONAL_STUDY` / `QUARANTINED`.
- [x] **Summative Answer Security:** Client cannot send authoritative scores; backend grades authoritatively against server DB answers.
- [x] **Idempotency Guarantee:** DB unique constraint on `(user_id, command_id)` in `processed_commands` prevents double-spending and repeated XP/state mutations.

---

## 6. Phase A.6 Checkpoint Verdict

```text
=====================================================
PHASE A.6 STATUS: PASS
ALL TESTS: 91 / 91 PASSING (100%)
QUALITY GUARDIAN: PASS (0 VULNERABILITIES)
PHASE A.7 GATE: OPEN (UNLOCKED)
=====================================================
```
