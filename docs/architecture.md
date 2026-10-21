# Amrutam Telemedicine Backend — Architecture & System Design Document

**Document Version:** 1.0.0  
**Target Environment:** Node.js 22 LTS / PostgreSQL 16 / Redis 7  
**Architecture Style:** Modular Monolith with Layered Domain Services

---

## 1. System Overview

### 1.1. Problem Statement & Mission
The **Amrutam Telemedicine Backend** is a production-oriented, secure medical backend engineered to power digital Ayurvedic consultations. It provides patients with transparent access to verified Ayurvedic doctors, deterministic scheduling without double-booking, end-to-end clinical consultations, encrypted prescription issuance, and administrative governance.

### 1.2. Functional Scope
- **Identity & Access Management (IAM)**: Argon2id password hashing, JWT authentication (15m access / 7d refresh), role-based access control (`PATIENT`, `DOCTOR`, `ADMIN`), and RFC 6238 TOTP Multi-Factor Authentication (MFA) with AES-256-GCM encryption.
- **Doctor Directory & Search**: Doctor profile verification, search filtering by specialization, fee range, clinical experience, and real-time slot availability.
- **Availability & Scheduling**: Doctor slot generation, double-booking prevention, atomic slot reservation, and persistent idempotency replay.
- **Clinical Lifecycle**: Strict state-machine consultations (`SCHEDULED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `COMPLETED` / `CANCELLED`), medical notes, and structured electronic prescriptions (`[{ name, dosage, frequency, duration }]`).
- **Administrative Governance**: Bounded analytics overview, doctor credential verification, and immutable audit trails.
- **Observability**: Prometheus HTTP metrics, W3C distributed tracing context propagation, structured JSON logging with sensitive PII redaction, and Grafana monitoring.

### 1.3. Non-Functional Requirements (NFRs)
- **Data Integrity**: Zero double-booking tolerance via atomic conditional database updates.
- **Confidentiality & Privacy**: Strict Insecure Direct Object Reference (IDOR) protection on medical records and automated redaction of tokens and health data from logs.
- **Observability**: Sub-millisecond latency metric tracking and W3C trace context correlation across all requests.
- **Reproducibility**: Containerized deployment via Docker and Docker Compose with zero-touch datasource provisioning.

---

## 2. Technology Stack & Rationale

| Layer | Technology | Version | Rationale & Selection Criteria |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | `>=20.0.0` (22 LTS) | High-throughput asynchronous I/O event loop, native `node:crypto`, and broad ecosystem compatibility. |
| **Web Framework** | Express.js | `^5.3.0` | Mature HTTP pipeline, flexible middleware chaining, and native promise-based routing. |
| **Data Persistence** | PostgreSQL / Supabase | `16` | ACID transaction guarantees, row-level locking, rich JSONB support, and check constraints. |
| **Object-Relational Mapping** | Prisma ORM | `^6.19.3` | Type-safe schema definition, declarative migrations, automated connection pooling, and connection resilience. |
| **Caching & Rate Limiting** | Redis | `7-alpine` / `ioredis` | Sub-millisecond in-memory cache and atomic rate-limiting store (`rate-limit-redis`). |
| **Schema Validation** | Zod | `^4.6.7` | Compile-time and runtime input schema validation with fail-fast, sanitizing parsing. |
| **Cryptography & Auth** | Argon2 / Jose / Otplib | `argon2`, `jsonwebtoken`, `otplib` | Memory-hard password hashing (Argon2id), stateless JWTs, and RFC 6238 TOTP with AES-256-GCM. |
| **Observability & Metrics** | Pino / Prometheus / Grafana | `pino-http`, `v2.54.1`, `11.1.0` | High-speed structured JSON logging, standard Prometheus exposition format, and pre-built dashboards. |
| **Automated Testing** | Vitest / Supertest | `^3.0.7`, `^7.0.0` | Ultra-fast parallel unit test execution, transaction spying, and HTTP integration testing. |

---

## 3. System Architecture Diagram

```mermaid
graph TB
    subgraph Clients["API Clients & Consumers"]
        Web[Web Patient Portal]
        Mobile[Mobile Telemedicine App]
        AdminUI[Admin Dashboard]
    end

    subgraph Edge["Infrastructure & Security Edge"]
        LB[Reverse Proxy / Ingress]
        Helmet[Security Headers (Helmet)]
        TraceMW[W3C TraceContext Engine]
        MetricsMW[Prometheus Metrics Engine]
        LoggerMW[Pino HTTP Logger]
        RateLimit[Redis Rate Limiter]
    end

    subgraph App["Express Modular Monolith Core"]
        AuthMid[Auth & RBAC Middleware]
        MFAMid[requireMfa Gatekeeper]

        subgraph Modules["Domain Modules"]
            AuthMod[Auth & Token Module]
            MFAMod[TOTP MFA Module]
            DocMod[Doctor Directory Module]
            AvailMod[Availability Module]
            BookMod[Booking & Idempotency Module]
            ConsMod[Consultation Lifecycle Module]
            PrescMod[Prescription Module]
            AdminMod[Admin & Analytics Module]
            HealthMod[Health Probes Module]
        end

        AuditServ[Audit Logging Service]
        CryptoServ[AES-256-GCM Encryption]
    end

    subgraph DataLayer["Persistence & Infrastructure Stores"]
        Prisma[Prisma ORM Client]
        PG[(PostgreSQL Primary Database)]
        RedisStore[(Redis Cache & Rate Limit)]
    end

    subgraph Observability["Monitoring & Telemetry Stack"]
        Prom[Prometheus Scraper (:9090)]
        Graf[Grafana Dashboards (:3000)]
    end

    Clients --> LB
    LB --> Helmet --> TraceMW --> MetricsMW --> LoggerMW --> RateLimit
    RateLimit --> AuthMid
    AuthMid --> MFAMid --> Modules

    Modules --> AuditServ
    Modules --> CryptoServ
    Modules --> Prisma
    Prisma --> PG
    RateLimit --> RedisStore
    MetricsMW -.-> Prom
    Prom --> Graf
```

---

## 4. Component Architecture & Domain Modules

### 4.1. Authentication & Access Control (`src/modules/auth`)
- **Token Service**: Issues signed JWT access tokens (`15m` validity) containing `userId`, `role`, and `mfaVerified`.
- **Session Management**: Issues long-lived refresh tokens stored as HttpOnly, Secure, SameSite cookies and cryptographically hashed (`token_hash`) in the `refresh_sessions` table.
- **TOTP MFA**: Generates and verifies RFC 6238 6-digit codes. TOTP secrets are encrypted at rest using AES-256-GCM via `src/common/crypto/encryption.js`.

### 4.2. Doctor Directory & Availability (`src/modules/doctors`, `src/modules/availability`)
- **Search & Discovery**: Bounded database queries filtering by medical specialization, fee range, experience, and verification state.
- **Availability Management**: Doctor-owned slot generation enforcing non-overlapping intervals and `end_time > start_time`.

### 4.3. Bookings & Idempotency (`src/modules/bookings`)
- **Booking Engine**: Coordinates atomic slot reservation with consultation creation inside a database transaction.
- **Persistent Idempotency**: Evaluates `Idempotency-Key` headers against stored SHA-256 request hashes to return replays without duplicate database writes.

### 4.4. Clinical Consultations & Prescriptions (`src/modules/consultations`, `src/modules/prescriptions`)
- **Lifecycle State Machine**: Validates transitions (`SCHEDULED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `COMPLETED`).
- **Electronic Prescriptions**: Authorized doctors issue medication records containing dosage, frequency, and instructions.
- **IDOR Safeguards**: Direct database ownership checks verify that patients and doctors can access only their own records.

