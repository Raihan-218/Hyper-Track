# Application Security Audit (AppSec & Threat Model)

**Document:** `PROJECT_ANALYSIS/SECURITY_AUDIT.md`  
**Target:** Hyper Track Backend & Mobile Application  
**Classification:** DEFENSIVE TECHNICAL SECURITY REVIEW  
**Auditor:** Principal Security Engineer & Cloud Security Architect  

> [!CAUTION]
> **REDACTION NOTICE:** In compliance with professional security standards and project audit rules, actual secret tokens, database passwords, and connection strings are strictly redacted in this document.

---

## 1. Vulnerability Summary Matrix

| Finding ID | Severity | Category | Status | Affected Component |
| :--- | :---: | :--- | :---: | :--- |
| **SEC-01** | **CRITICAL** | Sensitive Data Exposure / Hardcoded Credentials | **VERIFIED** | `apps/api/.env`, `apps/api/.env.example` |
| **SEC-02** | **HIGH** | Denial of Service / Improper Rate Limiting | **VERIFIED** | `apps/api/src/server.ts:17`, `auth.routes.ts:67` |
| **SEC-03** | **HIGH** | Error Handling & Information Leakage | **VERIFIED** | `apps/api/src/middleware/errors.ts:22-25` |
| **SEC-04** | **HIGH** | Local Storage Multi-Account Isolation Vulnerability | **VERIFIED** | `apps/mobile/src/lib/api.ts:88-97`, `localStore.native.ts` |
| **SEC-05** | **MEDIUM** | Missing Token Invalidation (Stateless Revocation Gap) | **VERIFIED** | `apps/api/src/routes/auth.routes.ts:105-110` |
| **SEC-06** | **MEDIUM** | Insecure Volatile Memory Storage on Web Platform | **VERIFIED** | `apps/mobile/src/lib/auth.ts:6-31` |
| **SEC-07** | **MEDIUM** | Missing Global Rate Limiting on Mutation Endpoints | **VERIFIED** | `apps/api/src/server.ts:17` |
| **SEC-08** | **LOW** | Permissive Default CORS Origins | **VERIFIED** | `apps/api/.env`, `apps/api/src/config/env.ts:10` |
| **SEC-09** | **LOW** | In-Memory Regular Expression Denial of Service (ReDoS) | **POTENTIAL** | `apps/api/src/routes/tasks.routes.ts:51` |
| **SEC-10** | **INFORMATIONAL** | Third-Party Transitive Dependency Vulnerabilities | **VERIFIED** | `package-lock.json` (`glob`, `minimatch`, `uuid`) |

---

## 2. Detailed Vulnerability Analyses

### SEC-01: Hardcoded Production Database Credentials & JWT Secret in Committed Files
- **Severity:** **CRITICAL**
- **CWE:** CWE-798 (Use of Hard-coded Credentials), CWE-312 (Cleartext Storage of Sensitive Information)
- **1. What the problem is:**  
  The repository contains live, plain-text connection strings to a hosted MongoDB Atlas database cluster and a production-grade 43-character `JWT_SECRET`. Both `.env` and `.env.example` inside `apps/api/` contain identical live production credentials.
- **2. Where it exists:**  
  - `apps/api/.env:3-4`
  - `apps/api/.env.example:3-4`
  - Reference: `MONGODB_URI=mongodb+srv://[USERNAME]:[PASSWORD]@hypertrack.lpmwky1.mongodb.net/`
  - Reference: `JWT_SECRET=[REDACTED_43_CHAR_SECRET]`
- **3. Why it matters:**  
  Anyone with access to the source code repository (including read-only contributors, CI runners, or repository forks) has immediate, unauthenticated administrative access to the primary database and can arbitrarily mint valid user tokens.
- **4. How it could be exploited:**  
  1. An attacker connects directly to the MongoDB Atlas cluster using standard client tooling (`mongosh`) and dumps all user records, password hashes, and personal tracking data.
  2. The attacker uses the leaked `JWT_SECRET` with `jsonwebtoken` to sign an arbitrary token:
     `jwt.sign({}, JWT_SECRET, { subject: "507f1f77bcf86cd799439011" })`
     This allows complete impersonation of any user without knowing their password.
- **5. How it should be fixed:**  
  1. **Immediate Revocation:** Log in to MongoDB Atlas, delete or rotate the database user credentials immediately, and re-restrict IP access lists to trusted application servers.
  2. **Secret Rotation:** Generate a new cryptographically random 64-byte hex string for `JWT_SECRET`.
  3. **Scrub Git History:** Use `git-filter-repo` or BFG Repo-Cleaner to completely remove the commits containing `.env` and live credentials.
  4. **Sanitize Examples:** Replace `apps/api/.env.example` with dummy placeholders:
     ```bash
     MONGODB_URI=mongodb://127.0.0.1:27017/hyper-track
     JWT_SECRET=replace_with_a_secure_random_string_at_least_32_chars
     ```
  5. Ensure `.gitignore` explicitly prevents `.env` and `.env.*` files from being committed.

