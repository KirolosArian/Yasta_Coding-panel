# Project: Yasta_Coding Panel

## Architecture
Yasta_Coding Panel is a modern, high-performance, serverless-ready software licensing, device management, and reseller dashboard system.
It provides complete brand eradication from legacy panels, isolating all data into MongoDB namespace `Yasta_Coding_DB`.

### Key System Specifications
- **Database Namespace**: `Yasta_Coding_DB`
- **Environment Variable**: `YASTA_MONGODB_URI`
- **Collections**:
  - `yasta_keys` (Key licensing, HWID binding, device limits, link attachments: `modUrl`, `origUrl`, `originalFoldersZipUrl`, `customFoldersZipUrl`, status, expiry)
  - `yasta_users` (Admin and reseller management, credit balances, roles, bcrypt credentials)
  - `yasta_logs` (Security and audit trails, action types, timestamps, client IPs)
  - `yasta_settings` (Global app settings, maintenance toggle, version enforcement, Discord webhook integration)
- **API Engine**:
  - Serverless architecture for Vercel deployment with connection pooling (`api/_db.js`)
  - Endpoints:
    - `/api/auth` (login, me, logout, password change)
    - `/api/keys` (generate, list, update, reset-hwid, bulk-actions, delete, lifetime key support)
    - `/api/users` (reseller management, credit adjustments, list, ban)
    - `/api/system` (stats, telemetry, settings, discord webhook)
    - `/api/validate` (client authentication, HWID lock, device limit enforcement, link attachments payload, HMAC token security)
- **Frontend UI**:
  - Dark cosmic glassmorphic design language (`#07090e`, glowing cyan & neon purple accents, backdrop-filter blur)
  - Pages:
    - `index.html` (Cyber authentication gateway)
    - `dashboard.html` (Executive overview, metrics, quick key generator, live activity)
    - `keys.html` (Full license management, HWID reset, filters, link attachment viewer/editor, bulk generator)
    - `manage-user.html` (Reseller & administrator operations, credit allocation)
    - `logs.html` (Security audit trails, filterable by action and IP)
    - `settings.html` (System preferences, Discord webhook, download URLs, maintenance switch)
- **Deployment**:
  - Vercel zero-config serverless deployment (`vercel.json`, `package.json`, environment definitions).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Brand & Database Isolation | Models, schemas, DB connection cache, zero legacy references | None | DONE |
| 2 | Serverless API Implementation | Auth, Keys, Users, System, and Client Validate endpoints with HMAC & link attachments | M1 | DONE |
| 3 | Modern UI & Responsive Dashboard | Cyber-glassmorphism pages (index, dashboard, keys, manage-user, logs, settings) | M1, M2 | DONE |
| 4 | Vercel Deployment Configuration | vercel.json, package.json, zero-config serverless compatibility | M2, M3 | DONE |
| 5 | Verification & Testing | Reviewer APPROVE, Challenger PASS, Forensic Auditor CLEAN | M1..M4 | DONE |

## Interface Contracts
### Client ↔ `/api/validate`
- **Request**: `POST /api/validate`
  ```json
  {
    "key": "YASTA-XXXX-XXXX-XXXX",
    "hwid": "HARDWARE-UUID-HASH",
    "clientVersion": "1.0.0"
  }
  ```
- **Response (Success)**:
  ```json
  {
    "success": true,
    "status": "active",
    "token": "<HMAC_SHA256_TOKEN>",
    "expiresAt": "2026-10-05T12:00:00.000Z",
    "remainingDays": 30,
    "links": {
      "modUrl": "...",
      "origUrl": "...",
      "originalFoldersZipUrl": "...",
      "customFoldersZipUrl": "..."
    }
  }
  ```
