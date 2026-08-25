"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AUTH_TIMEOUT_MS } from "@/lib/auth/timeout";
import { WARN_REMAINING } from "@/lib/auth/rateLimitConfig";

// Persisted across refresh so a locked-out user can't dodge the countdown by reloading.
const LOCKOUT_STORAGE_KEY = "unich_login_lockout";

export default function LoginClient() {
  const search = useSearchParams();
  const from = search.get("from") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Rate limit state
  const [retryUntil, setRetryUntil] = useState<number | null>(null); // epoch ms
  const [retryIn, setRetryIn] = useState(0); // seconds remaining
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function persistLockout(untilMs: number, forEmail: string) {
    try {
      window.localStorage.setItem(
        LOCKOUT_STORAGE_KEY,
        JSON.stringify({ email: forEmail, retryUntil: untilMs }),
      );
    } catch {
      // storage unavailable (private mode, etc.) — countdown still works in-memory
    }
  }

  function clearPersistedLockout() {
    try {
      window.localStorage.removeItem(LOCKOUT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  // Restore an in-progress lockout after a page refresh instead of letting the
  // countdown silently reset to 0. localStorage doesn't exist during SSR, so
  // this one-time sync from an external store has to happen post-mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LOCKOUT_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { email?: string; retryUntil?: number };
      if (saved.retryUntil && saved.retryUntil > Date.now()) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRetryUntil(saved.retryUntil);
        setAttemptsRemaining(0);
        if (saved.email) setEmail(saved.email);
      } else {
        clearPersistedLockout();
      }
    } catch {
      // malformed storage — ignore and start fresh
    }
  }, []);

  // Countdown tick
  useEffect(() => {
    if (!retryUntil) return;

    function tick() {
      const secs = Math.ceil(((retryUntil as number) - Date.now()) / 1000);
      if (secs <= 0) {
        setRetryUntil(null);
        setRetryIn(0);
        setError(null);
        clearPersistedLockout();
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setRetryIn(secs);
      }
    }

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [retryUntil]);

  useEffect(() => {
    void fetch("/api/health", { cache: "no-store" }).catch(() => {});
  }, []);

  function formatCountdown(secs: number) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  const isRateLimited = retryUntil !== null && retryIn > 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    // Frontend guard: don't even hit the server if we know we're blocked.
    if (isRateLimited) return;

    setError(null);
    setAttemptsRemaining(null);
    setBusy(true);

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
        cache: "no-store",
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        attemptsRemaining?: number;
      };

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "900", 10);
        const until = Date.now() + retryAfter * 1000;
        setRetryUntil(until);
        setAttemptsRemaining(0);
        setError(null); // countdown banner replaces error
        persistLockout(until, email);
        return;
      }

      if (!res.ok) {
        setError(data.error || `Login failed (${res.status})`);

        // Sync remaining attempts from backend header
        const headerRemaining = res.headers.get("X-RateLimit-Remaining");
        const remaining =
          data.attemptsRemaining ??
          (headerRemaining !== null ? parseInt(headerRemaining, 10) : null);
        setAttemptsRemaining(remaining !== null && remaining <= WARN_REMAINING ? remaining : null);
        return;
      }

      // Success — hard navigate so the HttpOnly cookie is sent on the next request.
      const dest = from.startsWith("/") && !from.startsWith("//") ? from : "/";
      window.location.assign(dest);
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      setError(
        aborted
          ? "Login is taking too long (>3s). Check your connection and try again."
          : err instanceof Error
            ? err.message
            : "Login failed",
      );
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-canvas px-4">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgb(123 97 255 / 12%), transparent 60%)",
        }}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-paper p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, #9b87ff 0%, #7b61ff 55%, #f5f5f7 140%)",
            }}
          >
            U
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            U-niche Perfumes
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Sign in with your role account (BRN-08)
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@unich.com"
            required
            disabled={isRateLimited}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            disabled={isRateLimited}
          />

          {/* Rate limited — show countdown */}
          {isRateLimited ? (
            <p className="rounded-lg border border-amber-300/40 bg-amber-50/60 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-400">
              Too many failed attempts. Try again in{" "}
              <span className="font-semibold tabular-nums">
                {formatCountdown(retryIn)}
              </span>
              .
            </p>
          ) : (
            <>
              {/* Low attempts warning */}
              {attemptsRemaining !== null && attemptsRemaining > 0 && (
                <p className="rounded-lg border border-amber-300/40 bg-amber-50/60 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-400">
                  Warning:{" "}
                  <span className="font-semibold">{attemptsRemaining}</span>{" "}
                  {attemptsRemaining === 1 ? "attempt" : "attempts"} remaining
                  before temporary lockout.
                </p>
              )}

              {/* Regular error */}
              {error ? (
                <p className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
                  {error}
                </p>
              ) : null}
            </>
          )}

          <Button
            type="submit"
            variant="gold"
            className="w-full"
            disabled={busy || isRateLimited}
          >
            {busy ? "Logging in…" : isRateLimited ? `Locked (${formatCountdown(retryIn)})` : "Login"}
          </Button>
        </form>
      </div>
    </div>
  );
}
