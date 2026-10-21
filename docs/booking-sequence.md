# Amrutam Telemedicine Backend — Booking Workflow & Concurrency Sequence

This document details the exact booking transaction sequence, double-booking prevention mechanism, and persistent idempotency replay lifecycle implemented in `src/modules/bookings/booking.service.js` and `src/modules/bookings/booking.controller.js`.

---

## 1. Booking Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Patient as Patient (API Client)
    participant API as Express API Router
    participant Auth as Auth & Validation Middleware
    participant Service as Booking Service
    participant Idem as Idempotency Store
    participant DB as PostgreSQL ($transaction)

    Patient->>API: POST /api/v1/bookings<br/>Headers: Authorization, Idempotency-Key<br/>Body: { slotId }
    API->>Auth: Validate JWT & Schema (Zod)
    
    alt Invalid Token or Missing Idempotency-Key
        Auth-->>Patient: 400 Bad Request / 401 Unauthorized
    else Authentication & Validation Successful
        Auth->>Service: createBooking(userId, { slotId }, idempotencyKey)
        
        Service->>Idem: findUnique({ userId, operation: 'booking:create', idempotencyKey })
        
        alt Idempotent Replay: Key Exists with Identical Hash
            Idem-->>Service: Existing IdempotencyRecord (with cached responseBody)
            Service-->>Patient: 200 OK (isReplay: true, existing booking)
        else Payload Mismatch: Key Exists with Different slotId Hash
            Idem-->>Service: Existing IdempotencyRecord (different requestHash)
            Service-->>Patient: 409 Conflict (IDEMPOTENCY_KEY_MISMATCH)
        else Fresh Request: Key Not Found
            Idem-->>Service: null
            
            Service->>DB: prisma.$transaction(async (tx) => { ... })
            activate DB
            
            DB->>DB: 1. Ensure PatientProfile exists
            DB->>DB: 2. Verify AvailabilitySlot exists
            
            Note over DB: 3. Atomic Conditional Slot Reservation:<br/>UPDATE availability_slots SET status = 'BOOKED'<br/>WHERE id = slotId AND status = 'AVAILABLE'
            
            alt Slot Already Booked by Competing Transaction (count == 0)
                DB-->>Service: updateMany returns count: 0
                Service-->>Patient: 409 Conflict (SLOT_UNAVAILABLE)
                deactivate DB
            else Slot Successfully Reserved (count == 1)
                DB->>DB: 4. INSERT INTO consultations (status: 'SCHEDULED')
                DB->>DB: 5. INSERT INTO idempotency_records (key, hash, response)
                
                alt Internal Database Constraint or Server Error
                    DB-->>DB: ROLLBACK Transaction
                    Note over DB: Slot remains AVAILABLE.<br/>No consultation or idempotency record persisted.
                    DB-->>Service: Transaction error
                    Service-->>Patient: 500 Internal Server Error
                else Transaction Commits Successfully
                    DB-->>DB: COMMIT Transaction
                    deactivate DB
                    Service-->>API: { booking, isReplay: false }
                    API-->>Patient: 201 Created<br/>Body: { success: true, data: consultation, isReplay: false }
                end
            end
        end
    end
```

---

## 2. Technical Safeguards & Mechanics

### 2.1. Concurrency Safety: Atomic Conditional Update
Instead of naive `SELECT ... then UPDATE` (which is vulnerable to race conditions), the booking service executes an atomic conditional update directly inside PostgreSQL:
```sql
UPDATE availability_slots
SET status = 'BOOKED', updated_at = NOW()
WHERE id = $1 AND status = 'AVAILABLE';
```
If two patient requests arrive simultaneously:
1. PostgreSQL applies a row-level write lock.
2. The winning transaction updates the row and receives `count = 1`.
3. The competing transaction executes next, finds `status != 'AVAILABLE'`, and receives `count = 0`.
4. The service detects `count === 0` and immediately raises an `AppError('The requested availability slot is already booked or no longer available', 409, 'SLOT_UNAVAILABLE')`.
5. This prevents double-booking without requiring in-memory locks or external distributed locking systems.

### 2.2. Persistent Idempotency Mechanics
1. **Header Requirement**: Clients must send an `Idempotency-Key` header (1 to 128 characters).
2. **Deterministic Payload Hashing**: The service hashes `{ slotId }` using `SHA-256`.
3. **Scoping**: Keys are scoped by compound key `[userId, operation, idempotencyKey]`. Patient A and Patient B can use the same string without collision.
4. **Fast Replay**: If the key already exists and the hash matches, the cached response is returned immediately (`200 OK`, `isReplay: true`) without reopening a database transaction.
5. **Fingerprint Protection**: If the key exists but the hash differs, the request is rejected with `409 Conflict (IDEMPOTENCY_KEY_MISMATCH)`.

### 2.3. Transaction Atomicity & Rollback
The slot reservation, consultation insertion, and idempotency persistence are executed within a single `prisma.$transaction(async (tx) => { ... })`:
- If an unhandled error or database failure occurs after the slot update but before the transaction completes, PostgreSQL performs a complete rollback.
- The slot reverts to `AVAILABLE`, and no orphaned consultation or idempotency record is persisted.
