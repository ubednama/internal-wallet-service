export const TRANSACTION_LIMITS = {
  MAX_AMOUNT: 1_000_000_000
} as const;

export const RATE_LIMITS = {
  TRANSACTION: {
    windowMs: 15 * 60 * 1000,
    max: 100
  },
  BALANCE_QUERY: {
    windowMs: 15 * 60 * 1000,
    max: 1000
  }
} as const;

export const IDEMPOTENCY = {
  CACHE_TTL: 60 * 60 * 24, // 24 hours
  PROCESSING_TTL: 10       // 10 seconds
} as const;

export const SYSTEM_USERS = {
  TREASURY_EMAIL: 'treasury@system.internal'
} as const;
