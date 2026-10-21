# Amrutam Telemedicine Backend

[![Node.js](https://img.shields.io/badge/Node.js-v22-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-v5-blue.svg)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-v6-1B222D.svg)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v16-336791.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-v7-DC382D.svg)](https://redis.io/)
[![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-6E9F18.svg)](https://vitest.dev/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED.svg)](https://www.docker.com/)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0.3-6BA539.svg)](http://localhost:5000/api-docs)

Production-oriented backend foundation and relational data layer for **Amrutam Telemedicine**, an Ayurvedic healthcare platform supporting patient consultations, doctor availability management, electronic prescriptions, transactional booking with idempotency, role-based access control, and payment lifecycle tracking.

---

## Table of Contents

- [1. Technical Documentation & Architecture Deliverables](#1-technical-documentation--architecture-deliverables)
- [2. System Architecture & High-Level Design](#2-system-architecture--high-level-design)
- [3. Technology Stack](#3-technology-stack)
- [4. Quick Start & Setup Guide](#4-quick-start--setup-guide)
- [5. Core Business Workflows & APIs](#5-core-business-workflows--apis)
  - [5.1 Health & Diagnostics](#51-health--diagnostics)
  - [5.2 Authentication & User Lifecycle](#52-authentication--user-lifecycle)
  - [5.3 Doctor Availability & Search](#53-doctor-availability--search)
  - [5.4 Transactional Booking & Idempotency](#54-transactional-booking--idempotency)
  - [5.5 Consultation Lifecycle State Machine](#55-consultation-lifecycle-state-machine)
  - [5.6 Electronic Prescriptions & Clinical Records](#56-electronic-prescriptions--clinical-records)
  - [5.7 Admin Operations & Privacy-Preserving Analytics](#57-admin-operations--privacy-preserving-analytics)
- [6. Security & Threat Mitigation](#6-security--threat-mitigation)
- [7. Database Schema & Relational Data Models](#7-database-schema--relational-data-models)
- [8. Automated Testing Suite](#8-automated-testing-suite)
- [9. Infrastructure, Docker & Observability](#9-infrastructure-docker--observability)
- [10. Development Seed Credentials](#10-development-seed-credentials)
- [11. npm Scripts Reference](#11-npm-scripts-reference)
- [12. Comprehensive Troubleshooting Guide](#12-comprehensive-troubleshooting-guide)
- [13. Security, Privacy & Data Safety Rules](#13-security-privacy--data-safety-rules)

---

## 1. Technical Documentation & Architecture Deliverables

Every technical specification, architectural decision, security audit, and disaster recovery runbook is documented under [`docs/`](docs/):

| Document | File Path | Scope & Key Contents |
| :--- | :--- | :--- |
| **System Architecture** | [`docs/architecture.md`](docs/architecture.md) | Full 2–4 page architecture document, domain modules, Mermaid system diagrams, data flows, and scaling boundaries. |
| **Entity Relationship Diagram** | [`docs/er-diagram.md`](docs/er-diagram.md) | Comprehensive 11-entity relational schema, primary/foreign keys, unique constraints, and B-tree indexes. |
| **Booking Sequence Diagram** | [`docs/booking-sequence.md`](docs/booking-sequence.md) | Sequence diagram showing atomic slot reservation, idempotency replay, 409 conflict, and rollback branches. |
| **Security Threat Model** | [`docs/threat-model.md`](docs/threat-model.md) | Asset classification, trust boundaries, prioritized STRIDE threat matrix, and residual risk tracking. |
| **Security Checklist** | [`docs/security-checklist.md`](docs/security-checklist.md) | Practical audit review checklist covering IAM, MFA, RBAC, IDOR, encryption, and production readiness. |
| **Disaster Recovery Strategy** | [`docs/backup-and-disaster-recovery.md`](docs/backup-and-disaster-recovery.md) | Proposed RPO/RTO targets, automated backup routines, key rotation playbooks, and step-by-step restore guide. |
| **Reliability & Scaling** | [`docs/reliability-and-scaling.md`](docs/reliability-and-scaling.md) | Safe vs. unsafe retries, Redis caching trade-offs, table partitioning, connection pooling, and horizontal scaling. |
| **Known Limitations** | [`docs/known-limitations.md`](docs/known-limitations.md) | Transparent disclosure of prototype boundaries, verification gaps, and production enhancement roadmap. |
| **OpenAPI 3.0 Specification** | [`docs/openapi.yaml`](docs/openapi.yaml) | Complete OpenAPI 3.0.3 REST specification documenting all 22 platform endpoints. |
| **Credentials & Setup Guide** | [`docs/credentials-guide.md`](docs/credentials-guide.md) | Safe environment configuration and Supabase/PostgreSQL connection string setup guide. |

---

## 2. System Architecture & High-Level Design

The Amrutam Telemedicine Backend is built to satisfy strict healthcare enterprise targets:

- **Target Scale**: Designed for **100,000 daily consultations** with horizontal read scaling and connection pooling.
- **Latency SLOs**: **p95 < 200ms** for cached reads, **p95 < 500ms** for transactional database writes.
- **Target Availability**: **99.95%** uptime with automated health probes, database retry policies, and zero-downtime container deployments.
- **Data Integrity**: Acid transactions with PostgreSQL conditional updates preventing double bookings and race conditions.
- **Defense in Depth**: Zero plaintext storage, Argon2id password hashing, AES-256-GCM encrypted MFA secrets, distributed IP rate limiting, and automated PII/PHI log redaction.

---

## 3. Technology Stack

- **Runtime & Language**: Node.js (v22 LTS) with native ES modules (`"type": "module"`).
- **Web Framework**: Express.js (v5) with Helmet security headers, JSON body parsing, CORS, and request ID tracking.
- **Primary Database**: PostgreSQL (v16) with strict relations, foreign keys, and unique indexes.
- **ORM & Migrations**: Prisma ORM (v6.19 LTS) with Prisma Client, Prisma Migrate, and automated schema generation.
- **Cache & Rate Limiting**: Redis (v7) with `ioredis` for connection pooling, distributed caching, and IP rate limiting.
- **Environment Validation**: Zod schema validation for strict fail-fast configuration loading on application boot.
- **Structured Logging**: Pino with request ID tracing, W3C `traceparent` correlation, and sensitive field redaction.
- **Testing**: Vitest and Supertest for fast unit tests, PostgreSQL integration tests, concurrency tests, and security tests.
- **Containerization**: Multi-stage Dockerfile and Docker Compose orchestration (API, Postgres, Redis, Prometheus, Grafana).
- **API Documentation**: Interactive Swagger UI served at `http://localhost:5000/api-docs`.

---

## 4. Quick Start & Setup Guide

### Step 1: Prerequisites

- **Node.js**: `>= 20.0.0` (Node 22 LTS recommended)
- **npm**: `>= 10.0.0`
- **PostgreSQL**: Local instance or free Cloud Supabase / Neon database (see [`docs/credentials-guide.md`](docs/credentials-guide.md))
- **Redis**: Local daemon or Docker container on port `6379`

### Step 2: Clone & Install Dependencies

```bash
git clone https://github.com/omgujar77/amrutam-telemedicine-backend-task.git
cd amrutam-telemedicine-backend-task
npm install
```

### Step 3: Configure Environment Variables

Create your local `.env` file from the provided template:

```bash
cp .env.example .env
```

Configure your PostgreSQL database connection strings in `.env`:

```env
# Application Settings
NODE_ENV=development
PORT=5000
LOG_LEVEL=info

# Database Connection (Supabase / PostgreSQL)
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require&schema=public"
DIRECT_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require"

# Dedicated Test Database (Isolated for integration tests)
TEST_DATABASE_URL="postgresql://amrutam_user:amrutam_password@localhost:5432/amrutam_test_db?schema=public"

# Redis
REDIS_URL="redis://127.0.0.1:6379"

# Security & Secrets (Minimum 32 characters each)
JWT_ACCESS_SECRET="amrutam_super_secure_access_secret_key_32chars_min"
JWT_REFRESH_SECRET="amrutam_super_secure_refresh_secret_key_32chars_min"
MFA_ENCRYPTION_KEY="amrutam_mfa_encryption_key_32chars_min_length"
```

> **Note on Supabase**: Always use port `5432` if port `6543` times out on your local network/ISP. If your password contains special characters (`@`, `#`, `$`, `%`), encode them in the URL (e.g., `@` becomes `%40`).

### Step 4: Run Database Migrations & Seed Data

```bash
# Push Prisma schema to the database
npx prisma db push

# Seed initial test accounts (Admin, Doctors, Patients, Availability Slots)
npm run db:seed
```

### Step 5: Start the Development Server

```bash
# Start server with nodemon hot-reload
npm run dev
```

You should see:
```text
[INFO] Starting Amrutam Telemedicine Backend server...
[INFO] Redis client connected
[INFO] Redis client ready to receive commands
[INFO] Database connection verified
[INFO] 🚀 Server listening on http://localhost:5000
```

### Step 6: Verify and Explore

- **Readiness Health Check**: [http://localhost:5000/health/ready](http://localhost:5000/health/ready)
- **Interactive Swagger UI**: [http://localhost:5000/api-docs](http://localhost:5000/api-docs)
- **Prometheus Metrics**: [http://localhost:5000/metrics](http://localhost:5000/metrics)

---

## 5. Core Business Workflows & APIs

### 5.1 Health & Diagnostics

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | General service health and process uptime. |
| `GET` | `/health/live` | Public | Lightweight liveness probe for Kubernetes / Docker container health checks. |
| `GET` | `/health/ready` | Public | Deep readiness probe validating active PostgreSQL and Redis socket connectivity. |
| `GET` | `/metrics` | Public | Prometheus-formatted application runtime and HTTP latency histogram metrics. |

---

### 5.2 Authentication & User Lifecycle

| Method | Endpoint | Rate Limit | Access | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | 20 / 15m | Public | Patient registration. Automatically assigns `PATIENT` role; client role injection is strictly blocked. |
| `POST` | `/api/v1/auth/login` | 20 / 15m | Public | Authenticates credentials with Argon2id; returns access token and sets `HttpOnly` refresh cookie. |
| `POST` | `/api/v1/auth/refresh` | 20 / 15m | Public / Cookie | Rotates refresh token, detects reuse, and issues a fresh access token. |
| `POST` | `/api/v1/auth/logout` | None | Authenticated | Revokes current refresh session in database and clears the refresh cookie. |
| `GET` | `/api/v1/users/me` | None | Authenticated | Returns current authenticated user's profile with sensitive password hash excluded. |
| `PATCH` | `/api/v1/users/me` | None | Authenticated | Updates permitted profile fields (`name`). Rejects role or status tampering. |

---

### 5.3 Doctor Availability & Search

| Method | Endpoint | Access / Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/doctors` | Public / Any | Search verified doctors with filters (`specialization`, `search`, `availableDate`, `maxFee`, `page`, `pageSize`). |
| `GET` | `/api/v1/doctors/:doctorId/availability` | Public / Any | List future bookable `AVAILABLE` slots for a specific doctor. |
| `POST` | `/api/v1/doctors/me/availability` | `DOCTOR` | Create an availability slot (UTC timestamps, chronological validation, and overlap checks). |
| `GET` | `/api/v1/doctors/me/availability` | `DOCTOR` | List authenticated doctor's own slots with status and date filtering. |
| `DELETE` | `/api/v1/doctors/me/availability/:slotId` | `DOCTOR` | Delete an unbooked availability slot. |

---

### 5.4 Transactional Booking & Idempotency

| Method | Endpoint | Access / Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/bookings` | `PATIENT` | Atomically reserve slot and create consultation booking. Requires `Idempotency-Key` header. |
| `GET` | `/api/v1/bookings/me` | `PATIENT` | View consultations belonging to the authenticated patient. |
| `POST` | `/api/v1/bookings/:bookingId/cancel` | `PATIENT` / `DOCTOR` | Cancel a scheduled booking and atomically release slot back to `AVAILABLE`. |

#### Double-Booking Prevention Architecture

Two independent, robust layers guarantee that two patients cannot book the same availability slot:
1. **Atomic Conditional Update inside Transaction**:
   Within a `prisma.$transaction`, the slot is atomically updated from `AVAILABLE` to `BOOKED`:
   ```javascript
   const updateResult = await tx.availabilitySlot.updateMany({
     where: { id: slotId, status: 'AVAILABLE' },
     data: { status: 'BOOKED' }
   });
   ```
   If `updateResult.count === 0`, the slot is no longer available; the transaction rolls back immediately and returns `HTTP 409 Conflict (SLOT_UNAVAILABLE)`.
2. **Database-Level Unique Constraint**:
   PostgreSQL enforces an absolute unique constraint on `consultations.slot_id` (`@unique`). Even under high-concurrency race conditions, PostgreSQL rejects duplicate consultation creation on the same slot.

#### Persistent Idempotency Protocol

To prevent accidental duplicate bookings or payments from network retries, `POST /api/v1/bookings` requires an `Idempotency-Key` header:
- **Key Scoping**: Scoped per patient and operation (`booking:create`) via PostgreSQL unique index `@@unique([userId, operation, idempotencyKey])`.
- **Payload Fingerprinting**: A deterministic SHA-256 hash of the request payload (`{ slotId }`) is stored alongside the key.
- **Repeat Requests (Replay)**: Re-sending the request with the identical key and payload returns the original booking with `HTTP 200 OK` and `"isReplay": true`.
- **Key Mismatch Protection**: Sending an existing key with a different slot ID returns `HTTP 409 Conflict (IDEMPOTENCY_KEY_MISMATCH)`.
- **Cross-User Isolation**: Idempotency keys are strictly scoped to the authenticated user ID and cannot access or expose another patient's booking.

---

### 5.5 Consultation Lifecycle State Machine

| Method | Endpoint | Access / Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/consultations/:consultationId/start` | `DOCTOR` (Assigned) | Transition consultation from `SCHEDULED` to `IN_PROGRESS`, records start time & audit event. |
| `POST` | `/api/v1/consultations/:consultationId/complete` | `DOCTOR` (Assigned) | Transition consultation from `IN_PROGRESS` to `COMPLETED`, records completion time, notes & audit. |
| `GET` | `/api/v1/consultations/me` | `PATIENT` / `DOCTOR` | View consultations belonging to the authenticated user with status and pagination. |
| `GET` | `/api/v1/consultations/:consultationId` | Associated Patient / Doctor / Admin | Retrieve full consultation details by ID with strict IDOR ownership checks. |

```text
[ SCHEDULED ] ──(Doctor starts)──► [ IN_PROGRESS ] ──(Doctor completes)──► [ COMPLETED ]
      │
      └──(Cancel booking)────────► [ CANCELLED ]
```

---

### 5.6 Electronic Prescriptions & Clinical Records

| Method | Endpoint | Access / Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/consultations/:consultationId/prescriptions` | `DOCTOR` (Assigned) | Issue prescription (permitted only during `IN_PROGRESS` or `COMPLETED`). |
| `GET` | `/api/v1/consultations/:consultationId/prescriptions` | Associated Patient / Doctor / Admin | List all prescriptions for a specific consultation. |
| `GET` | `/api/v1/prescriptions/:prescriptionId` | Associated Patient / Doctor / Admin | Retrieve a specific prescription by ID. |
| `GET` | `/api/v1/prescriptions/me` | `PATIENT` / `DOCTOR` | Paginated list of prescriptions belonging to the authenticated user. |

---

### 5.7 Admin Operations & Privacy-Preserving Analytics

| Method | Endpoint | Access / Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/analytics/overview` | `ADMIN` + `MFA` | High-level platform health metrics (user counts, consultation totals, windowed trends). |
| `GET` | `/api/v1/admin/audit-logs` | `ADMIN` + `MFA` | Paginated system audit trails capturing operational and security mutations. |
| `POST` | `/api/v1/admin/doctors/:doctorId/verify` | `ADMIN` + `MFA` | Verify or reject a doctor's credentials and practice license. |

---

## 6. Security & Threat Mitigation

- **Password Hashing (Argon2id)**: Native Argon2id (`memoryCost: 64MB`, `timeCost: 3 iterations`, `parallelism: 1`) with high entropy requirements (uppercase, lowercase, number, special symbol).
- **Short-Lived JWT Access Tokens**: Signed with HMAC-SHA256 (`HS256`) using `JWT_ACCESS_SECRET`. Lifetime: 15 minutes (`JWT_ACCESS_EXPIRATION`).
- **Refresh Session Rotation & Reuse Detection**: Refresh tokens are 64-character cryptographically secure tokens stored as SHA-256 hashes. Upon refresh, the old token is revoked. If a revoked token is reused, all active sessions for that user are immediately terminated.
- **Multi-Factor Authentication (TOTP MFA)**: RFC 6238 TOTP using HMAC-SHA1 and 30-second intervals for privileged roles (`ADMIN`, `DOCTOR`). Secrets at rest are encrypted with authenticated **AES-256-GCM** using `MFA_ENCRYPTION_KEY`.
- **Sensitive Field Redaction**: Structured Pino logger automatically redacts passwords, tokens, cookies, secrets, and raw clinical details.
- **Strict Role-Based Access Control (RBAC)**: Role verification via `authorize('PATIENT')`, `authorize('DOCTOR')`, `authorize('ADMIN')`. Role injection during registration is strictly blocked.

---

## 7. Database Schema & Relational Data Models

The relational database architecture is defined in [`prisma/schema.prisma`](prisma/schema.prisma).

```text
       ┌───────────┐         1:1         ┌────────────────┐
       │   User    ├─────────────────────┤ PatientProfile │
       │ (Auth/ID) │                     └────────────────┘
       └─────┬─────┘         1:1         ┌────────────────┐
             ├───────────────────────────┤ DoctorProfile  │
             │                           └───────┬────────┘
             │                                   │ 1:N
             │                                   ▼
             │                         ┌───────────────────┐
             │                         │ AvailabilitySlot  │
             │                         └─────────┬─────────┘
             │                                   │ 1:1
             ▼                                   ▼
       ┌──────────────┐         1:N      ┌───────────────────┐
       │ Consultation ├──────────────────┤   Prescription    │
       └─────┬────────┘                  └───────────────────┘
             │ 1:1
             ▼
       ┌──────────────┐
       │   Payment    │
       └──────────────┘
```

### Implemented Entities (11 Total)

1. **User**: Authentication identity, unique email, Argon2id password hash, role (`PATIENT`, `DOCTOR`, `ADMIN`), and status (`ACTIVE`, `INACTIVE`, `SUSPENDED`).
2. **PatientProfile**: 1-to-1 extension of `User` with demographic details (phone, emergency contact, blood group, allergies).
3. **DoctorProfile**: 1-to-1 extension of `User` with qualifications, specialization, consultation fee, and verification status (`PENDING`, `VERIFIED`, `REJECTED`).
4. **AvailabilitySlot**: Consultation time slots with start time, end time, and status (`AVAILABLE`, `RESERVED`, `BOOKED`, `CANCELLED`). Enforces `(doctorId, startTime, endTime)` unique index and `CHECK (end_time > start_time)`.
5. **Consultation**: Central consultation entity connecting patient, doctor, and slot with lifecycle states (`SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`).
6. **Prescription**: Electronic prescription containing structured medicines JSON (`[{ name, dosage, frequency, duration }]`), dosage instructions, and lifestyle advice.
7. **Payment**: 1-to-1 monetary record with amount as `Decimal(10,2)` (avoiding floating-point inaccuracies), currency (`INR`), and status (`PENDING`, `COMPLETED`, `FAILED`, `REFUNDED`).
8. **AuditLog**: Immutable system audit trail capturing actor actions, entity type, entity ID, client IP address, and sanitized metadata.
9. **RefreshSession**: Cryptographically hashed refresh token storage supporting multi-device session revocation.
10. **IdempotencyRecord**: Scoped idempotency token storage ensuring sensitive booking and transaction creation requests can be safely retried.
11. **MfaEnrollment**: TOTP shared secret storage encrypted with authenticated AES-256-GCM.

---

## 8. Automated Testing Suite

The backend includes a comprehensive, multi-tiered automated test suite built on **Vitest**, **Supertest**, and **Prisma Client**.

```bash
# 1. Run all fast unit tests (no database required)
npm run test:unit

# 2. Run PostgreSQL integration & concurrency tests (requires test database)
npm run test:integration

# 3. Run the full test suite
npm test
```

### Test Suite Architecture

| Test Category | File / Directory | Description | Dependencies |
| :--- | :--- | :--- | :--- |
| **Unit & Business Rules** | `tests/unit/businessRules.test.js` | Fast, deterministic business logic, state transition matrix, token security, and validation tests. | In-memory mocks (no DB needed) |
| **Transaction & Rollback** | `tests/unit/rollback.test.js` | Verifies atomic rollback of slots, bookings, and idempotency records upon failures. | In-memory transaction callback spy |
| **Idempotency & Replay** | `tests/unit/idempotency.test.js` | Validates request fingerprinting, duplicate replays, 409 mismatch conflicts, and user isolation. | Mocked database |
| **Security & IDOR** | `tests/unit/security.test.js` | Enforces resource ownership boundaries, non-assigned doctor rejections, and log redaction. | Express app + Vitest |
| **PostgreSQL Integration** | `tests/integration/` | Live database-backed tests for schemas, constraints, consultation lifecycle, and Redis health. | Isolated PostgreSQL / Redis |
| **Booking Concurrency** | `tests/integration/concurrency.test.js` | Real concurrent requests (`Promise.all`) testing PostgreSQL atomic updates and double-booking prevention. | Isolated PostgreSQL |

---

## 9. Infrastructure, Docker & Observability

The platform is orchestrated into five containerized services connected via an internal bridge network:

```bash
# Build and start all services in the background
docker-compose up -d --build

# View container logs
docker-compose logs -f api

# Stop all services
docker-compose down
```

### Containerized Services Architecture

| Service | Container Name | Image | Port | Description |
| :--- | :--- | :--- | :--- | :--- |
| **API** | `amrutam-backend-api` | Built via `Dockerfile` (Node 22-alpine) | `5000:5000` | Express REST API server with non-root security context. |
| **PostgreSQL** | `amrutam-postgres` | `postgres:16-alpine` | `5432:5432` | Primary relational database with healthcheck. |
| **Redis** | `amrutam-redis` | `redis:7-alpine` | `6379:6379` | In-memory cache and rate-limiting store. |
| **Prometheus** | `amrutam-prometheus` | `prom/prometheus:v2.54.1` | `9090:9090` | Time-series scraper collecting metrics from `api:5000/metrics`. |
| **Grafana** | `amrutam-grafana` | `grafana/grafana:11.1.0` | `3000:3000` | Pre-provisioned metrics dashboard and visualization. |

### Monitoring & Dashboards

- **Grafana URL**: `http://localhost:3000` (Default credentials: `admin` / `admin`)
- **Pre-provisioned Dashboard**: **"Amrutam Telemedicine Backend Overview"**
  - Application Uptime
  - In-Flight Concurrent Requests
  - Process Memory (Heap Used)
  - HTTP Request Rate (QPS)
  - Error Rates (4xx / 5xx)
  - Latency Histograms (p50, p95, p99)

---

## 10. Development Seed Credentials

The idempotent seed script (`prisma/seed.js`) provisions deterministic test accounts for local development:

| Role | Email | Password | Profile Description |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin.dev@amrutam.local` | `DevPassword123!` | System Administrator with full analytics and verification access. |
| **Doctor** | `dr.ayush.sharma@amrutam.local` | `DevPassword123!` | BAMS, MD (Ayurveda Panchakarma) - 2 active availability slots seeded. |
| **Patient** | `patient.sample@amrutam.local` | `DevPassword123!` | Sample Patient (O+ blood group, allergies recorded). |

> **Security Note**: These passwords are encrypted with Argon2id and are strictly intended for local development and non-production testing. Never reuse development credentials in production.

---

## 11. npm Scripts Reference

| Command | Action |
| :--- | :--- |
| `npm run dev` | Start development server with `nodemon` hot-reloading |
| `npm start` | Start server in production mode |
| `npm test` | Run complete test suite via Vitest |
| `npm run test:unit` | Run fast unit tests (no external services needed) |
| `npm run test:integration` | Run integration tests (requires PostgreSQL & Redis) |
| `npm run db:validate` | Validate `prisma/schema.prisma` syntax |
| `npm run db:generate` | Generate Prisma Client from schema |
| `npm run db:migrate` | Create and apply development migration |
| `npm run db:deploy` | Apply all pending migrations to the target database |
| `npm run db:seed` | Seed idempotent development records |
| `npm run db:studio` | Launch Prisma Studio GUI for database inspection |

---

## 12. Comprehensive Troubleshooting Guide

| Issue / Symptom | Root Cause | Practical Resolution |
| :--- | :--- | :--- |
| **`Can't reach database server at aws-0-ap-northeast-1.pooler.supabase.com:6543`** | Outgoing port `6543` blocked by ISP / Wi-Fi firewall, or free Supabase project is paused. | 1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and click **"Restore / Resume"** if paused.<br/>2. Change port in `DATABASE_URL` from `:6543` to `:5432` (standard port 5432 is never blocked by firewalls).<br/>3. Ensure password special characters are URL-encoded (`@` ➔ `%40`, `#` ➔ `%23`). |
| **Server fails to start: `ZodError: Invalid environment variables`** | Missing or malformed environment variables in `.env`. | Verify that `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `MFA_ENCRYPTION_KEY` are all at least 32 characters long and distinct from each other. |
| **`Redis client offline / Connection refused`** | Local Redis daemon is not running on port 6379. | Start Redis via `docker-compose up -d redis` or install local Redis service. The backend will continue to start and operate in degraded fallback mode. |
| **`Error: listen EADDRINUSE: address already in use :::5000`** | Another process is already bound to port 5000. | Terminate the occupying process or set `PORT=5001` in your `.env` file. |
| **`HTTP 409: SLOT_UNAVAILABLE`** | The requested availability slot has already been booked. | The slot was reserved concurrently. Refresh available slots via `GET /api/v1/doctors/:id/availability`. |
| **`HTTP 409: IDEMPOTENCY_KEY_MISMATCH`** | Reused `Idempotency-Key` with a different request payload (`slotId`). | Generate a fresh UUID for new bookings, or keep the payload identical when retrying. |
| **`HTTP 401: UNAUTHORIZED / Token expired`** | The short-lived JWT access token (15m) has expired. | Call `POST /api/v1/auth/refresh` with the HttpOnly refresh cookie to obtain a fresh access token. |
| **`HTTP 403: MFA verification required`** | Accessing `/api/v1/admin/*` routes without completing TOTP challenge. | Call `POST /api/v1/auth/mfa/verify` with your TOTP code to obtain an MFA-verified access token. |

---

## 13. Security, Privacy & Data Safety Rules

1. **Zero Real Credentials in Git**: Never commit `.env` or production credentials. Keep `.gitignore` updated with `.env`, `.env.*`, and `!.env.example`.
2. **Dedicated Test Database**: Never run automated integration tests against your primary development or cloud Supabase database. Always configure `TEST_DATABASE_URL` pointing to an isolated test database.
3. **Never Reset Production**: Never execute `npx prisma migrate reset` or `prisma db push --force-reset` on a database with active clinical records. Always use `npx prisma migrate deploy` for forward-only migrations.
4. **Log Privacy**: Never remove or bypass `redactPaths` in `src/common/logger/logger.js`. Avoid logging raw medical notes or prescription bodies.