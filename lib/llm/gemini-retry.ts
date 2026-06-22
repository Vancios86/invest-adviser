const RETRYABLE_PATTERN =
  /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|rate limit/i;

export function isRetryableGeminiError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return RETRYABLE_PATTERN.test(String(error));
  }

  const err = error as { status?: number; message?: string; name?: string };
  if (err.status === 429 || err.status === 503) return true;

  const message = String(err.message ?? error);
  return RETRYABLE_PATTERN.test(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  options?: { maxAttempts?: number; baseDelayMs?: number },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1200;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryableGeminiError(error)) {
        throw error;
      }

      const jitter = Math.random() * 400;
      await delay(baseDelayMs * 2 ** (attempt - 1) + jitter);
    }
  }

  throw lastError;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      try {
        const value = await fn(items[index]!, index);
        results[index] = { status: "fulfilled", value };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