### 4.5. Observability & Telemetry (`src/common/metrics`, `src/common/tracing`, `src/common/logger`)
- **Metrics**: Standard Prometheus format exposed at `GET /metrics`.
- **Tracing**: W3C `traceparent` propagation tagging logs and HTTP headers.
- **Logging**: Pino JSON output with automated redaction of sensitive credentials and headers.

---

## 5. Core Data Flows

### 5.1. Authentication Flow
1. Client sends credentials to `POST /api/v1/auth/login`.
2. Password hash verified against `users.password_hash` via Argon2id.
3. If MFA is active, issues temporary token; client submits TOTP code to `POST /api/v1/auth/mfa/verify`.
4. Issues 15-minute access token and sets 7-day refresh cookie.

### 5.2. Booking Flow
1. Patient sends `POST /api/v1/bookings` with `{ slotId }` and `Idempotency-Key`.
2. Service evaluates idempotency record for `userId`. If match exists, returns cached response immediately.
3. Begins PostgreSQL transaction: updates slot status `AVAILABLE` $\rightarrow$ `BOOKED`.
4. If row update count is 0, rolls back and returns `409 Conflict`.
5. Creates `Consultation` and `IdempotencyRecord` atomically, commits transaction, and returns `201 Created`.

### 5.3. Consultation Lifecycle & Prescription Flow
1. Assigned doctor starts consultation via `POST /api/v1/consultations/:id/start`. State updates to `IN_PROGRESS`.
2. Doctor issues prescription via `POST /api/v1/consultations/:id/prescriptions`.
3. Doctor completes consultation via `POST /api/v1/consultations/:id/complete` with clinical notes.
4. Each transition writes an immutable audit record to `audit_logs` within the same transaction.

