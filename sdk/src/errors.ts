// ============================================================================
// Archii SDK - Custom Error Classes
// ============================================================================

/**
 * Base error class for all Archii SDK errors.
 */
export class ArchiiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly requestId?: string;
  public readonly timestamp: string;
  public readonly isArchiiError: true = true;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'UNKNOWN_ERROR',
    requestId?: string
  ) {
    super(message);
    this.name = 'ArchiiError';
    this.statusCode = statusCode;
    this.code = code;
    this.requestId = requestId;
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Create an ArchiiError from an HTTP response.
   */
  static async fromResponse(
    response: Response,
    body?: unknown
  ): Promise<ArchiiError> {
    const parsed = body as Record<string, unknown> | null;
    const message =
      (parsed?.message as string) ||
      `HTTP ${response.status}: ${response.statusText}`;
    const code =
      (parsed?.code as string) || `HTTP_${response.status}`;
    const requestId = (parsed?.requestId as string) || response.headers.get('x-request-id') || undefined;

    switch (response.status) {
      case 400:
        return new ValidationError(message, parsed?.details as ValidationErrorDetail[]);
      case 401:
        return new AuthenticationError(message);
      case 404:
        return new NotFoundError(message, code);
      case 429: {
        const retryAfter =
          response.headers.get('retry-after') ||
          (parsed?.retryAfter as string | number) ||
          undefined;
        return new RateLimitError(
          message,
          retryAfter ? parseInt(String(retryAfter), 10) : undefined
        );
      }
      default:
        if (response.status >= 500) {
          return new ServerError(message, response.status, requestId);
        }
        return new ArchiiError(message, response.status, code, requestId);
    }
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      requestId: this.requestId,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Thrown when authentication fails (401).
 */
export class AuthenticationError extends ArchiiError {
  constructor(message: string = 'Authentication failed. Check your API key.') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

/**
 * Thrown when rate limit is exceeded (429).
 */
export class RateLimitError extends ArchiiError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded. Please retry later.', retryAfter?: number) {
    super(message, 429, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Thrown when a resource is not found (404).
 */
export class NotFoundError extends ArchiiError {
  public readonly resourceType?: string;
  public readonly resourceId?: string;

  constructor(
    message: string = 'Resource not found.',
    code: string = 'NOT_FOUND',
    resourceType?: string,
    resourceId?: string
  ) {
    super(message, 404, code);
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }

  static forResource(type: string, id: string): NotFoundError {
    return new NotFoundError(
      `${type} with ID '${id}' was not found.`,
      `${type.toUpperCase()}_NOT_FOUND`,
      type,
      id
    );
  }
}

/**
 * Thrown when request validation fails (400).
 */
export class ValidationError extends ArchiiError {
  public readonly details: ValidationErrorDetail[];

  constructor(
    message: string = 'Validation failed.',
    details: ValidationErrorDetail[] = []
  ) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.details = details;
  }
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
  code?: string;
  value?: unknown;
}

/**
 * Thrown when the server returns a 5xx error.
 */
export class ServerError extends ArchiiError {
  constructor(
    message: string = 'Internal server error.',
    statusCode: number = 500,
    requestId?: string
  ) {
    super(message, statusCode, 'SERVER_ERROR', requestId);
    this.name = 'ServerError';
  }
}

/**
 * Thrown on network-level errors (connection refused, timeout, DNS failure).
 */
export class NetworkError extends ArchiiError {
  public readonly cause?: Error;

  constructor(
    message: string = 'Network error. Check your connection.',
    cause?: Error
  ) {
    super(message, 0, 'NETWORK_ERROR');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/**
 * Type guard to check if an error is an Archii SDK error.
 */
export function isArchiiError(error: unknown): error is ArchiiError {
  return error instanceof ArchiiError ||
    (typeof error === 'object' && error !== null && (error as Record<string, unknown>).isArchiiError === true);
}
