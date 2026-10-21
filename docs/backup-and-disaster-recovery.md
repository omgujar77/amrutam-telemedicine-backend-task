# Amrutam Telemedicine Backend — Backup and Disaster Recovery Strategy

**Document Status:** Operational Runbook & Recommended Strategy  
**Target Database:** PostgreSQL 16 / Supabase Managed Cloud  
**Scope:** Telemedicine Core Platform (IAM, Consultations, Prescriptions, Scheduling, Audit Logs)

---

## 1. Critical Data Inventory & Classification

The Amrutam Telemedicine platform persists clinical and operational data across eleven relational tables:

| Tier | Tables / Entities | Business Impact | Recommended Backup Frequency |
| :--- | :--- | :--- | :--- |
| **Tier 1 (Mission-Critical PHI)** | `users`, `patient_profiles`, `doctor_profiles`, `consultations`, `prescriptions`, `user_mfa` | Permanent loss damages patient health history, legal compliance, and clinical care continuity. | Continuous WAL archiving + Daily automated snapshots. |
| **Tier 2 (Operational State)** | `availability_slots`, `payments`, `idempotency_records` | Loss causes appointment scheduling conflicts and double-booking risks. | Hourly incremental or continuous replication. |
| **Tier 3 (Forensic & Audit)** | `audit_logs`, `refresh_sessions` | Loss compromises forensic incident investigations and active user logins. | Daily cold exports to immutable cloud object storage. |

---

## 2. Recovery Objectives (RPO & RTO Targets)

These targets represent **proposed operational goals** appropriate for an Ayurvedic telemedicine platform prototype:

| Metric | Definition | Proposed Target | Realistic Prototype Capability |
| :--- | :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | Maximum acceptable data loss duration. | **$\le$ 1 Hour** | In local Docker development: point of latest `pg_dump`. In Supabase Pro: point-in-time recovery (PITR) up to the latest second. |
| **RTO (Recovery Time Objective)** | Maximum acceptable downtime until service restoration. | **$\le$ 2 Hours** | Local container restore: ~15 minutes. Managed cloud failover: ~30–60 minutes. |

> [!NOTE]
> The RPO/RTO metrics above are proposed design targets. In the current prototype phase, recovery procedures have been validated via local schema deployments, but live multi-region cloud failover has not been contractually tested under load.

---

## 3. Database Backup Strategies

### 3.1. Cloud Database (Supabase Managed PostgreSQL)
When operating against Supabase:
1. **Automated Daily Backups**: Enabled automatically on all paid Supabase projects, retained for 7 to 30 days depending on tier.
2. **Point-In-Time Recovery (PITR)**: Provides Physical Write-Ahead Log (WAL) archiving allowing rollback to any specific minute.
3. **Dedicated Backup Credentials**: Database backup agents and dump routines must use dedicated read-only replication credentials, isolated from application runtime credentials.

### 3.2. Local Container & Self-Hosted Backup Script
For containerized local setups or self-hosted VMs, a scheduled `cron` job executes `pg_dump`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/amrutam_db"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/amrutam_backup_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

# Execute PostgreSQL custom-format compressed backup
docker exec -t amrutam-postgres pg_dump \
  -U amrutam_user \
  -d amrutam_db \
  -F c \
  -b \
  -v > "${BACKUP_FILE}"

# Encrypt backup archive using AES-256 before offsite sync
gpg --symmetric --cipher-algo AES256 --batch --passphrase-file /etc/amrutam/backup_key.txt "${BACKUP_FILE}"
rm -f "${BACKUP_FILE}"

