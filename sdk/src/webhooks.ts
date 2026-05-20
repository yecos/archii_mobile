// ============================================================================
// Archii SDK - Webhook Handler
// ============================================================================

import { createHmac, timingSafeEqual } from 'crypto';
import type {
  WebhookPayload,
  WebhookEvent,
  Project,
  Task,
  Expense,
  RFI,
  Submittal,
} from './types';
import { ArchiiError } from './errors';

// ---- Webhook event data type mapping ----

export interface WebhookEventMap {
  [WebhookEvent.ProjectCreated]: Project;
  [WebhookEvent.ProjectUpdated]: Project;
  [WebhookEvent.ProjectDeleted]: Project;
  [WebhookEvent.ProjectStatusChanged]: Project;

  [WebhookEvent.TaskCreated]: Task;
  [WebhookEvent.TaskUpdated]: Task;
  [WebhookEvent.TaskDeleted]: Task;
  [WebhookEvent.TaskStatusChanged]: Task;
  [WebhookEvent.TaskAssigned]: Task;

  [WebhookEvent.ExpenseCreated]: Expense;
  [WebhookEvent.ExpenseUpdated]: Expense;
  [WebhookEvent.ExpenseDeleted]: Expense;
  [WebhookEvent.ExpenseStatusChanged]: Expense;

  [WebhookEvent.RFICreated]: RFI;
  [WebhookEvent.RFIUpdated]: RFI;
  [WebhookEvent.RFIAnswered]: RFI;
  [WebhookEvent.RFIClosed]: RFI;

  [WebhookEvent.SubmittalCreated]: Submittal;
  [WebhookEvent.SubmittalUpdated]: Submittal;
  [WebhookEvent.SubmittalApproved]: Submittal;
  [WebhookEvent.SubmittalRejected]: Submittal;
}

export type WebhookEventHandler<E extends WebhookEvent> = (
  payload: WebhookPayload<WebhookEventMap[E]>
) => void | Promise<void>;

export type WebhookEventHandlers = {
  [E in WebhookEvent]?: WebhookEventHandler<E>;
};

// ---- WebhookHandler ----

/**
 * Utility class for verifying and parsing incoming Archii webhooks.
 */
export class WebhookHandler {
  private readonly secret: string;

  constructor(secret: string) {
    if (!secret) {
      throw new ArchiiError(
        'A webhook secret is required for signature verification.',
        400,
        'CONFIGURATION_ERROR'
      );
    }
    this.secret = secret;
  }

  // -----------------------------------------------------------------------
  // Signature Verification
  // -----------------------------------------------------------------------

  /**
   * Verify the HMAC-SHA256 signature of a webhook payload.
   *
   * @param payload - Raw string body of the webhook request
   * @param signature - Value of the `X-Archii-Signature` header
   * @returns `true` if the signature is valid, `false` otherwise
   */
  verifySignature(payload: string, signature: string): boolean {
    if (!payload || !signature) {
      return false;
    }

    const expectedPrefix = 'sha256=';
    if (!signature.startsWith(expectedPrefix)) {
      return false;
    }

    const providedSig = signature.slice(expectedPrefix.length);
    const expectedSig = createHmac('sha256', this.secret)
      .update(payload, 'utf8')
      .digest('hex');

    try {
      return timingSafeEqual(
        Buffer.from(providedSig, 'hex'),
        Buffer.from(expectedSig, 'hex')
      );
    } catch {
      // timingSafeEqual throws if lengths differ
      return false;
    }
  }

  /**
   * Verify a webhook payload and throw if the signature is invalid.
   */
  verifyOrThrow(payload: string, signature: string): void {
    if (!this.verifySignature(payload, signature)) {
      throw new ArchiiError(
        'Webhook signature verification failed.',
        401,
        'INVALID_SIGNATURE'
      );
    }
  }

  // -----------------------------------------------------------------------
  // Event Parsing
  // -----------------------------------------------------------------------

