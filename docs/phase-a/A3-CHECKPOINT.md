# Phase A.3 Checkpoint: Authentication & Authorization
## SIDCOM / Karsa Communication Learning Platform

**Checkpoint Date:** September 22, 2026  
**Auditor / Engineer:** Lead Software Architect & Security Engineer  
**Document Status:** Approved Engineering Checkpoint  
**Target Milestone:** Phase A.3 Completion & Phase A.4 Gate Authorization  

---

## 1. Executive Summary

Phase A.3 delivers the security perimeter and identity infrastructure for the SIDCOM / Karsa platform. In strict compliance with `PHASE-C2-FINAL-AUDIT.md`, `PRD.md`, and `PRODUCT-RULES.md`, client code is strictly classified as untrusted. Authentication boundaries ensure that no user identity, account ownership, or cross-tenant resource access can be falsified or manipulated.

Key architectural deliverables:
1. **Cryptographic Identity Management:** Passwords hashed with `bcryptjs` with salt rounds = 12. Constant-time comparisons and generic authentication failure responses eliminate timing attacks and user account enumeration vectors.
2. **Dual-Token Ephemeral Architecture:**
   - **Access Token:** Short-lived (15 minutes), digitally signed with HMAC-SHA256 (`JWT_ACCESS_SECRET`), containing standard claims (`sub` = `userId`, `email`, `iat`, `exp`). Stateless verification via Express middleware.
   - **Refresh Token:** Cryptographically secure 256-bit random tokens (`crypto.randomBytes(32).toString('hex')`), hashed using SHA-256 before storage in PostgreSQL (`refresh_tokens` table). Stored on client exclusively via `HttpOnly`, `Secure` (in production), `SameSite=Strict` cookies restricted to `/api/v1/auth`.
3. **Automatic Refresh Token Rotation & Replay Attack Defense:** Every token refresh operation invalidates the presenting refresh token and issues a new pair. If a revoked or previously consumed token is replayed (indicating credential compromise or token theft), the entire family of tokens associated with that lineage is immediately revoked, expelling the attacker.
4. **Anti-IDOR Authorization Boundary:** `authorizeUser(paramName)` middleware guarantees that authenticated users cannot access, read, or mutate another learner's private state, curriculum progress, or XP records.
5. **Brute-Force Rate Limiting:** Sliding-window rate limiting on `/api/v1/auth/register` and `/api/v1/auth/login` (5 requests / 60 seconds per IP), with standard `RateLimit-*` RFC headers and HTTP 429 response upon exhaustion.

---

## 2. Security Perimeter Architecture

```text
Untrusted Client (Browser / Mobile)
     │
     │ 1. POST /api/v1/auth/login { email, password }
     ▼
[Rate Limiter (5 req/min)] ──(Exceeded?)──► HTTP 429 RATE_LIMIT_EXCEEDED
     │
[Centralized Validation] ──(Malformed?)──► HTTP 400 VALIDATION_ERROR
     │
[AuthService.login()]
     ├── Query users WHERE email = $1
     ├── bcryptjs.compare(password, hash) ──(Invalid?)──► HTTP 401 AUTHENTICATION_REQUIRED
     ├── generateAccessToken(userId, email) [15m JWT]
     └── generateRefreshToken() [32-byte hex]
          ├── SHA-256 Hash ──► INSERT INTO refresh_tokens
          └── Set-Cookie: refreshToken=...; HttpOnly; SameSite=Strict; Path=/api/v1/auth
     ▼
HTTP 200 OK { user, accessToken, expiresIn: 900 }
```

### Refresh Token Rotation with Replay Revocation

```text
Client presents Refresh Token T1
     │
     ▼
SHA-256 Hash Lookup in refresh_tokens
     ├── If revoked_at IS NOT NULL (TOKEN REUSE DETECTED!):
     │    ├── REVOKE ALL tokens for user (family revocation)
     │    └── Return HTTP 401 AUTHENTICATION_REQUIRED (Token reuse detected)
     ├── If expires_at < NOW():
     │    └── Return HTTP 401 AUTHENTICATION_REQUIRED (Token expired)
     └── If Valid:
          ├── Mark T1: revoked_at = NOW(), replaced_by_token_id = T2.id
          ├── Insert T2 (new hash, new expiry)
          └── Return new accessToken + new refreshToken T2 cookie
```