---

## 6. Key Design Decisions & Trade-Offs

### 6.1. Modular Monolith vs. Microservices
- **Decision**: Implemented as a modular monolith within a single Node.js Express process, partitioned into isolated domain modules.
- **Rationale**: Eliminates network serialization overhead, distributed transaction failures, and deployment complexity while preserving clean architectural boundaries for future microservice extraction.

### 6.2. Atomic Conditional Updates vs. In-Memory Locks
- **Decision**: Handled double-booking concurrency via PostgreSQL atomic conditional updates (`UPDATE ... WHERE status = 'AVAILABLE'`) inside transactions.
- **Rationale**: In-memory locks fail across multiple API container replicas. Database-level row locking guarantees absolute correctness regardless of horizontal scaling.

### 6.3. Scoped Idempotency Keys
- **Decision**: Compound unique constraint `[userId, operation, idempotencyKey]`.
- **Rationale**: Prevents accidental key collisions between distinct patients while isolating user scopes.

### 6.4. Transaction Management & Distributed Sagas
- **Local ACID Transactions**: Within the monolithic core, critical multi-step operations (slot reservation + consultation creation + idempotency record) execute inside atomic `prisma.$transaction(async (tx) => { ... })` blocks. PostgreSQL row-level locks prevent dirty reads, non-repeatable reads, and phantom double-bookings.
- **Distributed Saga Pattern (Orchestration)**: For workflows spanning external distributed boundaries (e.g., third-party payment gateways, video signaling servers, and external SMS providers), two-phase locking (2PC) is an anti-pattern. The platform design specifies an **Orchestrated Saga**:
  1. **Step 1 (Local Tx)**: Reserve Availability Slot (status: `RESERVED`, 10-minute TTL hold).
  2. **Step 2 (External Call)**: Authorize Payment via Gateway.
  3. **Step 3 (Local Tx)**: Confirm Booking (status: `BOOKED`, insert `Consultation`, persist `IdempotencyRecord`).
  4. **Step 4 (Async Queue)**: Enqueue notification dispatch in BullMQ.
  - **Compensating Transactions**: If Step 2 fails (payment rejected) or Step 3 fails, the Saga Orchestrator executes the compensating action (`UPDATE availability_slots SET status = 'AVAILABLE' WHERE id = slotId`), releasing the held slot and preventing stranded reservations.

### 6.5. Asynchronous Background Jobs Architecture
- **Decision**: Heavy I/O tasks (email delivery, SMS reminders, electronic prescription PDF generation, and expired idempotency key cleanup) are offloaded to Redis-backed queues.
- **Engine**: Redis + BullMQ worker architecture running alongside the API, featuring exponential retry backoff, concurrency controls, and Dead Letter Queues (DLQ) for failed jobs.

---

## 7. Reliability and Scalability Boundaries

### 7.1. Current Prototype Capabilities
- **Tested**: Double-booking concurrency safety, idempotency replays, transaction rollbacks, role boundaries, and Prometheus metric generation.
- **Containerization**: Fully containerized and verified via Docker Compose with health checks and graceful shutdown.

### 7.2. Production Scaling Roadmap
To scale this backend to enterprise telemedicine production volumes:
1. **Connection Pooling**: Deploy Prisma Accelerate or PgBouncer to manage high-concurrency client connections.
2. **Read Replicas**: Route high-volume doctor directory queries (`GET /api/v1/doctors`) to PostgreSQL read replicas.
3. **Asynchronous Background Jobs**: Extract email, SMS, and audit log processing into BullMQ Redis-backed worker queues.
4. **Table Partitioning**: Partition `audit_logs` and `idempotency_records` by monthly date ranges (`createdAt`).
