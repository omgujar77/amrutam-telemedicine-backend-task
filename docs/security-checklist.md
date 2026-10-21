# Amrutam Telemedicine Backend — Security & Compliance Checklist

This document serves as an exhaustive audit and evaluation checklist covering security mechanisms, defensive controls, and operational readiness across the **Amrutam Telemedicine Backend**.

---

## 1. Security Verification Matrix

| Category | Security Control / Requirement | Implementation Details | Status | Verification Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication** | Password Hashing | Argon2id memory-hard hashing with salt generation (memory cost: 64MB, time cost: 3). | **Implemented & Verified** | `src/modules/auth/auth.service.js`, tested in `auth.test.js`. |
| **Authentication** | Short-Lived Access Tokens | JWT signed with HMAC-SHA256, 15-minute expiration, contains minimal identity claims. | **Implemented & Verified** | `token.service.js`, verified in token expiration tests. |
| **Authentication** | Secure Refresh Cookies | Refresh tokens delivered via `HttpOnly`, `SameSite=Lax`, `Path=/api/v1/auth/refresh`. | **Implemented & Verified** | `auth.controller.js`, cookie flags inspected and tested. |
| **Authentication** | Cryptographic Key Separation | Access token, refresh token, and MFA secrets must use 3 distinct >=32 character keys. | **Implemented & Verified** | Zod super-refinement in `src/config/env.js`, tested in `env.test.js`. |
| **Multi-Factor Auth** | RFC 6238 TOTP Standard | Standard time-based one-time password generation and verification using Otplib. | **Implemented & Verified** | `mfa.service.js`, tested in `mfa.test.js`. |
| **Multi-Factor Auth** | At-Rest Secret Encryption | TOTP secrets stored as AES-256-GCM authenticated ciphertexts (`iv:tag:data`). | **Implemented & Verified** | `encryption.js`, verified tag tampering unit tests. |
| **Multi-Factor Auth** | Privileged Admin Gatekeeper | Routes under `/api/v1/admin/*` require `mfaVerified === true` in JWT claim. | **Implemented & Verified** | `requireMfa` middleware, tested in `admin.test.js`. |
| **Authorization** | Role-Based Access Control | Declarative role enforcement (`authorize('ADMIN')`, `authorize('DOCTOR')`). | **Implemented & Verified** | `auth.middleware.js`, tested across all role test suites. |
| **Authorization** | IDOR Ownership Checks | Patients can access only their consultations; doctors can start only assigned sessions. | **Implemented & Verified** | Verified in `tests/unit/security.test.js` (IDOR checks). |
| **Data Validation** | Strict Input Sanitization | All query, body, and path parameters parsed and validated via Zod schemas (`.strict()`). | **Implemented & Verified** | Validation middleware in `src/common/middleware/validate.js`. |
| **Error Handling** | Sanitized Error Responses | Centralized error handler masks SQL details, stack traces, and internal Prisma codes. | **Implemented & Verified** | `src/common/errors/errorHandler.js`, tested in `app.test.js`. |
| **Rate Limiting** | Authentication Brute-Force | `authRateLimiter` restricts login attempts to 20/15min via Redis-backed store. | **Implemented & Verified** | Dedicated RedisStore in `rateLimiter.js`. |
| **Rate Limiting** | MFA Spraying Protection | `mfaRateLimiter` limits verification attempts to 5/15min with isolated prefix `rl:mfa:`. | **Implemented & Verified** | Verified in rate limiter unit configuration. |
| **Data Protection** | Structured Log Redaction | Passwords, tokens, MFA secrets, authorization headers, and cookies redacted by Pino. | **Implemented & Verified** | `redactPaths` verified in `tests/unit/security.test.js`. |
| **Concurrency** | Double-Booking Prevention | PostgreSQL atomic conditional update (`UPDATE ... WHERE status = 'AVAILABLE'`). | **Implemented & Verified** | Real concurrent tests in `tests/integration/concurrency.test.js`. |
| **Idempotency** | Replay & Duplicate Prevention | Persistent `IdempotencyRecord` scoped by `[userId, operation, idempotencyKey]`. | **Implemented & Verified** | Tested in `tests/unit/idempotency.test.js`. |
| **Observability** | Bounded Prometheus Metrics | Dynamic URL parameters normalized to static route templates (`/doctors/:id`). | **Implemented & Verified** | Tested in `tests/unit/observability.test.js`. |
| **Observability** | W3C Distributed Tracing | Injects `traceparent` and `X-Trace-Id` headers with non-blocking OTLP support. | **Implemented & Verified** | Tested in `tests/unit/observability.test.js`. |
| **Audit Trails** | Immutable Event Logging | Critical lifecycle mutations write to `audit_logs` inside the same database transaction. | **Implemented & Verified** | Tested in `consultations.test.js` & `prescriptions.test.js`. |
| **Container Security** | Non-Root Container Execution | Runner container executes under unprivileged `node` user in `Dockerfile`. | **Implemented & Verified** | `USER node` verified in `Dockerfile`. |
| **CI / Scanning** | Dependency Security Scanning | GitHub Actions workflow executes `npm audit --audit-level=high` on pull requests. | **Implemented & Verified** | Configured in `.github/workflows/ci.yml`. |
| **Payments** | Payment Gateway Webhooks | Payment model exists in schema; webhook signature verification for external gateway. | **Partially Implemented** | Schema model defined; live payment gateway stubbed for prototype. |
| **Network Security**| TLS / HTTPS Termination | Production HTTPS enforcement with HSTS header. | **Implemented (Config)** | `COOKIE_SECURE` configuration flag and Helmet middleware active. |
| **Disaster Recovery**| Automated Cold Backup | Automated daily pg_dump snapshotting with offsite replication. | **Documented (Planned)** | Documented in `docs/backup-and-disaster-recovery.md`. |

---

## 2. Production Hardening Checklist for Deployment

Before promoting this backend to a live clinical production environment, complete the following operational steps:

- [ ] **DNS & TLS**: Provision a valid TLS certificate (Let's Encrypt / AWS ACM) and configure reverse proxy (Nginx / Cloudflare) to terminate HTTPS.
- [ ] **Environment Flag**: Set `NODE_ENV=production` and `COOKIE_SECURE=true` in cloud environment variables.
- [ ] **Cryptographic Keys**: Generate unique 64-character hex strings for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `MFA_ENCRYPTION_KEY` using `crypto.randomBytes(32).toString('hex')`.
- [ ] **Database Connection Pooling**: Ensure `DATABASE_URL` connects through Supabase PgBouncer (port 6543) and `DIRECT_URL` points to session pool (port 5432).
- [ ] **Grafana Admin Security**: Change default `admin` credentials via `GF_SECURITY_ADMIN_PASSWORD` in `.env`.
- [ ] **Internal Network Isolation**: Ensure `/metrics` and Prometheus are accessible only over internal virtual private clouds (VPC).
