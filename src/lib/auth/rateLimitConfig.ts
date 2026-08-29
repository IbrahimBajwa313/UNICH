/** Shared between backend enforcement and frontend display — keep in sync. */
export const RATE_LIMIT = {
  account: {
    maxAttempts: 8,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
} as const;

/** Show "X attempts remaining" warning when at or below this threshold. */
export const WARN_REMAINING = 2;
