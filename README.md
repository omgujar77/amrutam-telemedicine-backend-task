# Amrutam Telemedicine Backend

[![Node.js](https://img.shields.io/badge/Node.js-v22-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-v5-blue.svg)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-v6-1B222D.svg)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v16-336791.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-v7-DC382D.svg)](https://redis.io/)
[![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-6E9F18.svg)](https://vitest.dev/)

Production-oriented backend foundation and relational data layer for **Amrutam Telemedicine**, an Ayurvedic healthcare platform supporting patient consultations, doctor availability management, electronic prescriptions, and payment lifecycle tracking.

---

## 1. Technology Stack

- **Runtime & Language**: Node.js (v22+) with native ES modules (`"type": "module"`).
- **Web Framework**: Express.js with Helmet security headers, JSON body parsing, and route isolation.
- **Primary Database**: PostgreSQL (v16).
- **ORM & Migrations**: Prisma ORM (v6.19 LTS) with Prisma Migrate and schema generation.
- **Cache & Infrastructure**: Redis (v7) for future asynchronous queues and distributed caching.
- **Environment Validation**: Zod schema validation for strict fail-fast configuration loading.
- **Structured Logging**: Pino with request ID tracing, sensitive header/payload redaction, and `pino-pretty` development transport.
- **Testing**: Vitest and Supertest for unit, API, and database integration tests.
- **Containerization**: Multi-stage Dockerfile and Docker Compose orchestration.

---

## 2. Complete Architecture & Documentation Directory

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
| **OpenAPI Specification** | [`docs/openapi.yaml`](docs/openapi.yaml) | Complete OpenAPI 3.0.3 REST specification documenting all 22 platform endpoints. |
| **Credentials & Setup Guide** | [`docs/credentials-guide.md`](docs/credentials-guide.md) | Safe environment configuration and Supabase/PostgreSQL connection string setup guide. |

---

## 3. Project Directory Structure

```text
amrutam-telemedicine-backend/
├── src/
│   ├── app.js                         # Configured Express application export
│   ├── server.js                      # HTTP listener & graceful shutdown handlers
│   ├── config/
│   │   ├── env.js                     # Zod-validated runtime environment variables
│   │   ├── database.js                # Singleton Prisma client & health check
│   │   └── redis.js                   # Singleton Redis client & health check
│   ├── common/
│   │   ├── errors/
│   │   │   ├── AppError.js            # Standard operational application error
│   │   │   └── errorHandler.js        # Centralized error middleware with safe redaction
│   │   ├── middleware/
│   │   │   ├── requestId.js           # Cryptographic Request ID generator/propagator
│   │   │   └── notFound.js            # Standard 404 JSON responder
│   │   ├── logger/
│   │   │   └── logger.js              # Structured Pino logger with field redaction
│   │   └── utils/                     # Shared utilities
│   ├── modules/
│   │   └── health/
│   │       └── healthRoutes.js        # /health/live and /health/ready endpoints
│   ├── jobs/                          # BullMQ worker scaffolding (Phase 6+)
│   └── observability/                 # Metrics & APM scaffolding
├── prisma/
│   ├── schema.prisma                  # PostgreSQL domain models and relations
│   ├── migrations/
│   │   ├── migration_lock.toml        # Prisma migration lock
│   │   └── 20261020000000_init/
│   │       └── migration.sql          # Initial DDL migration with CHECK constraint
│   └── seed.js                        # Idempotent development seed data
├── tests/
│   ├── unit/
│   │   ├── app.test.js                # Health probes, request ID, 404 & error tests
│   │   └── env.test.js                # Zod environment validation tests
│   ├── integration/
│   │   ├── database.test.js           # Prisma model & DB constraint integration tests
│   │   └── redis.test.js              # Live Redis ping & operations test
│   ├── security/
│   └── e2e/
├── docs/
│   ├── er-diagram.md                  # Mermaid Entity Relationship Diagram
│   └── credentials-guide.md           # Step-by-step database setup & cloud credentials
├── .env.example                       # Documented environment variable template
├── .gitignore
├── .dockerignore
├── Dockerfile                         # Production multi-stage Dockerfile
├── docker-compose.yml                 # PostgreSQL, Redis & API service definition
├── package.json
└── README.md
```

---

## 3. Quick Start & Setup

### Prerequisites
- Node.js >= 20.0.0 (Node 22 LTS recommended)
- npm >= 10.0.0
- Docker Desktop OR a free Cloud PostgreSQL instance (see [docs/credentials-guide.md](file:///c:/Users/ASUS/OneDrive/Desktop/amrutam-telemedicine-backend/docs/credentials-guide.md))
- Redis (already running locally on port 6379, or via Docker Compose)

### Step 1: Clone & Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default local values:
```env
NODE_ENV=development
PORT=5000
LOG_LEVEL=info
DATABASE_URL="postgresql://amrutam_user:amrutam_password@localhost:5432/amrutam_db?schema=public"
TEST_DATABASE_URL="postgresql://amrutam_user:amrutam_password@localhost:5432/amrutam_test_db?schema=public"
REDIS_URL="redis://127.0.0.1:6379"
```
*(If you need a free cloud database instead of local Docker, follow [docs/credentials-guide.md](file:///c:/Users/ASUS/OneDrive/Desktop/amrutam-telemedicine-backend/docs/credentials-guide.md) to obtain a Neon/Supabase connection string in 2 minutes).*

### Step 3: Run Database Migrations & Seed
```bash
# Validate Prisma schema
npm run db:validate

# Generate Prisma Client
npm run db:generate

# Deploy migrations to the database
npm run db:deploy

# Seed idempotent development accounts & slots
npm run db:seed
```

### Step 4: Run Automated Tests
```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration
```

### Step 5: Start the Server
```bash
# Development mode with hot-reloading (nodemon)
npm run dev

# Production startup
npm start
```
The server will boot on `http://localhost:5000`.

---

## 4. API Endpoints

### 4.1 Health & Probes
| Endpoint | Method | Access | Purpose |
|---|---|---|---|
| `/health/live` | `GET` | Public | Liveness probe verifying Express process health. |
| `/health/ready` | `GET` | Public | Readiness probe checking PostgreSQL and Redis connectivity. |

### 4.2 Authentication Endpoints (`/api/v1/auth`)
| Endpoint | Method | Rate Limit | Access | Purpose |
|---|---|---|---|---|
| `/api/v1/auth/register` | `POST` | 20 / 15m | Public | Patient registration. Automatically assigns `PATIENT` role; client-supplied roles are rejected. |
| `/api/v1/auth/login` | `POST` | 20 / 15m | Public | Authenticates credentials with Argon2id; returns access token and sets `HttpOnly` refresh cookie. |
| `/api/v1/auth/refresh` | `POST` | 20 / 15m | Public / Cookie | Rotates refresh token, detects reuse, and issues a new access token. |
| `/api/v1/auth/logout` | `POST` | None | Public / Cookie | Revokes current refresh session in database and clears cookie. |

### 4.3 User & Profile Endpoints (`/api/v1/users`)
| Endpoint | Method | Access | Purpose |
|---|---|---|---|
| `/api/v1/users/me` | `GET` | Authenticated (Any) | Returns current authenticated user's profile without `passwordHash`. |
| `/api/v1/users/me` | `PATCH` | Authenticated (Any) | Updates permitted fields (`name`). Rejects role, status, or email tampering. |
| `/api/v1/users/me/patient-profile` | `GET` | `PATIENT` | Returns patient demographic profile. |
| `/api/v1/users/me/patient-profile` | `PATCH` | `PATIENT` | Updates patient demographic fields. |
| `/api/v1/users/me/doctor-profile` | `GET` | `DOCTOR` | Returns doctor qualifications, specialization, and consultation fee. |
| `/api/v1/users/me/doctor-profile` | `PATCH` | `DOCTOR` | Updates doctor profile fields. Rejects self-approval of `verificationStatus`. |

---

## 5. Security & Authentication Architecture

### 5.1 Password Hashing (Argon2id)
- Passwords are encrypted using native **Argon2id** (`memoryCost: 64MB`, `timeCost: 3 iterations`, `parallelism: 1`).
- Passwords must meet complexity requirements: >= 8 characters, with lowercase, uppercase, digit, and special character.
- Plaintext passwords and `passwordHash` are never logged, returned in API responses, or stored in JWT claims.

### 5.2 Short-Lived JWT Access Tokens
- Signed with HMAC-SHA256 (`HS256`) using `JWT_ACCESS_SECRET`.
- Validated on every protected request via the `authenticate` middleware.
- Claims: `sub` (User UUID), `email`, `role`, `iss`, `aud`, `iat`, `exp`.
- Lifetime: 15 minutes (`JWT_ACCESS_EXPIRATION`).

### 5.3 Refresh Session Rotation & Reuse Detection
- Refresh tokens are 64-character cryptographically secure random tokens stored hashed (`SHA-256`) in the `RefreshSession` table.
- **Rotation**: On every `/refresh` request, the previous session is marked `revokedAt = now()` and a new token is issued.
- **Reuse Detection**: If a client attempts to refresh using an already-revoked token (indicating a stolen token), all active sessions for that user are immediately revoked, forcing re-authentication.

### 5.4 Role-Based Access Control (RBAC)
- Role verification via `authorize('PATIENT')`, `authorize('DOCTOR')`, `authorize('ADMIN')`.
- Unauthorized roles receive `HTTP 403 Forbidden`.
- Client role injection during registration or profile updates is strictly blocked via Zod schemas.

### 5.5 Distributed Rate Limiting
- Protected by `express-rate-limit` with Redis storage (`rate-limit-redis`).
- Limits authentication attempts to 20 requests per 15-minute window per IP.
- Returns standard `HTTP 429 Too Many Requests` with consistent JSON error schema.

---

## 5. Phase 4: Doctor Availability & Booking API

Phase 4 implements doctor availability management, doctor search, transactional booking with double-booking prevention, persistent idempotency, and concurrent booking safety.

### 5.1 Endpoints Summary

| Method | Endpoint | Access / Role | Description |
|---|---|---|---|
| `GET` | `/api/v1/doctors` | Public / Authenticated | Search doctors with filters (`specialization`, `search`, `page`, `pageSize`) |
| `GET` | `/api/v1/doctors/:doctorId/availability` | Public / Authenticated | List currently bookable, future slots for a doctor |
| `POST` | `/api/v1/doctors/me/availability` | `DOCTOR` | Create an availability slot (UTC timestamps, overlap & duplicate checked) |
| `GET` | `/api/v1/doctors/me/availability` | `DOCTOR` | List authenticated doctor's own slots (with status/date filters) |
| `DELETE` | `/api/v1/doctors/me/availability/:slotId` | `DOCTOR` | Delete an unbooked availability slot |
| `GET` | `/api/v1/doctors/me/bookings` | `DOCTOR` | View consultations assigned to the authenticated doctor |
| `POST` | `/api/v1/bookings` | `PATIENT` | Atomically reserve slot and create booking (Requires `Idempotency-Key` header) |
| `GET` | `/api/v1/bookings/me` | `PATIENT` | View consultations belonging to the authenticated patient |
| `POST` | `/api/v1/bookings/:bookingId/cancel` | `PATIENT` or `DOCTOR` | Cancel a scheduled booking and release slot back to `AVAILABLE` |

---

### 5.2 Double-Booking Prevention Architecture

Two independent, robust layers guarantee that two patients cannot book the same availability slot:

1. **Atomic Conditional Update inside Transaction**:
   Within a `prisma.$transaction`, the slot is atomically updated from `AVAILABLE` to `BOOKED`:
   ```javascript
   const updateResult = await tx.availabilitySlot.updateMany({
     where: { id: slotId, status: 'AVAILABLE' },
     data: { status: 'BOOKED' }
   });
   ```
   If `updateResult.count === 0`, the slot is no longer available; the transaction rolls back immediately and returns `HTTP 409 SLOT_UNAVAILABLE`.
2. **Database-Level Unique Constraint**:
   PostgreSQL enforces an absolute unique constraint on `consultations.slot_id` (`@unique`). Even under high-concurrency race conditions, PostgreSQL rejects duplicate consultation creation on the same slot with a unique constraint violation (`P2002`).

---

### 5.3 Persistent Idempotency Protocol

To prevent accidental duplicate payments or bookings from network retries, `POST /api/v1/bookings` requires an `Idempotency-Key` header:

- **Key Scoping**: Scoped per patient and operation (`booking:create`) via PostgreSQL unique index `@@unique([userId, operation, idempotencyKey])`.
- **Payload Fingerprinting**: A deterministic SHA-256 hash of the request payload (`{ slotId }`) is stored alongside the key.
- **Repeat Requests (Replay)**: Re-sending the request with the identical key and payload returns the original booking with `HTTP 200 OK` and `"isReplay": true`.
- **Key Mismatch Protection**: Sending an existing key with a different slot ID returns `HTTP 409 IDEMPOTENCY_KEY_MISMATCH`.
- **Cross-User Isolation**: Idempotency keys are scoped strictly to the authenticated user ID and cannot access or expose another patient's booking.

---

### 5.4 API Usage Examples (cURL)

#### 1. Doctor Publishes Availability Slot
```bash
curl -X POST http://localhost:5000/api/v1/doctors/me/availability \
  -H "Authorization: Bearer <DOCTOR_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": "2026-11-10T09:00:00.000Z",
    "endTime": "2026-11-10T09:30:00.000Z"
  }'
```

#### 2. Search Available Doctors
```bash
curl -X GET "http://localhost:5000/api/v1/doctors?specialization=Ayurveda&page=1&pageSize=10"
```

#### 3. View Doctor's Available Slots
```bash
curl -X GET "http://localhost:5000/api/v1/doctors/<DOCTOR_ID>/availability"
```

#### 4. Patient Books an Available Slot
```bash
curl -X POST http://localhost:5000/api/v1/bookings \
  -H "Authorization: Bearer <PATIENT_ACCESS_TOKEN>" \
  -H "Idempotency-Key: e82496b8-2a81-49b0-9db4-a63d91cf9584" \
  -H "Content-Type: application/json" \
  -d '{
    "slotId": "<SLOT_ID>"
  }'
```

#### 5. Patient Views Their Bookings
```bash
curl -X GET http://localhost:5000/api/v1/bookings/me \
  -H "Authorization: Bearer <PATIENT_ACCESS_TOKEN>"
```

---

### 5.5 Known Prototype Limitations

- **Overlap Check**: Availability slot overlap checking is performed programmatically and via database query range checks. Complete database-level exclusion constraint (`EXCLUDE USING gist`) across timestamp ranges is not included in this prototype.
- **Timezone Handling**: All timestamps are required and stored in ISO 8601 UTC. Regional timezone conversions and daylight saving adjustments are deferred to client presentation.
- **No Advanced Workflows**: Phase 4 strictly limits scope to booking and availability; consultation lifecycle completion, prescriptions, and payments remain deferred to subsequent phases.

---

## 6. Phase 5: Consultations & Prescription Lifecycle

Phase 5 implements the clinical consultation state machine, doctor-only consultation management, electronic prescription issuance, patient/doctor consultation reads, and transaction-backed persistent audit logging.

### 6.1 Endpoints Summary

| Method | Endpoint | Access / Role | Description |
|---|---|---|---|
| `POST` | `/api/v1/consultations/:consultationId/start` | `DOCTOR` (Assigned) | Start consultation (`SCHEDULED` → `IN_PROGRESS`), records start time & audit event |
| `POST` | `/api/v1/consultations/:consultationId/complete` | `DOCTOR` (Assigned) | Complete consultation (`IN_PROGRESS` → `COMPLETED`), records completion time, notes & audit |
| `GET` | `/api/v1/consultations/me` | `PATIENT` / `DOCTOR` | View consultations belonging to the authenticated user with status and pagination |
| `GET` | `/api/v1/consultations/:consultationId` | Associated Patient / Assigned Doctor / Admin | Retrieve full consultation details by ID |
| `POST` | `/api/v1/consultations/:consultationId/prescriptions` | `DOCTOR` (Assigned) | Create electronic prescription (permitted only during `IN_PROGRESS` or `COMPLETED`) |
| `GET` | `/api/v1/consultations/:consultationId/prescriptions` | Associated Patient / Assigned Doctor / Admin | List all prescriptions for a consultation |
| `GET` | `/api/v1/prescriptions/:prescriptionId` | Associated Patient / Assigned Doctor / Admin | Retrieve a specific prescription by ID |

---

### 6.2 Consultation Lifecycle & State Machine

Strict server-side validation and database transactions enforce the consultation lifecycle:

```
[ SCHEDULED ] ──(Doctor starts)──► [ IN_PROGRESS ] ──(Doctor completes)──► [ COMPLETED ]
      │
      └──(Cancel booking)────────► [ CANCELLED ]
```

#### Enforced Transition Rules:
1. **Assigned Doctor Only**: Only the doctor assigned to the consultation can invoke `/start` or `/complete`. Unrelated doctors and patients receive `HTTP 403 Forbidden`.
2. **Sequential Progression**:
   - `SCHEDULED` → `IN_PROGRESS`: Permitted.
   - `IN_PROGRESS` → `COMPLETED`: Permitted.
   - Starting an already started (`IN_PROGRESS`), completed, or cancelled consultation returns `HTTP 409 Conflict (INVALID_STATUS_TRANSITION)`.
   - Completing a consultation that has not started (`SCHEDULED`) returns `HTTP 409 Conflict (INVALID_STATUS_TRANSITION)`.
3. **Atomic Concurrency Protection**:
   Transitions are executed with conditional updates (`updateMany({ where: { id, doctorId, status: 'EXPECTED' } })`) inside `prisma.$transaction`. Simultaneous requests cannot produce invalid state transitions.

---

### 6.3 Prescription Management

- **Eligibility**: Only assigned doctors can issue prescriptions, and only when the consultation is actively `IN_PROGRESS` or `COMPLETED`. Attempting to prescribe for a `SCHEDULED` or `CANCELLED` consultation returns `HTTP 409 Conflict (INVALID_CONSULTATION_STATE)`.
- **Validation**: Medication lists must contain between 1 and 20 items with structured attributes:
  ```json
  {
    "name": "Ashwagandha Churna",
    "dosage": "1 teaspoon (3g)",
    "frequency": "Twice daily with warm milk",
    "duration": "30 days"
  }
  ```
- **Access Control**: Prescriptions can only be read by the patient of the consultation, the prescribing doctor, or an administrator. Unrelated users receive `HTTP 403 Forbidden`.

---

### 6.4 Persistent Audit Logging

Every critical clinical mutation writes an immutable, sanitized audit record to the `audit_logs` table:

- **Recorded Actions**: `CONSULTATION_STARTED`, `CONSULTATION_COMPLETED`, `PRESCRIPTION_CREATED`.
- **Fields Captured**: `actorId`, `action`, `entityType`, `entityId`, `metadata`, `ipAddress`, `userAgent`, `createdAt`.
- **Security & Privacy (PHI)**: The audit service automatically redacts credentials, JWT tokens, and sensitive clinical parameters, capturing metadata safely (e.g. `itemCount` instead of raw medicine lists).
- **Atomic Integrity**: Audit logs for state mutations execute within the same database transaction as the entity change.

---

### 6.5 API Usage Examples (cURL)

#### 1. Doctor Starts Consultation
```bash
curl -X POST http://localhost:5000/api/v1/consultations/<CONSULTATION_ID>/start \
  -H "Authorization: Bearer <DOCTOR_ACCESS_TOKEN>"
```

#### 2. Doctor Issues Prescription
```bash
curl -X POST http://localhost:5000/api/v1/consultations/<CONSULTATION_ID>/prescriptions \
  -H "Authorization: Bearer <DOCTOR_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "medicines": [
      {
        "name": "Ashwagandha Churna",
        "dosage": "1 teaspoon (3g)",
        "frequency": "Twice daily with warm milk",
        "duration": "30 days"
      }
    ],
    "dosageInstructions": "Take after meals with warm milk",
    "advice": "Avoid heavy fermented foods"
  }'
```

#### 3. Doctor Completes Consultation
```bash
curl -X POST http://localhost:5000/api/v1/consultations/<CONSULTATION_ID>/complete \
  -H "Authorization: Bearer <DOCTOR_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Patient showed significant improvement. Routine follow-up in 2 weeks."
  }'
```

#### 4. Patient Retrieves Consultation & Prescriptions
```bash
curl -X GET http://localhost:5000/api/v1/consultations/<CONSULTATION_ID> \
  -H "Authorization: Bearer <PATIENT_ACCESS_TOKEN>"

curl -X GET http://localhost:5000/api/v1/consultations/<CONSULTATION_ID>/prescriptions \
  -H "Authorization: Bearer <PATIENT_ACCESS_TOKEN>"
```

---

## 7. Standard Error Format

All error responses across the application follow a strictly uniform JSON contract:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable explanation of the error",
    "details": null,
    "requestId": "95ff88f2-d90d-4460-ab2f-c6f090564fe4"
  }
}
```

### Common Error Codes
- `NOT_FOUND` (404): Route or resource does not exist.
- `MALFORMED_JSON` (400): Request body contains invalid JSON.
- `VALIDATION_ERROR` (400): Input fails business or schema validation.
- `INTERNAL_SERVER_ERROR` (500): Unexpected server failure. Stack traces are strictly hidden in production.

---

## 8. Database Schema & Entities

The relational database architecture is defined in `prisma/schema.prisma`.

### Implemented Entities
1. **User**: Core authentication identity with unique lowercase email, Argon2id password hash, role (`PATIENT`, `DOCTOR`, `ADMIN`), and account status (`ACTIVE`, `INACTIVE`, `SUSPENDED`).
2. **PatientProfile**: 1-to-1 extension of `User` with optional demographic details (phone, emergency contact, blood group, allergies).
3. **DoctorProfile**: 1-to-1 extension of `User` with qualifications, medical specialization, consultation fee (stored as `Decimal(10,2)`), and verification status (`PENDING`, `VERIFIED`, `REJECTED`).
4. **AvailabilitySlot**: Discrete consultation time slots with start time, end time, and status (`AVAILABLE`, `RESERVED`, `BOOKED`, `CANCELLED`). Includes a database-level unique constraint on `(doctorId, startTime, endTime)` to prevent exact duplicates, plus a PostgreSQL `CHECK (end_time > start_time)` constraint.
5. **Consultation**: Central healthcare consultation entity connecting a patient, doctor, and availability slot with lifecycle states (`SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`).
6. **Prescription**: Electronic prescription issued by the consulting doctor, containing structured medicines JSON (`[{ name, dosage, frequency, duration }]`), dosage instructions, and lifestyle advice.
7. **Payment**: 1-to-1 monetary record tied to a consultation, storing exact amount as `Decimal(10,2)` (avoiding floating-point inaccuracies), currency (`INR`), status (`PENDING`, `COMPLETED`, `FAILED`, `REFUNDED`), and unique payment gateway reference.
8. **AuditLog**: Immutable system audit trail capturing actor actions (`USER_LOGIN`, `SLOT_BOOKED`, `CONSULTATION_STARTED`, `CONSULTATION_COMPLETED`, `PRESCRIPTION_CREATED`), target entity type, entity ID, client IP address, and sanitized metadata.
9. **RefreshSession**: Cryptographically hashed refresh token storage supporting multi-device session revocation in future authentication phases.
10. **IdempotencyRecord**: Scoped idempotency token storage ensuring sensitive booking and transaction creation requests can be safely retried without double mutation.

See [docs/er-diagram.md](file:///c:/Users/ASUS/OneDrive/Desktop/amrutam-telemedicine-backend/docs/er-diagram.md) for the complete visual entity-relationship diagram.

---

## 9. Development Seed Accounts

The idempotent seed script (`prisma/seed.js`) provisions deterministic test accounts for local development.

| Role | Email | Plaintext Dev Password | Profile Note |
|---|---|---|---|
| **Admin** | `admin.dev@amrutam.local` | `DevPassword123!` | System Administrator |
| **Doctor** | `dr.ayush.sharma@amrutam.local` | `DevPassword123!` | BAMS, MD (Ayurveda Panchakarma) - 2 slots seeded |
| **Patient** | `patient.sample@amrutam.local` | `DevPassword123!` | Sample Patient (O+ blood group) |

> **Security Note**: These passwords are encrypted with Argon2id and are strictly intended for local development and non-production testing. Never reuse development credentials in production.

---

## 10. Docker Deployment

### Run All Services with Docker Compose
```bash
# Build and start PostgreSQL, Redis, and Amrutam API
docker compose up -d --build

# View container logs
docker compose logs -f api

# Tear down services and retain data volumes
docker compose down

# Reset database volume
docker compose down -v
```

---

## 11. npm Scripts Reference

| Command | Action |
|---|---|
| `npm run dev` | Start development server with `nodemon` hot-reloading |
| `npm start` | Start server in production mode |
| `npm test` | Run complete test suite via Vitest |
| `npm run test:unit` | Run unit tests (Liveness, readiness mocks, requestId, error handling, env) |
| `npm run test:integration` | Run integration tests (Redis connectivity, Prisma models) |
| `npm run db:validate` | Validate `prisma/schema.prisma` syntax |
| `npm run db:generate` | Generate Prisma Client from schema |
| `npm run db:migrate` | Create and apply development migration |
| `npm run db:deploy` | Apply all pending migrations to the target database |
| `npm run db:seed` | Seed idempotent development records |
| `npm run db:studio` | Launch Prisma Studio GUI for database inspection |

---

## 12. Phase 7 — Security Hardening & Multi-Factor Authentication (MFA)

Phase 7 implements production-grade security controls, Time-Based One-Time Password (TOTP) Multi-Factor Authentication for privileged roles, secret separation, and rigorous authorization boundaries.

### 12.1. Multi-Factor Authentication (TOTP MFA)

- **Standard & Library**: RFC 6238 TOTP using `@otplib` (HMAC-SHA1, 30s window, 6 digits).
- **Target Roles**: Privileged accounts (`ADMIN`, `DOCTOR`). Non-privileged `PATIENT` role cannot enroll.
- **Encryption at Rest**: TOTP shared secrets are encrypted using authenticated **AES-256-GCM** via Node's native `crypto` module, with a distinct 256-bit encryption key (`MFA_ENCRYPTION_KEY`). Secrets are never stored or logged in plaintext.
- **Enrollment Flow**:
  1. `POST /api/v1/auth/mfa/setup`: Generates an encrypted secret and an `otpauth://totp/...` URI.
  2. `POST /api/v1/auth/mfa/verify`: Patient/Doctor submits a 6-digit TOTP code. If verified, MFA is activated (`isEnabled: true`), an audit log (`MFA_ENABLED`) is committed, and an access token with `mfaVerified: true` is issued.
- **Login Challenge Flow**:
  - When an MFA-enrolled user logs in with valid email/password, the server responds with `{ mfaRequired: true, tempToken }`.
  - The client submits `{ code }` to `POST /api/v1/auth/mfa/challenge` with the temporary token.
  - Upon server-side verification, a full access token containing `mfaVerified: true` is issued.
- **Privilege Enforcement (`requireMfa`)**:
  - Administrative endpoints under `/api/v1/admin/*` mandate `authenticate`, `authorize('ADMIN')`, and `requireMfa`.
  - Client-supplied boolean parameters or headers (e.g., `?mfaVerified=true`) are completely ignored; only the cryptographically signed JWT claim `payload.mfaVerified === true` is trusted.

### 12.2. Cryptographic Secret Separation & Validation

- `src/config/env.js` validates cryptographic environment variables using Zod:
  - `JWT_ACCESS_SECRET`: Minimum 32 characters.
  - `JWT_REFRESH_SECRET`: Minimum 32 characters, strictly distinct from `JWT_ACCESS_SECRET`.
  - `MFA_ENCRYPTION_KEY`: Minimum 32 characters, strictly distinct from JWT signing secrets.
  - Development default keys are automatically rejected in `production` mode.

### 12.3. Sensitive Field Redaction & Structured Logging

- Pino structured logging redacts all sensitive fields:
  - `password`, `*.password`, `passwordHash`, `*.passwordHash`
  - `accessToken`, `refreshToken`, `tempToken`, `secret`, `mfaSecret`, `totpSecret`
  - `code`, `mfaCode`, `totpCode`, `otp`, `encryptionKey`
  - `req.headers.authorization`, `req.headers.cookie`, `req.headers["x-access-token"]`
- Client error responses return generic messages in production without leaking database details or stack traces.

### 12.4. Audit Logging of Privileged Operations

The system records immutable audit log entries with actor ID, target entity, timestamp, IP address, and user agent for:
- `MFA_SETUP_INITIATED`, `MFA_ENABLED`, `MFA_VERIFIED`, `MFA_DISABLED`
- `DOCTOR_VERIFIED`, `DOCTOR_REJECTED`
- `CONSULTATION_STARTED`, `CONSULTATION_COMPLETED`, `PRESCRIPTION_CREATED`

### 12.5. Payment Webhook Assessment

As verified during architectural inspection, the prototype backend currently does not integrate with an external payment provider or expose public payment webhooks. In accordance with project specifications, no fake production webhooks or unnecessary infrastructure were introduced.

### 12.6. Dependency Vulnerability Audit (`npm audit`)

Running `npm audit` reveals 9 vulnerabilities (1 moderate, 6 high, 2 critical) located entirely within developer tooling (`devDependencies`: `vitest`, `tinypool`, `nodemon`, `chokidar`, `prisma` CLI config). Production runtime dependencies are secure. Automatic forced upgrades (`--force`) were avoided to prevent breaking changes in the test runner.

---

## 13. Phase 8 — API Completion, Admin Analytics & Swagger UI

Phase 8 completes full API coverage, introduces advanced doctor search filtering, bounded pagination conventions, standardized API errors, privacy-preserving admin analytics, and interactive Swagger UI documentation.

### 13.1. Consultation & Prescription API Coverage

- **Patient & Doctor Consultations**: `GET /api/v1/consultations/me` dynamically scopes results based on the authenticated user's role (`PATIENT` sees their consultations, `DOCTOR` sees their assigned consultations, `ADMIN` can view all).
- **Consultation Details**: `GET /api/v1/consultations/:consultationId` enforces strict IDOR protection — only the associated patient, assigned doctor, or administrator can access the consultation details.
- **Consultation Lifecycle**:
  - `POST /api/v1/consultations/:consultationId/start`: Transition from `SCHEDULED` to `IN_PROGRESS` (assigned doctor only).
  - `POST /api/v1/consultations/:consultationId/complete`: Transition to `COMPLETED` (assigned doctor only).
- **Electronic Prescriptions**:
  - `POST /api/v1/consultations/:consultationId/prescriptions`: Doctors issue prescriptions with structured medicines (`[{ name, dosage, frequency, duration }]`), dosage instructions, and advice.
  - `GET /api/v1/consultations/:consultationId/prescriptions`: List all prescriptions for a specific consultation.
  - `GET /api/v1/prescriptions/:prescriptionId`: Retrieve an individual prescription by ID with strict ownership validation.
  - `GET /api/v1/prescriptions/me`: Paginated list of prescriptions belonging to the authenticated patient or doctor.

### 13.2. Advanced Doctor Search & Filters

The `GET /api/v1/doctors` endpoint supports database-level filtering and pagination:

- **Free-text Search**: `search`, `name`, or `q` parameters perform case-insensitive matching across doctor names, specializations, and qualifications.
- **Categorical & Credential Filters**:
  - `specialization`: Filters by medical specialization (e.g., Ayurveda, Panchakarma, Kayachikitsa).
  - `verificationStatus`: Filters by admin verification state (`VERIFIED`, `PENDING`, `REJECTED`).
- **Availability Date**: `availableDate=YYYY-MM-DD` queries related `availabilitySlots` to return only doctors with bookable `AVAILABLE` slots on the specified calendar date.
- **Numeric Ranges**: `maxFee` filters by maximum consultation fee; `minExperience` filters by minimum years of practice.

### 13.3. Consistent Bounded Pagination Convention

All collection listing endpoints (`/doctors`, `/doctors/me/availability`, `/doctors/me/bookings`, `/consultations/me`, `/prescriptions/me`, `/admin/audit-logs`) adhere to a standardized pagination contract:

- **Query Parameters**:
  - `page`: Default `1`, minimum `1`.
  - `pageSize`: Default `10` (or `20` for availability slots), minimum `1`, maximum server-enforced limit of `50`.
- **Database Querying**: Uses Prisma `skip` and `take` at the database level.
- **Stable Ordering**: Implements tie-breaking deterministic ordering (`orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]`).
- **Response Format**:
  ```json
  {
    "success": true,
    "data": [...],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 42,
      "totalPages": 5
    }
  }
  ```

### 13.4. Basic Admin Analytics (`GET /api/v1/admin/analytics/overview`)

Provides high-level platform health metrics without compromising patient confidentiality:

- **Privilege Requirements**: Requires authenticated `ADMIN` role with verified MFA state (`requireMfa`).
- **Time Windows**: Supports `window=7d`, `window=30d` (default), `window=90d`, or custom `startDate` and `endDate` parameters (ISO-8601 UTC).
- **Metrics Returned**:
  - **User Aggregates**: Total patients, total doctors, verified doctors, pending verifications, rejected doctors.
  - **Consultation Aggregates**: Total consultations, breakdowns by status (`SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`), consultations created within the window, and consultations completed within the window.
  - **Prescription Aggregates**: Total prescriptions issued, and prescriptions created within the window.
- **Privacy Guarantees**: Purely numeric and aggregated. No patient names, phone numbers, email addresses, diagnoses, or raw database rows are returned.

### 13.5. Standardized Error Response Format

The centralized error middleware (`src/common/errors/errorHandler.js`) formats all operational, validation, and database errors consistently:

```json
{
  "success": false,
  "requestId": "c1f77d54-a690-482a-9e12-32a1e3b6e80b",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "availableDate must be formatted as YYYY-MM-DD",
    "statusCode": 400,
    "details": [...],
    "requestId": "c1f77d54-a690-482a-9e12-32a1e3b6e80b"
  }
}
```

- **Prisma Error Handling**: Transparently translates `P2002` to `409 CONFLICT` and `P2025` to `404 NOT_FOUND` without leaking SQL syntax.
- **Production Safety**: Suppresses stack traces and internal messages in production environments (`NODE_ENV=production`).

### 13.6. Interactive Swagger UI & OpenAPI Specification

- **Interactive Documentation**: Served at `http://localhost:5000/api-docs` in development mode using `swagger-ui-express`.
- **Raw OpenAPI Spec**: Available in JSON format at `http://localhost:5000/api-docs/json`.
- **Specification File**: [docs/openapi.yaml](file:///c:/Users/ASUS/OneDrive/Desktop/amrutam-telemedicine-backend/docs/openapi.yaml) provides comprehensive OpenAPI 3.0.3 documentation covering 22 endpoints across Authentication, MFA, Doctors, Bookings, Consultations, Prescriptions, Admin Operations, and Analytics.

---

## 14. Phase 9: Automated Tests and Reliability

The backend includes a comprehensive, multi-tiered automated test suite built on **Vitest**, **Supertest**, and **Prisma Client**.

### 14.1. Test Suite Architecture

| Test Category | File / Directory | Description | Dependencies |
| :--- | :--- | :--- | :--- |
| **Unit & Business Rules** | `tests/unit/` | Fast, deterministic business logic, state transition matrix, token security, and validation tests | In-memory mocks (no external services needed) |
| **Transaction & Rollback** | `tests/unit/rollback.test.js` | Verifies atomic rollback of slots, bookings, and idempotency records upon failures | In-memory transaction callback spy |
| **Idempotency & Replay** | `tests/unit/idempotency.test.js` | Validates request fingerprinting, duplicate replays, 409 mismatch conflicts, and user isolation | Mocked database |
| **Security & IDOR** | `tests/unit/security.test.js` | Enforces resource ownership boundaries, non-assigned doctor rejections, and log redaction | Express app + Vitest |
| **PostgreSQL Integration** | `tests/integration/` | Live database-backed tests for schemas, constraints, consultation lifecycle, and Redis health | Isolated PostgreSQL / Redis |
| **Booking Concurrency** | `tests/integration/concurrency.test.js` | Real concurrent requests (`Promise.all`) testing PostgreSQL atomic updates and double-booking prevention | Isolated PostgreSQL |

### 14.2. Running Tests

```bash
# 1. Run all fast unit tests (no database required)
npm run test:unit

# 2. Run PostgreSQL integration & concurrency tests (requires isolated test database)
npm run test:integration

# 3. Run the full comprehensive test suite
npm test
```

### 14.3. Isolated Test Database Setup Guide

Database-mutating integration and concurrency tests should **always** run against an isolated PostgreSQL instance to protect development and production databases.

#### Option A: Local Docker PostgreSQL (Recommended)
```bash
# Start an isolated PostgreSQL container on port 5433 (separate from standard 5432)
docker run --name amrutam-test-postgres \
  -e POSTGRES_USER=amrutam_user \
  -e POSTGRES_PASSWORD=amrutam_password \
  -e POSTGRES_DB=amrutam_test_db \
  -p 5433:5432 \
  -d postgres:16-alpine

# In your .env file, specify the dedicated test database URL:
TEST_DATABASE_URL="postgresql://amrutam_user:amrutam_password@localhost:5433/amrutam_test_db?schema=public"

# Deploy existing migrations to the test database
DATABASE_URL="postgresql://amrutam_user:amrutam_password@localhost:5433/amrutam_test_db?schema=public" npx prisma migrate deploy
```

#### Option B: Dedicated Database in Local PostgreSQL
```sql
-- Connect to your local PostgreSQL instance via psql:
CREATE DATABASE amrutam_test_db;
```
Configure `TEST_DATABASE_URL="postgresql://amrutam_user:amrutam_password@localhost:5432/amrutam_test_db?schema=public"` in `.env`.

#### Option C: Dedicated Cloud Test Schema (Supabase / Neon)
Create a separate project or a separate schema dedicated exclusively for testing. **Never** point `TEST_DATABASE_URL` to your production database!

---

## 15. Phase 10: Infrastructure and Observability

The Amrutam Telemedicine Backend includes production-grade containerization, Prometheus metrics, distributed tracing, automated Grafana dashboards, and GitHub Actions CI pipelines.

### 15.1. Containerized Services Architecture (`docker-compose.yml`)

The platform is orchestrated into five containerized services connected via an internal bridge network (`amrutam-network`):

| Service | Container Name | Image | Port | Description |
| :--- | :--- | :--- | :--- | :--- |
| **API** | `amrutam-backend-api` | Built via `Dockerfile` (Node 22-alpine) | `5000:5000` | Express REST API server with non-root security context |
| **PostgreSQL** | `amrutam-postgres` | `postgres:16-alpine` | `5432:5432` | Primary relational database with healthcheck |
| **Redis** | `amrutam-redis` | `redis:7-alpine` | `6379:6379` | In-memory cache and rate-limiting store |
| **Prometheus** | `amrutam-prometheus` | `prom/prometheus:v2.54.1` | `9090:9090` | Time-series scraper collecting metrics from `api:5000/metrics` |
| **Grafana** | `amrutam-grafana` | `grafana/grafana:11.1.0` | `3000:3000` | Pre-provisioned metrics dashboard and visualization |

### 15.2. Docker Commands Quick Reference

```bash
# 1. Build and start all services in the background
docker-compose up -d --build

# 2. Check service status and health
docker-compose ps

# 3. View live logs from all containers or a specific service
docker-compose logs -f
docker-compose logs -f api

# 4. Stop all services without deleting persistent database volumes
docker-compose down

# 5. Stop all services and remove persistent volumes (full reset)
docker-compose down -v
```

### 15.3. Prometheus HTTP Request Metrics (`GET /metrics`)

The API exposes standard Prometheus-formatted metrics at `http://localhost:5000/metrics`:

- **Metrics Exposed**:
  - `http_requests_total`: Total requests partitioned by `method`, `route`, and `status_code`.
  - `http_request_duration_seconds`: High-resolution latency histogram with standard buckets (`[0.005, 0.01, ..., 10]`) by `method`, `route`, and `status_code`.
  - `http_requests_in_flight`: Current active concurrent requests by `method`.
  - `http_errors_total`: Counter tracking `4xx` and `5xx` error responses.
  - `app_uptime_seconds`: Node.js process uptime in seconds.
  - `nodejs_memory_heap_used_bytes`: Runtime heap memory consumption.
- **Cardinality Protection**: Dynamic path parameters (UUIDs, database IDs, slugs) are automatically normalized into route templates (e.g. `/api/v1/doctors/:id`) to prevent Prometheus memory exhaustion.

### 15.4. Distributed Tracing & W3C TraceContext

- **Trace Correlation**: All incoming requests are automatically tagged with a W3C-compliant `traceparent` header (`00-<trace_id>-<span_id>-01`) and `X-Trace-Id`.
- **Context Preservation**: Existing client `traceparent` headers are respected and propagated, generating a new child span ID while preserving the parent `traceId`.
- **Structured Log Correlation**: Request and error logs emitted by Pino automatically include `traceId`, `spanId`, and `requestId`.
- **Optional OTLP Exporter**: Trace data can be exported to OpenTelemetry collectors (Jaeger / Tempo / Datadog) by setting `OTEL_EXPORTER_OTLP_ENDPOINT` in `.env`. Exporter failures are non-blocking and will never crash user requests.

### 15.5. Automated Grafana Dashboard

Grafana is pre-configured with zero-touch provisioning:
- **URL**: `http://localhost:3000`
- **Default Credentials**: `admin` / `admin`
- **Provisioned Datasource**: Prometheus (`http://prometheus:9090`)
- **Dashboard**: **"Amrutam Telemedicine Backend Overview"**
  - **Panels**: Application Uptime, In-Flight Concurrent Requests, Process Memory, HTTP Request Rate (QPS), Error Rates (4xx/5xx), and p50/p95/p99 Latency.

### 15.6. Health Probes & Graceful Shutdown

- `GET /health`: General service health and process uptime.
- `GET /health/live`: Lightweight liveness probe for Kubernetes / Docker container health checks.
- `GET /health/ready`: Deep readiness probe checking PostgreSQL and Redis socket connectivity. Returns `200 OK` when ready, `503 Service Unavailable` if degraded.
- **Graceful Shutdown**: Listens for `SIGTERM` and `SIGINT`, gracefully stops accepting new HTTP connections, and cleanly closes PostgreSQL and Redis pools before terminating.

### 15.7. Continuous Integration Pipeline (`.github/workflows/ci.yml`)

The GitHub Actions CI pipeline runs on every push and pull request to `main`:
1. Checks out repository.
2. Sets up Node.js 22 with npm cache.
3. Spawns isolated PostgreSQL 16 and Redis 7 service containers.
4. Executes deterministic `npm ci`.
5. Validates Prisma schema with `npx prisma validate`.
6. Generates Prisma Client with `npx prisma generate`.
7. Executes fast unit test suite with `npm run test:unit`.
8. Deploys database migrations to test database with `npx prisma migrate deploy`.
9. Executes integration, concurrency, and lifecycle test suite with `npm run test:integration`.
10. Performs security audit with `npm audit --audit-level=high`.

---

## 16. Comprehensive Troubleshooting Guide

| Issue / Symptom | Root Cause | Practical Resolution |
| :--- | :--- | :--- |
| **Server fails to start: `ZodError: Invalid environment variables`** | One or more mandatory variables in `.env` are missing, malformed, or fail cryptographic separation. | Check the console error output. Ensure `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `MFA_ENCRYPTION_KEY` are all at least 32 characters long and distinct from each other. |
| **`Can't reach database server at aws-0-ap-south-1.pooler.supabase.com`** | PostgreSQL port or connection string issue, or network blocking outgoing port `6543`. | 1. Ensure `?sslmode=require` is appended to `DATABASE_URL`.<br/>2. If connecting from restrictive corporate networks, use direct port `5432` instead of pooler port `6543`.<br/>3. Verify IP whitelist in Supabase Network Restrictions. |
| **`P1001: Can't reach database server` during migrations** | Prisma migrations attempting to run through connection pooler (port 6543 / PgBouncer). | Set `DIRECT_URL="postgresql://...:5432/..."` in `.env`. Prisma uses `directUrl` specifically for migration DDL commands. |
| **`Redis client offline / Connection refused`** | Local Redis daemon is not running on port 6379. | Start Redis via `docker-compose up -d redis` or install local Redis service. The backend will continue to start and operate in degraded fallback mode. |
| **`Error: listen EADDRINUSE: address already in use :::5000`** | Another process is already bound to port 5000. | Terminate the occupying process or set `PORT=5001` in your `.env` file. |
| **`HTTP 409: SLOT_UNAVAILABLE`** | The requested availability slot has already been booked by another patient. | The slot was reserved concurrently. Refresh available slots via `GET /api/v1/doctors` or select another slot. |
| **`HTTP 409: IDEMPOTENCY_KEY_MISMATCH`** | The same `Idempotency-Key` was reused with a different request payload (`slotId`). | Generate a fresh unique UUID for the new booking attempt, or keep payload identical when retrying. |
| **`HTTP 401: UNAUTHORIZED / Token expired`** | The short-lived JWT access token (`15m`) has expired. | Call `POST /api/v1/auth/refresh` with the HttpOnly refresh cookie to obtain a fresh access token. |
| **`HTTP 403: MFA verification required`** | Accessing `/api/v1/admin/*` routes without completing the TOTP challenge. | Call `POST /api/v1/auth/mfa/verify` with your TOTP code to obtain an MFA-verified access token. |
| **`ERR_ERL_STORE_REUSE` in tests** | Shared RedisStore instance across multiple rate limiters. | Resolved via dedicated `createRedisStore('prefix')` instances per rate limiter in `src/common/middleware/rateLimiter.js`. |
| **Docker container health check failing (`wget http://localhost:5000/health/live`)** | Node.js process crashed or database connection hung during boot. | Inspect container logs via `docker-compose logs api` to observe cold-boot startup errors. |

---

## 17. Security, Privacy & Data Safety Rules

1. **Zero Real Credentials in Git**: Never commit `.env` or production credentials. Keep `.gitignore` updated with `.env`, `.env.*`, and `!.env.example`.
2. **Dedicated Test Database**: Never run automated integration tests against your primary development or cloud Supabase database. Always configure `TEST_DATABASE_URL` pointing to an isolated test database.
3. **Never Reset Production**: Never execute `npx prisma migrate reset` or `prisma db push --force-reset` on a database with active clinical records. Always use `npx prisma migrate deploy` for forward-only migrations.
4. **Log Privacy**: Never remove or bypass `redactPaths` in `src/common/logger/logger.js`. Avoid logging raw medical notes or prescription bodies.



#   a m r u t a m - t e l e m e d i c i n e - b a c k e n d - t a s k  
 