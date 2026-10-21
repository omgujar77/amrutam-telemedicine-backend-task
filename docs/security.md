# Security Architecture & Threat Model (Phase 7)

## 1. Overview

This document describes the security controls, cryptographic safeguards, multi-factor authentication (MFA) workflows, and authorization boundaries implemented in the **Amrutam Telemedicine Backend**.

---

## 2. Threat Model & Mitigations

| Threat | Risk Level | Mitigation Strategy | Implemented In |
|---|---|---|---|
| **Privileged Account Takeover** | Critical | RFC 6238 TOTP Multi-Factor Authentication (MFA) with AES-256-GCM encrypted secrets at rest. | `src/modules/auth/mfa.service.js`, `requireMfa` middleware |
| **Insecure Direct Object Reference (IDOR)** | High | Explicit resource ownership verification linking authenticated `userId` to Consultation and Prescription records. | `consultation.service.js`, `prescription.service.js` |
| **Credential & Secret Exposure** | High | Multi-level Pino logger redaction censoring passwords, tokens, MFA secrets, and sensitive HTTP headers. | `src/common/logger/logger.js` |
| **Cryptographic Key Reuse** | High | Zod schema validation enforcing distinct keys for access tokens, refresh tokens, and MFA encryption. | `src/config/env.js` |
| **MFA Brute-Force / Spraying** | Medium | Dedicated `mfaRateLimiter` restricting verification attempts to 5 per 15-minute window. | `src/common/middleware/rateLimiter.js` |
| **Audit Log Tampering** | Medium | Public modification/deletion endpoints prohibited; logs captured atomically in database transactions. | `src/common/audit/audit.service.js` |
| **Client-Side Authorization Bypassing** | Critical | Server-side verification of cryptographically signed JWT claim (`payload.mfaVerified`). | `src/modules/auth/auth.middleware.js` |

---

## 3. Cryptographic Separation & Keys

The system enforces cryptographic separation of concerns. A single secret is never reused across multiple purposes:

- `JWT_ACCESS_SECRET`: Minimum 32-character symmetric secret used exclusively to sign short-lived access tokens (`15m`).
- `JWT_REFRESH_SECRET`: Minimum 32-character secret used to validate long-lived refresh sessions (`7d`).
- `MFA_ENCRYPTION_KEY`: Minimum 32-character AES-256 key used exclusively to encrypt TOTP secrets at rest (`AES-256-GCM`).

In production environments (`NODE_ENV=production`), development fallback keys are strictly rejected at startup.

---

## 4. Multi-Factor Authentication Architecture

### 4.1. Supported Roles
MFA enrollment is restricted to privileged roles (`ADMIN`, `DOCTOR`). Non-privileged patient accounts are prevented from enrolling in privileged MFA.

### 4.2. At-Rest Encryption
TOTP secrets are stored in the `UserMfa` table with `AES-256-GCM` authenticated encryption. Format:
`iv_hex:auth_tag_hex:ciphertext_hex`
Any ciphertext tampering results in an authentication tag verification failure upon decryption.

### 4.3. Privilege Gatekeeper (`requireMfa`)
Protected operations under `/api/v1/admin/*` require:
1. `authenticate`: Valid JWT access token.
2. `authorize('ADMIN')`: User role must be `ADMIN`.
3. `requireMfa`: `req.user.mfaVerified === true`.

---

## 5. Security Checklist

- [x] TOTP MFA implemented using standard RFC 6238 library (`@otplib`).
- [x] Secrets stored encrypted with AES-256-GCM at rest.
- [x] Privileged admin routes enforce `requireMfa`.
- [x] Passwords, tokens, codes, and headers redacted from Pino logs.
- [x] Environment variables validated via Zod with key separation enforcement.
- [x] IDOR checks verify patient and doctor ownership before data access.
- [x] Audit logs record security events atomically in transactions.
- [x] Dependency vulnerability scan completed (`npm audit`).
