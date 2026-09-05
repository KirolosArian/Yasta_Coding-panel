# Yasta_Coding Panel

A next-generation, high-performance software licensing, device management, and reseller dashboard system built for serverless deployment on Vercel with MongoDB.

---

## Features

- **Total Brand & Database Isolation**:
  - Namespace: `Yasta_Coding_DB`
  - Collections: `yasta_keys`, `yasta_users`, `yasta_logs`, `yasta_settings`
  - Environment configuration driven by `YASTA_MONGODB_URI`
- **Serverless API Architecture**:
  - Global Mongoose connection pooling (`api/_db.js`) preventing connection exhaustion on Vercel serverless lambdas.
  - Endpoints:
    - `/api/auth`: Login, profile, password modification, JWT tokens.
    - `/api/keys`: Key generation, multi-device management, HWID reset, link attachments, bulk export/delete.
    - `/api/users`: Reseller administration, balance/credit top-up, status moderation.
    - `/api/system`: System stats, telemetry, Discord webhook integration, maintenance mode.
    - `/api/validate`: High-throughput client verification endpoint with HWID locking, device limits, link attachments payload (`modUrl`, `origUrl`, `originalFoldersZipUrl`, `customFoldersZipUrl`), and HMAC-SHA256 signature tokens.
- **Cyber-Glassmorphic UI**:
  - Dark cosmic background (`#07090e`), translucent blurred cards, glowing cyan (`#00f0ff`) and purple (`#a855f7`) accents.
  - Responsive dashboards:
    - `index.html`: Portal authentication gateway.
    - `dashboard.html`: Command center with metrics, live logs, quick key generator.
    - `keys.html`: Full license keys table, search, filters, HWID reset, link attachment editor, and export.
    - `manage-user.html`: Reseller & administrator operations and credit management.
    - `logs.html`: Comprehensive security and audit trail.
    - `settings.html`: System configuration, Discord webhook test, and maintenance mode.
- **Zero-Config Vercel Deployment**:
  - Clean `vercel.json` rewrites and automated serverless routing.

---

## Environment Variables

Configure the following environment variables (e.g. in `.env` or Vercel Project Settings):

```env
# MongoDB Connection String (targeting Yasta_Coding_DB)
YASTA_MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/Yasta_Coding_DB?retryWrites=true&w=majority

# JWT Authentication Secret
JWT_SECRET=yasta_super_secret_jwt_key_2026

# Client Validation HMAC Secret
HMAC_SECRET=yasta_client_hmac_secret_key_2026

# Server Port (Local execution)
PORT=3000
```

---

## Local Development & Testing

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000` in your browser.
4. Default administrator credentials (automatically seeded if no admin exists):
   - **Username**: `admin`
   - **Password**: `admin123456`

---

## Client Validation Integration Example

When client software (C++, C#, Python, or Android) authenticates against the panel:

### POST `/api/validate`
**Request Body**:
```json
{
  "key": "YASTA-ABCD-1234-EFGH",
  "hwid": "d41d8cd98f00b204e9800998ecf8427e",
  "clientVersion": "1.0.0"
}
```

**Response**:
```json
{
  "success": true,
  "status": "active",
  "token": "a5f8c9...",
  "expiresAt": "2026-10-05T12:00:00.000Z",
  "remainingDays": 30,
  "links": {
    "modUrl": "https://cdn.example.com/mod.apk",
    "origUrl": "https://cdn.example.com/orig.apk",
    "originalFoldersZipUrl": "https://cdn.example.com/original.zip",
    "customFoldersZipUrl": "https://cdn.example.com/custom.zip"
  }
}
```