# Purge backups older than 14 days
find "${BACKUP_DIR}" -type f -name "*.dump.gpg" -mtime +14 -delete
```

---

## 4. Disaster Recovery Scenarios & Playbooks

### Scenario A: Accidental Data Corruption or Malicious Deletion
*Context: A developer accidentally drops rows, or an unassigned doctor record is corrupted.*
1. **Isolate**: Put API in maintenance mode (`503 Service Unavailable`) to prevent further conflicting writes.
2. **Determine Point of Failure**: Inspect `audit_logs` to establish the exact timestamp of the destructive mutation.
3. **Restore Target Point**:
   - In Supabase: Navigate to **Database** $\rightarrow$ **Backups** $\rightarrow$ select PITR timestamp immediately prior to the incident.
   - In Local Docker: Restore the latest valid `.dump` to an isolated database (`amrutam_restored_db`).
4. **Data Verification**: Run integrity verification queries to check patient and prescription table consistency.
5. **Resume**: Point `DATABASE_URL` to the restored instance and restart API containers.

### Scenario B: Failed Database Migration (`prisma migrate`)
*Context: A new migration fails mid-flight, leaving locks or altered column types.*
1. **Identify Migration Failure**:
   ```bash
   npx prisma migrate status
   ```
2. **Rollback Applied Schema Changes**:
   - Revert to the previous migration script:
     ```bash
     npx prisma migrate resolve --rolled-back "<migration_name>"
     ```
3. **Re-apply Safe Migrations**:
   - Fix the SQL migration file and re-run:
     ```bash
     npx prisma migrate deploy
     ```

### Scenario C: Compromised Encryption Keys or Service Credentials
*Context: `JWT_ACCESS_SECRET` or `MFA_ENCRYPTION_KEY` is accidentally checked into public version control.*
1. **Revoke Sessions**: Execute SQL to invalidate all active refresh sessions immediately:
   ```sql
   UPDATE refresh_sessions SET revoked_at = NOW() WHERE revoked_at IS NULL;
   ```
2. **Rotate Secrets**:
   - Generate a new 64-character hex secret:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - Update `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` in environment variables.
3. **Restart API Service**: Restart all application containers to load new signing secrets. All clients will be prompted to log in again.
4. **MFA Secret Re-encryption**: If `MFA_ENCRYPTION_KEY` is compromised, write a migration script to decrypt TOTP secrets using the old key and re-encrypt with the new key.

### Scenario D: Redis Cache & Rate Limit Failure
*Context: Redis instance crashes or becomes unreachable.*
- **Fault-Tolerant Fallback**: The backend is designed with resilient degradation. In `src/config/redis.js`, Redis disconnects gracefully emit warnings rather than terminating the Node.js process.
- In `src/common/middleware/rateLimiter.js`, limiters fall back to in-memory tracking if Redis is unreachable.
- Core booking transactions and consultations run against PostgreSQL and continue functioning without interruption.

---

## 5. Step-by-Step Restoration Procedure

When restoring a database from a `.dump` archive:

```bash
# 1. Create a clean isolated target database
docker exec -i amrutam-postgres psql -U amrutam_user -d postgres -c "CREATE DATABASE amrutam_recovery_db;"

# 2. Restore schema and data using pg_restore
docker exec -i amrutam-postgres pg_restore \
  -U amrutam_user \
  -d amrutam_recovery_db \
  --clean \
  --if-exists \
  --no-owner \
  < /var/backups/amrutam_db/amrutam_backup_latest.dump

# 3. Validate Prisma migration state
DATABASE_URL="postgresql://amrutam_user:amrutam_password@localhost:5432/amrutam_recovery_db?schema=public" npx prisma migrate status

# 4. Verify data integrity (consultations and users)
DATABASE_URL="postgresql://amrutam_user:amrutam_password@localhost:5432/amrutam_recovery_db?schema=public" node -e "
  import('@prisma/client').then(async ({ PrismaClient }) => {
    const p = new PrismaClient();
    console.log('Users count:', await p.user.count());
    console.log('Consultations count:', await p.consultation.count());
    await p.\$disconnect();
  });
"

# 5. Swap connection string and restart API
# Update DATABASE_URL in .env to point to recovered database, then restart.
```