---

### SEC-02: Denial of Service via Global Auth Rate Limiting on `/api/auth/me`
- **Severity:** **HIGH**
- **CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling), CWE-400 (Uncontrolled Resource Consumption)
- **1. What the problem is:**  
  In `apps/api/src/server.ts:17`, an aggressive rate limiter of **30 requests per 15 minutes** is mounted globally on the `/api/auth` path prefix. However, `authRouter` mounts the user profile endpoint `/api/auth/me` (`apps/api/src/routes/auth.routes.ts:67, 80`).
- **2. Where it exists:**  
  - `apps/api/src/server.ts:17`:
    ```ts
    app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));
    ```
  - `apps/api/src/routes/auth.routes.ts:67`:
    ```ts
    authRouter.get("/me", requireAuth, async (req: AuthRequest, res, next) => { ... });
    ```
- **3. Why it matters:**  
  The mobile application invokes `GET /api/auth/me` on initial startup, resume from background, and profile updates. Because rate limiting uses IP addresses and no reverse-proxy header trust (`trust proxy`) is configured:
  - Any user opening or navigating the app 30 times in 15 minutes gets blocked with HTTP 429.
  - In a corporate, university, or shared Wi-Fi environment (NAT), all users sharing the public IP address will exhaust the limit collectively.
- **4. How it could be exploited:**  
  An attacker or even standard organic user behavior easily triggers Denial of Service against legitimate mobile users.
- **5. How it should be fixed:**  
  Isolate rate limiting specifically to credential validation endpoints (`/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`), and exempt authenticated endpoints like `/me` from IP-based brute-force limits:
  ```ts
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 });
  authRouter.post("/login", authLimiter, ...);
  authRouter.post("/register", authLimiter, ...);
  ```

---

### SEC-03: Global MongoDB Error 11000 Information Leak & State Obfuscation
- **Severity:** **HIGH**
- **CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information), CWE-392 (Missing Report of Error Condition)
- **1. What the problem is:**  
  The global error middleware unconditionally maps *all* MongoDB duplicate key errors (code `11000`) to an email conflict error message.
- **2. Where it exists:**  
  - `apps/api/src/middleware/errors.ts:22-25`:
    ```ts
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    ```
- **3. Why it matters:**  
  When an internal database unique key collision occurs on non-user models (such as `HabitCompletion` when re-checking a habit, or `XPTransaction` on concurrent rewards), the client receives a misleading 409 error claiming an account with the email already exists.
- **4. How it could be exploited:**  
  1. An attacker can probe whether a habit completion or mutation ID exists.
  2. More critically, legitimate users experience application failure and misleading feedback when completing habits twice in a single day after an undo.
- **5. How it should be fixed:**  
  Check the specific index key pattern from the MongoDB driver error before constructing the HTTP 409 response.

---

### SEC-04: Local Storage Multi-Account Isolation Vulnerability
- **Severity:** **HIGH**
- **CWE:** CWE-284 (Improper Access Control), CWE-311 (Missing Encryption of Sensitive Data)
- **1. What the problem is:**  
  The mobile client stores user-scoped SQLite records and API caches partitioned by `userId`. However, to obtain the `userId`, the client decodes the JWT access token client-side via `atob(token.split(".")[1])` without verifying the token signature.
- **2. Where it exists:**  
  - `apps/mobile/src/lib/api.ts:90-96`:
    ```ts
    function tokenUserId(token: string): string | null {
      try {
        const encoded = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
        if (!encoded || typeof globalThis.atob !== "function") return null;
        const payload = JSON.parse(globalThis.atob(encoded)) as { sub?: unknown };
        return typeof payload.sub === "string" ? payload.sub : null;
      } catch { return null; }
    }
    ```
- **3. Why it matters:**  
  On shared mobile devices or when multiple family members share a device, data from previous user sessions is retained in the local SQLite database (`clearOfflineApiData` preserves SQLite records on logout to prevent discarding pending mutations).
- **4. How it could be exploited:**  
  If User A logs out and User B logs in, if token handling is manipulated or if unverified tokens are parsed, one user could view cached tasks or offline habits belonging to another user.
- **5. How it should be fixed:**  
  Ensure local SQLite databases are encrypted at rest using SQLCipher (supported in `expo-sqlite`), and enforce explicit user data clearing or password confirmation upon account switching.

---

