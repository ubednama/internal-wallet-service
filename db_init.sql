CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;

DROP TABLE IF EXISTS ledger_entries CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS assets CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- users
CREATE TABLE IF NOT EXISTS users (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(100) NOT NULL,
    email      VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- assets
CREATE TABLE IF NOT EXISTS assets (
    id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(50)  NOT NULL UNIQUE,
    name   VARCHAR(100) NOT NULL
);

-- wallets  (one per user × asset)
CREATE TABLE IF NOT EXISTS wallets (
    id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID          NOT NULL REFERENCES users(id)  ON DELETE RESTRICT ON UPDATE CASCADE,
    asset_id   UUID          NOT NULL REFERENCES assets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    balance    DECIMAL(18,4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, asset_id)
);

-- transactions  (one per atomic transfer)
CREATE TABLE IF NOT EXISTS transactions (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255)  NOT NULL UNIQUE,
    from_wallet_id  UUID          NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    to_wallet_id    UUID          NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    amount          DECIMAL(18,4) NOT NULL CHECK (amount > 0),
    type            VARCHAR(50)   NOT NULL,
    status          VARCHAR(50)   NOT NULL DEFAULT 'SUCCESS',
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_wallets
    ON transactions(from_wallet_id, to_wallet_id);

-- ledger_entries
CREATE TABLE IF NOT EXISTS ledger_entries (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID          NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    wallet_id      UUID          NOT NULL REFERENCES wallets(id)      ON DELETE RESTRICT ON UPDATE CASCADE,
    entry_type     VARCHAR(10)   NOT NULL CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    amount         DECIMAL(18,4) NOT NULL CHECK (amount > 0),
    balance_after  DECIMAL(18,4) NOT NULL,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_wallet_time
    ON ledger_entries(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_transaction
    ON ledger_entries(transaction_id);