---

## 3. Database Schema: Refresh Tokens

Created via migration `002_auth_refresh_tokens.sql`:

```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    replaced_by_token_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
```

---

## 4. Test & Verification Matrix

Automated verification suite: `backend/tests/auth.test.ts` (16 automated tests covering all required attack scenarios).

| Test Category | Target Vector | Expected Behavior | Result |
| :--- | :--- | :--- | :--- |
| **Registration** | Valid registration | Returns 201 Created, sets HttpOnly cookie, returns clean user object | **PASS** |
| **Registration** | Duplicate email | Rejects with 409 Conflict without leaking internal state | **PASS** |
| **Registration** | Short password (<8 chars) | Rejects with 400 Validation Error | **PASS** |
| **Registration** | Malformed email | Rejects with 400 Validation Error | **PASS** |
| **Login** | Valid credentials | Returns 200 OK, accessToken, sets HttpOnly cookie | **PASS** |
| **Login** | Wrong password | Rejects with 401 Authentication Required | **PASS** |
| **Login** | Non-existent user | Rejects with identical 401 message (anti-enumeration) | **PASS** |
| **Middleware** | Valid Bearer JWT | Resolves user identity on `req.user`, allows protected access | **PASS** |
| **Middleware** | Missing Authorization | Rejects with 401 Authentication Required | **PASS** |
| **Middleware** | Tampered JWT signature | Cryptographic signature failure $\rightarrow$ 401 | **PASS** |
| **Middleware** | Expired JWT | Token expired $\rightarrow$ 401 Authentication Required | **PASS** |
| **Token Rotation**| Valid refresh | Rotates refresh token, issues new access token | **PASS** |
| **Replay Defense**| Replaying old refresh token | Replay detected $\rightarrow$ immediate family revocation | **PASS** |
| **Logout** | Logout endpoint | Revokes stored refresh token, clears client cookie | **PASS** |
| **Authorization** | User A accessing User A data | Access granted (200 OK) | **PASS** |
| **Authorization** | User A accessing User B data | Anti-IDOR boundary triggers $\rightarrow$ HTTP 403 Forbidden | **PASS** |
| **Rate Limiting** | Rapid brute-force (>5 req/min)| Rate limit triggered $\rightarrow$ HTTP 429 RateLimit Exceeded | **PASS** |

---

## 5. Security & Red Team Assessment

| Exploit Scenario | Red Team Vector | Defensive Mechanism | Status |
| :--- | :--- | :--- | :--- |
| **Credential stuffing** | Rapid brute-force login attempts | In-memory sliding window rate limiter (max 5/min) | **BLOCKED** |
| **User enumeration** | Comparing error messages for known vs unknown emails | Generic "Invalid email or password" error for both | **MITIGATED** |
| **Password leak** | Inspecting user profile responses | `password_hash` excluded from all API responses | **BLOCKED** |
| **Token theft replay** | Attacker intercepts and replays spent refresh token | Single-use rotation + whole family revocation | **BLOCKED** |
| **JWT tampering** | Altering `userId` inside token body | Cryptographic HMAC-SHA256 signature verification | **BLOCKED** |
| **IDOR horizontal escalation** | User A modifies URL param to `users/userB/data` | `authorizeUser('userId')` middleware blocks access | **BLOCKED** |
| **XSS token theft** | JavaScript reads `document.cookie` | `HttpOnly` flag prevents JS access to refresh token | **MITIGATED** |

---

## 6. Quality Guardian Scan Results

```text
Scanner: npm audit
Vulnerabilities Found: 0
Status: PASS

TypeScript Compilation: tsc --noEmit / build
Status: PASS (0 errors)

Unit & Integration Tests:
Total Test Files: 8
Total Tests: 55 passed (100%)
Code Coverage: 80.38% lines (src/auth: 91.02%, src/middlewares: 96.34%)
Status: PASS
```

---

## 7. Checkpoint Gate Status

```text
==========================================
PHASE A.3 STATUS: PASS
NEXT PHASE (A.4 - Learning Domain & Progression): UNLOCKED
==========================================
```
