# Amrutam Telemedicine Backend — Known Limitations & Scope Boundaries

This document provides transparent, technically honest disclosure regarding the current boundaries, unverified integrations, prototype compromises, and future work for the **Amrutam Telemedicine Backend**.

---

## 1. Current Implementation Limitations

### 1.1. Registration Email / Phone Verification
- **Current State**: When a patient or doctor registers via `POST /api/v1/auth/register`, their account status is immediately set to `ACTIVE`.
- **Limitation**: No email confirmation link or SMS OTP verification is sent.
- **Impact**: Users can register with unverified or misspelled email addresses. Acceptable for prototype demonstrations; required for production clinical compliance.

### 1.2. Payment Gateway Mocking
- **Current State**: The `Payment` model and enum (`PENDING`, `COMPLETED`, `FAILED`, `REFUNDED`) exist in the database schema.
- **Limitation**: External payment webhooks (e.g., Razorpay / Stripe) are not wired to a live banking gateway. Bookings currently confirm directly upon slot reservation without requiring prepayment.

### 1.3. Real-Time Telemedicine Video & WebRTC Signaling
- **Current State**: The backend manages the lifecycle, scheduling, medical notes, and prescriptions for consultations.
- **Limitation**: The system does not host WebRTC signaling servers (STUN/TURN) or video streaming media servers. Clinical consultations are logically tracked, but the audio/video stream relies on external integration (e.g., Twilio / Agora / Jitsi).

### 1.4. In-Memory Idempotency Expiry Cleanup
- **Current State**: Idempotency records are written to PostgreSQL with an `expiresAt` timestamp set to 24 hours in the future.
- **Limitation**: Expired records remain in PostgreSQL until manually purged or queried. No automated background cron worker is currently running to continuously purge rows where `expiresAt < NOW()`.

---

## 2. Verification Gaps

### 2.1. Multi-Node Load & Stress Testing
- **Current State**: Concurrency tests in `tests/integration/concurrency.test.js` verify that competing simultaneous requests from two patients on the same slot result in exactly one booking and one `409 Conflict`.
- **Gap**: High-scale distributed load tests (e.g., 5,000 QPS sustained using k6 or Locust across 10 API container replicas) have not been formally benchmarked. Specific p95/p99 latency metrics under heavy database saturation are unmeasured.

### 2.2. Live OpenTelemetry Collector Deployment
- **Current State**: W3C distributed trace context propagation (`traceparent`, `X-Trace-Id`) is fully implemented, verified via unit tests, and integrated with Pino logger serialization.
- **Gap**: The optional OTLP HTTP trace export is configured to fail gracefully when no collector is present, but an end-to-end trace stream to a live Jaeger / OpenTelemetry Collector cluster has not been tested in CI.

### 2.3. Live Multi-Region Disaster Recovery Restoration
- **Current State**: Full disaster recovery procedures, backup scripts, and PostgreSQL restoration commands are documented in `docs/backup-and-disaster-recovery.md`.
- **Gap**: Live data recovery has been tested locally against disposable PostgreSQL databases, but an actual automated failover drill against Supabase managed instances has not been conducted.

---

## 3. Assignment Scope Exclusions

The following capabilities were intentionally excluded from this prototype backend assignment to prioritize core scheduling correctness, authorization security, and transaction reliability over commercial peripheral features:

1. **Patient Electronic Health Record (EHR) PDF Document Parsing / OCR**: Upload of scanned diagnostic lab reports.
2. **Push Notifications & In-App Chat**: Firebase Cloud Messaging (FCM) or Apple Push Notification Service (APNS).
3. **Medical Inventory & Pharmacy Fulfillment**: Physical warehouse dispatch of prescribed Ayurvedic medicines.
4. **Third-Party Health Insurance Claims Processing**: Ayushman Bharat Digital Mission (ABDM) or FHIR standard data interchange.

---

## 4. Production Roadmap & Planned Enhancements

| Phase / Milestone | Planned Feature | Description |
| :--- | :--- | :--- |
| **Milestone 1** | **OTP Email / SMS Verification** | AWS SES or Twilio integration for 6-digit registration verification. |
| **Milestone 2** | **Payment Gateway Integration** | Razorpay UPI / Card checkout with webhook signature verification. |
| **Milestone 3** | **Automated Maintenance Cron** | Redis/BullMQ worker for daily cleanup of expired idempotency records. |
| **Milestone 4** | **ABDM / FHIR Compliance** | Standardized medical data exchange for electronic Ayurvedic prescriptions. |
