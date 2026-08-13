"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { AUTH_TIMEOUT_MS } from "@/lib/auth/timeout";

export default function LoginClient() {
  const search = useSearchParams();
  const from = search.get("from") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Warm Next compile + Mongo pool while the user types credentials.
    void fetch("/api/health", { cache: "no-store" }).catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => controller.abort(),
      AUTH_TIMEOUT_MS,
    );
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });
      // Hard navigation so the new HttpOnly cookie is on the next document
      // request. Soft router.replace often bounced users back to /login once.
      const dest = from.startsWith("/") && !from.startsWith("//") ? from : "/";
      window.location.assign(dest);
    } catch (err) {
      const aborted =
        err instanceof DOMException && err.name === "AbortError";
      setError(
        aborted
          ? "Login is taking too long (>3s). Check your connection and try again."
          : err instanceof Error
            ? err.message
            : "Login failed",
      );
      setBusy(false);
    } finally {
      window.clearTimeout(timer);
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
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          {error ? (
            <p className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="gold"
            className="w-full"
            disabled={busy}
          >
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
