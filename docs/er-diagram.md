# Amrutam Telemedicine Backend - Entity Relationship Diagram

This document illustrates the data architecture and relational constraints implemented in **Phase 2 (Database Schema and Migrations)** using PostgreSQL and Prisma ORM.

```mermaid
erDiagram
    users ||--o| patient_profiles : "has (1:1)"
    users ||--o| doctor_profiles : "has (1:1)"
    users ||--o{ refresh_sessions : "has many"
    users ||--o{ audit_logs : "acts in"

    doctor_profiles ||--o{ availability_slots : "manages"
    doctor_profiles ||--o{ consultations : "conducts"
    doctor_profiles ||--o{ prescriptions : "issues"

    patient_profiles ||--o{ consultations : "attends"

    availability_slots ||--o| consultations : "booked for (1:1)"

    consultations ||--o{ prescriptions : "contains"
    consultations ||--o| payments : "settled via (1:1)"

    users {
        string id PK "UUID"
        string email UK "Normalized Unique"
        string password_hash "Argon2id Hash"
        string name "Full Name"
        UserRole role "PATIENT | DOCTOR | ADMIN"
        UserStatus status "ACTIVE | INACTIVE | SUSPENDED"
        datetime created_at "Default now"
        datetime updated_at "Auto update"
    }

    patient_profiles {
        string id PK "UUID"
        string user_id FK,UK "Cascade delete"
        datetime date_of_birth "Nullable"
        string gender "Nullable"
        string phone_number "Nullable"
        string emergency_contact "Nullable"
        string blood_group "Nullable"
        string allergies "Nullable"
        datetime created_at
        datetime updated_at
    }

    doctor_profiles {
        string id PK "UUID"
        string user_id FK,UK "Cascade delete"
        string qualifications "e.g. BAMS, MD"
        string specialization "e.g. Panchakarma"
        int experience_years "Nullable"
        string bio "Nullable"
        decimal consultation_fee "Decimal(10,2)"
        DoctorVerificationStatus verification_status "PENDING | VERIFIED | REJECTED"
        datetime created_at
        datetime updated_at
    }

    availability_slots {
        string id PK "UUID"
        string doctor_id FK "Restrict delete"
        datetime start_time "Indexed"
        datetime end_time "CHECK: end_time > start_time"
        SlotStatus status "AVAILABLE | RESERVED | BOOKED | CANCELLED"
        datetime created_at
        datetime updated_at
    }

    consultations {
        string id PK "UUID"
        string patient_id FK "Restrict delete"
        string doctor_id FK "Restrict delete"
        string slot_id FK,UK "1-to-1 Slot Restrict delete"
        ConsultationStatus status "SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED | NO_SHOW"
        datetime scheduled_at "Indexed"
        datetime started_at "Nullable"
        datetime completed_at "Nullable"
        string cancellation_reason "Nullable"
        string notes "Nullable"
        datetime created_at
        datetime updated_at
    }

    prescriptions {
        string id PK "UUID"
        string consultation_id FK "Restrict delete"
        string prescribing_doctor_id FK "Restrict delete"
        jsonb medicines "Array of medication details"
        string dosage_instructions "Frequency & timing"
        string advice "Dietary & lifestyle advice"
        datetime created_at
        datetime updated_at
    }

    payments {
        string id PK "UUID"
        string consultation_id FK,UK "1-to-1 Restrict delete"
        decimal amount "Decimal(10,2) precise currency"
        string currency "Default 'INR'"
        PaymentStatus status "PENDING | COMPLETED | FAILED | REFUNDED"
        string provider_reference UK "Nullable payment gateway ref"
        datetime created_at
        datetime updated_at
    }

    audit_logs {
        string id PK "UUID"
        string actor_id FK "Nullable (Set Null delete)"
        string action "Event action name"
        string entity_type "Entity name"
        string entity_id "Entity ID"
        jsonb metadata "Sanitized audit details"
        string ip_address "Nullable"
        string user_agent "Nullable"
        datetime created_at
    }

    refresh_sessions {
        string id PK "UUID"
        string user_id FK "Cascade delete"
        string token_hash UK "Cryptographic hash"
        datetime expires_at
        datetime revoked_at "Nullable"
        datetime created_at
    }
```
