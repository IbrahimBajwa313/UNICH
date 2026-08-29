import { connectDB } from "@/lib/db";
import { RateLimit } from "@/lib/models";
import { RATE_LIMIT } from "@/lib/auth/rateLimitConfig";

type WindowResult = {
  blocked: boolean;
  remaining: number;
  resetAt: Date;
};

async function checkWindow(
  key: string,
  maxAttempts: number,
  windowMs: number,
): Promise<WindowResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  const doc = await RateLimit.findOne({ key }).lean();
  if (!doc || !(doc.attempts as Date[]).length) {
    return { blocked: false, remaining: maxAttempts, resetAt: new Date(now.getTime() + windowMs) };
  }

  const recent = (doc.attempts as Date[])
    .filter((t) => t > windowStart)
    .sort((a, b) => a.getTime() - b.getTime());

  const count = recent.length;
  const oldest = recent[0];
  const resetAt = oldest
    ? new Date(oldest.getTime() + windowMs)
    : new Date(now.getTime() + windowMs);

  return {
    blocked: count >= maxAttempts,
    remaining: Math.max(0, maxAttempts - count),
    resetAt,
  };
}

async function recordAttempt(key: string, windowMs: number): Promise<void> {
  const now = new Date();
  await RateLimit.findOneAndUpdate(
    { key },
    {
      $push: { attempts: now },
      $set: { expiresAt: new Date(now.getTime() + windowMs) },
    },
    { upsert: true },
  );
}

async function clearAttempts(key: string): Promise<void> {
  await RateLimit.deleteOne({ key });
}

export type LoginRateLimitCheck = {
  blocked: boolean;
  retryAfterSec: number;
  remaining: number;
  resetAt: Date;
};

export async function checkLoginRateLimit(
  email: string,
): Promise<LoginRateLimitCheck> {
  await connectDB();

  const result = await checkWindow(
    `email:${email}`,
    RATE_LIMIT.account.maxAttempts,
    RATE_LIMIT.account.windowMs,
  );

  const retryAfterSec = result.blocked
    ? Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000))
    : 0;

  return {
    blocked: result.blocked,
    retryAfterSec,
    remaining: result.remaining,
    resetAt: result.resetAt,
  };
}

export async function recordFailedLogin(email: string): Promise<void> {
  await connectDB();
  await recordAttempt(`email:${email}`, RATE_LIMIT.account.windowMs);
}

export async function clearLoginAttempts(email: string): Promise<void> {
  await connectDB();
  await clearAttempts(`email:${email}`);
}
