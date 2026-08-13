/** Hard budget for auth API + client wait (ms). */
export const AUTH_TIMEOUT_MS = 3000;

/**
 * Race a promise against a deadline. Clears the timer on settle.
 * Used so login /me never hang beyond AUTH_TIMEOUT_MS.
 */
export async function withAuthTimeout<T>(
  work: Promise<T>,
  label = "Authentication",
  ms: number = AUTH_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `${label} is taking too long (>${Math.round(ms / 1000)}s). Check your connection and try again.`,
        ),
      );
    }, ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
