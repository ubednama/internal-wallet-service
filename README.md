# Internal Wallet Service

A closed-loop virtual wallet service for gaming/loyalty platforms. Manages virtual credits (Gold Coins, Diamonds, etc.) with guaranteed data integrity under high concurrency.

## Tech Stack

| Layer      | Choice                         | Why                                                                                 |
| ---------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| Runtime    | Node.js / TypeScript (Express) | Async, non-blocking I/O; type safety reduces runtime bugs                           |
| Database   | PostgreSQL (ACID)              | Atomic transactions, row-level locking, constraint guarantees                       |
| ORM        | Prisma v7                      | Type-safe schema; bypassed with `$executeRaw` for `SELECT … FOR UPDATE`             |
| Cache      | Redis (`ioredis`)              | Sub-millisecond idempotency checks — first line of defense before touching Postgres |
| Validation | Zod v4                         | Runtime schema validation + inferred TypeScript types                               |

## Architecture Highlights

### Double-Entry Ledger

Every balance change creates **two immutable ledger entries** — a `DEBIT` from the source and a `CREDIT` to the destination. The `wallets.balance` column is a cached snapshot for fast O(1) reads; the `ledger_entries` table is the authoritative audit trail.

```text
SPEND 30 GOLD:
  ledger_entry: wallet=alice,    type=DEBIT,  amount=30, balance_after=470
  ledger_entry: wallet=treasury, type=CREDIT, amount=30, balance_after=999999970
```

### Concurrency & Deadlock Avoidance

**Race conditions** — solved with **pessimistic row-level locking**:

```sql
SET LOCAL lock_timeout = '5s';   -- fail fast, never hang
SELECT id FROM wallets WHERE user_id IN ($1, $2) AND asset_id = $3 FOR UPDATE;
```

Locks are always acquired in **alphabetical `user_id` order** to prevent circular deadlocks.

**Retry on deadlock** — the service automatically retries up to 3× with exponential backoff on Postgres error codes `40P01` (deadlock detected) and `55P03` (lock not available).

**Duplicate requests** — two-layer idempotency:

1. **Redis (`SETNX`)** — rejects or returns cached result in < 1 ms
2. **Postgres `UNIQUE` on `idempotency_key`** — fallback if Redis misses

All mutating endpoints require an `Idempotency-Key` header.

## Setup

### Prerequisites

- Node.js 18+, PostgreSQL, Redis

### 1. Environment

```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://user:password@localhost:5432/wallet_db"
REDIS_URL="redis://localhost:6379"
LOG_LEVEL=debug
```

> Supabase? Add `DIRECT_URL` alongside `DATABASE_URL` (pooled).

### 2. Install & Run the all-in-one setup script

```bash
npm install
sh setup.sh
```

This will:

1. Create all tables (`db_init.sql`)
2. Seed initial data (`seed.sql`) — assets, treasury, and 3 test users

### 3. Run

```bash
npm run dev      # development (hot-reload)
npm run build    # compile TypeScript
npm start        # production
```

## Seeded Test Users

| Name            | ID                                     | Asset   | Balance       |
| --------------- | -------------------------------------- | ------- | ------------- |
| System Treasury | `00000000-0000-0000-0000-000000000001` | GOLD    | 1,000,000,000 |
| System Treasury | `00000000-0000-0000-0000-000000000001` | DIAMOND | 1,000,000,000 |
| Alice           | `00000000-0000-0000-0000-000000000002` | GOLD    | 500           |
| Bob             | `00000000-0000-0000-0000-000000000003` | GOLD    | 1,000         |
| Charlie         | `00000000-0000-0000-0000-000000000004` | DIAMOND | 50            |

## 🚀 Live Deployment

**Base URL:** `https://internal-wallet-service-j441.onrender.com`

The application is live and running on Render with:

- **Database:** Supabase PostgreSQL
- **Cache:** Upstash Redis
- **Hosting:** Render Web Service

**Infrastructure Stack:**

- Frontend: API endpoints (REST)
- Backend: Node.js + Express + TypeScript
- Database: Supabase (PostgreSQL)
- Cache: Upstash (Redis)
- Deployment: Render (Docker container)

## API

Base path: `http://localhost:3000/api/v1/wallets` (local) or `https://internal-wallet-service-j441.onrender.com/api/v1/wallets` (production)

All mutating requests require header: `Idempotency-Key: <uuid>`

## 📬 Postman Collection

Import and test all endpoints using the Postman collection:

**[Postman Collection Link](https://dark-eclipse-727260.postman.co/workspace/wallet-service~287822a4-bcc6-4b58-8f4c-a6b54d1f5f9e/collection/32782602-be8b1c97-8b6f-4a7f-a1e1-7c8da234fca3?action=share&creator=32782602)**

Steps to import:

1. Open the Postman link above
2. Click **"Run in Postman"** (or manually import to your workspace)
3. All endpoints are pre-configured with:
   - Correct headers (Idempotency-Key)
   - Environment variables for live/local URLs
   - Example request/response bodies

| Method | Endpoint                       | Description                        |
| ------ | ------------------------------ | ---------------------------------- |
| `GET`  | `/health`                      | Service health                     |
| `GET`  | `/:userId/balance?asset=GOLD`  | Get wallet balance                 |
| `GET`  | `/:userId/ledger?asset=GOLD`   | Double-entry ledger (paginated)    |
| `POST` | `/transactions`                | Execute TOP_UP / BONUS / SPEND     |
| `GET`  | `/:userId/transactions`        | Transaction history (paginated)    |
| `GET`  | `/transactions/:transactionId` | Get single transaction with ledger |

### POST `/transactions` — Request Body

```json
{
    "userId": "00000000-0000-0000-0000-000000000002",
    "type": "TOP_UP",
    "amount": 100,
    "assetSymbol": "GOLD"
}
```

`type` is one of: `TOP_UP` | `BONUS` | `SPEND`

### Success Response

```json
{
    "status": "SUCCESS",
    "txId": "a1b2c3d4-...",
    "balance": "600"
}
```

### Ledger Response (`GET /:userId/ledger`)

```json
{
    "entries": [
        {
            "id": "...",
            "entryType": "CREDIT",
            "amount": "100.0000",
            "balanceAfter": "600.0000",
            "assetSymbol": "GOLD",
            "txId": "...",
            "txType": "TOP_UP",
            "createdAt": "2026-02-23T00:00:00.000Z"
        }
    ],
    "pagination": { "total": 1, "limit": 50, "offset": 0, "returned": 1, "hasMore": false }
}
```

Import `postman_collection.json` for a ready-to-use collection with all endpoints and example responses.

## Project Structure

```text
src/
├── lib/                    logger, prisma, redis, env, shutdown
├── controllers/            wallet.controller.ts
├── services/               wallet.service.ts
├── routes/                 v1/wallet.routes.ts
├── middleware/             logging, rate-limit, response
├── validators/             transaction.validator.ts
├── utils/                  idempotency.ts
├── types/                  enums.ts, express.d.ts
├── errors/                 app-error.ts
└── constants/              index.ts
```