  /**
   * Parse a raw JSON string into a typed WebhookPayload.
   */
  parseEvent<T = unknown>(payload: string): WebhookPayload<T> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new ArchiiError(
        'Invalid webhook payload: could not parse JSON.',
        400,
        'INVALID_PAYLOAD'
      );
    }

    const obj = parsed as Record<string, unknown>;

    if (!obj.id || typeof obj.id !== 'string') {
      throw new ArchiiError(
        'Invalid webhook payload: missing or invalid "id" field.',
        400,
        'INVALID_PAYLOAD'
      );
    }

    if (!obj.event || typeof obj.event !== 'string') {
      throw new ArchiiError(
        'Invalid webhook payload: missing or invalid "event" field.',
        400,
        'INVALID_PAYLOAD'
      );
    }

    if (!obj.timestamp || typeof obj.timestamp !== 'string') {
      throw new ArchiiError(
        'Invalid webhook payload: missing or invalid "timestamp" field.',
        400,
        'INVALID_PAYLOAD'
      );
    }

    if (obj.data === undefined) {
      throw new ArchiiError(
        'Invalid webhook payload: missing "data" field.',
        400,
        'INVALID_PAYLOAD'
      );
    }

    return {
      id: obj.id,
      event: obj.event as WebhookEvent,
      timestamp: obj.timestamp,
      data: obj.data as T,
      previousData: obj.previousData as Partial<T> | undefined,
      projectId: obj.projectId as string | undefined,
      tenantId: obj.tenantId as string | undefined,
      signature: obj.signature as string | undefined,
    };
  }

  // -----------------------------------------------------------------------
  // Event Router
  // -----------------------------------------------------------------------

  /**
   * Create a handler function that routes parsed webhook events to the
   * appropriate typed handler based on the event name.
   *
   * @returns A function that takes (payload: string, signature: string)
   *          and returns the parsed event after dispatching it.
   */
  createHandler(
    handlers: WebhookEventHandlers
  ): (payload: string, signature: string) => Promise<WebhookPayload> {
    return async (
      payload: string,
      signature: string
    ): Promise<WebhookPayload> => {
      // Verify signature
      this.verifyOrThrow(payload, signature);

      // Parse event
      const event = this.parseEvent(payload);

      // Dispatch to the matching handler
      const handler = handlers[event.event as WebhookEvent];
      if (handler) {
        await (handler as any)(event);
      }

      return event;
    };
  }
}

// ============================================================================
// Framework Middleware Helpers
// ============================================================================

// ---- Generic middleware request interface ----

export interface WebhookMiddlewareRequest {
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  rawBody?: string | Buffer;
}

export interface WebhookMiddlewareResponse {
  statusCode: number;
  body: unknown;
  headers?: Record<string, string>;
}

// ---- Express / Connect middleware ----

/**
 * Express/Connect middleware for handling Archii webhooks.
 *
 * Usage:
 * ```ts
 * app.post('/webhooks', archiiWebhookMiddleware(secret, {
 *   'task.created': async (payload) => { ... },
 *   'project.updated': async (payload) => { ... },
 * }));
 * ```
 */
export function archiiWebhookMiddleware(
  secret: string,
  handlers: WebhookEventHandlers
): (
  req: WebhookMiddlewareRequest,
  res: WebhookMiddlewareResponse,
  next: (err?: Error) => void
) => Promise<void> {
  const handler = new WebhookHandler(secret);
  const dispatch = handler.createHandler(handlers);

  return async (req, res, next) => {
    try {
      const signature =
        getHeader(req.headers, 'x-archii-signature') ?? '';

      const rawBody =
        typeof req.rawBody === 'string'
          ? req.rawBody
          : typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body);

      const event = await dispatch(rawBody, signature);

      res.statusCode = 200;
      res.body = { received: true, eventId: event.id };
    } catch (error) {
      if (error instanceof ArchiiError) {
        res.statusCode = error.statusCode;
        res.body = { error: error.message, code: error.code };
      } else {
        res.statusCode = 500;
        res.body = { error: 'Internal server error' };
        next(error instanceof Error ? error : new Error(String(error)));
      }
    }
  };
}

// ---- Next.js Edge Middleware compatible handler ----

/**
 * Next.js-compatible webhook handler.
 *
 * Usage:
 * ```ts
 * export async function POST(request: Request) {
 *   return handleArchiiWebhook(request, secret, {
 *     'task.created': async (payload) => { ... },
 *   });
 * }
 * ```
 */
export async function handleArchiiWebhook(
  request: Request,
  secret: string,
  handlers: WebhookEventHandlers
): Promise<Response> {
  const handler = new WebhookHandler(secret);
  const dispatch = handler.createHandler(handlers);

  try {
    const signature = request.headers.get('x-archii-signature') ?? '';
    const rawBody = await request.text();

    const event = await dispatch(rawBody, signature);

    return Response.json(
      { received: true, eventId: event.id },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ArchiiError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---- Helpers ----

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const value = headers[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}
