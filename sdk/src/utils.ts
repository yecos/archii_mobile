// ============================================================================
// Archii SDK - Utility Functions
// ============================================================================

/**
 * Returns a promise that resolves after the specified delay.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff.
 *
 * @param fn - The async function to retry
 * @param attempts - Maximum number of attempts (default: 3)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @param shouldRetry - Optional predicate to determine if the error is retryable
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  attempts: number = 3,
  baseDelay: number = 1000,
  shouldRetry?: (error: Error) => boolean
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt < attempts && (shouldRetry?.(lastError) ?? true)) {
        const jitter = Math.random() * 0.3;
        const backoffDelay = baseDelay * Math.pow(2, attempt - 1) * (1 + jitter);
        await delay(Math.round(backoffDelay));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error('retryWithBackoff: unexpected state');
}

/**
 * Format a Date object or date string to ISO 8601 format.
 */
export function formatDate(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${String(date)}`);
  }
  return d.toISOString();
}

/**
 * Parse an ISO date string into a Date object.
 */
export function parseDate(dateStr: string): Date {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return d;
}

/**
 * Build a URL query string from a params object.
 * Filters out undefined and null values.
 */
export function buildQueryString(params?: unknown): string {
  if (!params || typeof params !== 'object') return '';
  if (Object.keys(params).length === 0) {
    return '';
  }

  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== '') {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
        }
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/**
 * Deep merge two objects. Values from `source` override `target` for primitive
 * values, and objects are recursively merged.
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal !== undefined &&
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== undefined &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      ) as T[keyof T];
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T];
    }
  }

  return result;
}

/**
 * Remove null and undefined fields from an object, producing a clean
 * object suitable for JSON serialization / API payloads.
 */
export function sanitizeOutput<T extends Record<string, unknown>>(data: T): Partial<T> {
  if (Array.isArray(data)) {
    return data.map((item) =>
      typeof item === 'object' && item !== null && !Array.isArray(item)
        ? sanitizeOutput(item as Record<string, unknown>)
        : item
    ) as unknown as Partial<T>;
  }

  const result: Partial<T> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      value !== null
    ) {
      const sanitized = sanitizeOutput(value as Record<string, unknown>);
      if (Object.keys(sanitized).length > 0) {
        result[key as keyof T] = sanitized as T[keyof T];
      }
    } else {
      result[key as keyof T] = value as T[keyof T];
    }
  }

  return result;
}

/**
 * Check if the given status code indicates a retryable error (429 or 5xx).
 */
export function isRetryableStatus(statusCode: number): boolean {
  return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
}
