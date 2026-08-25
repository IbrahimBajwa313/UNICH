export async function api<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw err instanceof Error ? err : new Error("Network request failed");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(
      (data as { error?: string }).error || `Request failed (${res.status})`,
    ) as Error & { status?: number; data?: unknown };
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data as T;
}