### SEC-05: Missing Token Invalidation (Stateless Revocation Gap)
- **Severity:** **MEDIUM**
- **CWE:** CWE-613 (Insufficient Session Expiration)
- **1. What the problem is:**  
  Access tokens are stateless JWTs signed with `JWT_SECRET`. When a user logs out (`POST /api/auth/logout`), the API deletes the session rows in MongoDB (`Session.deleteMany`), but does not maintain a blocklist or JTI check for the access token.
- **2. Where it exists:**  
  - `apps/api/src/routes/auth.routes.ts:105-110`
  - `apps/api/src/middleware/auth.ts:8-26`
- **3. Why it matters:**  
  If an access token is stolen (e.g. from network logs or device compromise), it remains 100% valid until its natural expiry (`1d` in `.env`), even if the user explicitly clicked "Log out".
- **4. How it should be fixed:**  
  1. Reduce default `JWT_EXPIRES_IN` to 15 minutes.
  2. Include a unique JWT identifier (`jti`) or validate `tokenVersion` / `Session` status in `requireAuth` if immediate revocation is required.

---

### SEC-06: Insecure Volatile Memory Storage on Web Platform
- **Severity:** **MEDIUM**
- **CWE:** CWE-522 (Insufficiently Protected Credentials)
- **1. What the problem is:**  
  In `apps/mobile/src/lib/auth.ts`, for web platform builds (`Platform.OS === "web"`), tokens are held only in JavaScript variables:
  ```ts
  let webToken: string | null = null;
  let webRefreshToken: string | null = null;
  ```
- **2. Why it matters:**  
  While storing in memory mitigates XSS-based localStorage theft, it breaks the application on web: every page refresh destroys the session and forces a re-login. If developers attempt to fix this by blindly moving tokens to `localStorage`, they expose tokens to XSS.
- **3. How it should be fixed:**  
  For web deployments, use `httpOnly`, `Secure`, `SameSite=Strict` session cookies for refresh tokens.

---

### SEC-07: Missing Global Rate Limiting on Mutation Endpoints
- **Severity:** **MEDIUM**
- **CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling)
- **1. What the problem is:**  
  Only `/api/auth` is protected by `express-rate-limit`. Core data endpoints (`/api/tasks`, `/api/habits`, `/api/projects`, `/api/goals`, `/api/export`) have **no rate limiting**.
- **2. Where it exists:**  
  - `apps/api/src/server.ts:12-24`
- **3. Why it matters:**  
  An authenticated malicious actor can flood `/api/tasks` or `/api/export` with thousands of automated requests, causing heavy CPU and MongoDB connection pool exhaustion.
- **4. How it should be fixed:**  
  Add a global rate limiter to `server.ts` (e.g., 300 requests per minute per IP/user).

---

### SEC-08: Permissive Default CORS Origins
- **Severity:** **LOW**
- **CWE:** CWE-942 (Permissive Cross-Domain Policy)
- **1. What the problem is:**  
  In `apps/api/.env`, `CORS_ORIGIN` is configured to `http://localhost:8081`. While acceptable for development, `apps/api/src/config/env.ts` does not enforce strict origin checking or prevent wildcard domains in production mode.
- **2. Where it exists:**  
  - `apps/api/src/server.ts:15`:
    ```ts
    app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((value) => value.trim()), credentials: false }));
    ```
- **3. How it should be fixed:**  
  Enforce that in production (`NODE_ENV === "production"`), `CORS_ORIGIN` cannot contain `localhost` or HTTP addresses.

---

### SEC-09: Potential ReDoS Risk on Task Search Filtering
- **Severity:** **LOW**
- **CWE:** CWE-1333 (Inefficient Regular Expression Complexity)
- **1. What the problem is:**  
  In `apps/api/src/routes/tasks.routes.ts:51`, user input from query parameter `req.query.q` is converted directly into a MongoDB `$regex` filter:
  ```ts
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    filter.title = { $regex: req.query.q.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  }
  ```
- **2. Why it matters:**  
  Although the string is escaped and truncated to 80 characters, unindexed `$regex` searches with leading wildcards force a full collection scan across the user's tasks.
- **3. How it should be fixed:**  
  Use MongoDB text indexes (`$text: { $search: q }`) instead of unindexed `$regex`.

---

### SEC-10: Third-Party Transitive Dependency Vulnerabilities
- **Severity:** **INFORMATIONAL**
- **1. What the problem is:**  
  `npm audit` reports 10 moderate-severity vulnerabilities in transitive dependencies:
  - `glob` / `minimatch`: GHSA-3g3m-2fjr-6pw4 (AbortSignal bypass) and GHSA-g3hv-75wg-m249 (ReDoS).
  - `uuid`: GHSA-w5hq-g745-h8pq (Missing buffer bounds check via `@expo/ngrok`).
- **2. How it should be fixed:**  
  Keep Expo and development tooling updated. Since these vulnerabilities affect CLI build tools (`@expo/ngrok`, `@expo/cli`), they do not directly expose the runtime production server.

