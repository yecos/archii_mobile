/**
 * calendly-connector.ts
 * Calendly integration connector for Archii Marketplace.
 *
 * Supports:
 *   - OAuth2 flow (access/refresh tokens)
 *   - Create scheduling links / events
 *   - List upcoming events
 *   - Get webhook events
 *   - Map Archii meetings to Calendly events
 *   - Bidirectional sync of meetings
 *
 * Auth: OAuth2 (access token + refresh token)
 */

import {
  registerConnector,
  type IntegrationConnector,
} from '../marketplace-service';

/* ================================================================
   TYPES
   ================================================================ */

export interface CalendlyConfig {
  accessToken: string;
  refreshToken?: string;
  userUri: string;
}

export interface CalendlyEvent {
  uri: string;
  name: string;
  status: 'active' | 'canceled';
  start_time: string;
  end_time: string;
  location?: { type: string; join_url?: string };
  event_type: string;
  invitees?: CalendlyInvitee[];
  created_at: string;
  updated_at: string;
}

export interface CalendlyInvitee {
  uri: string;
  name: string;
  email: string;
  status: 'active' | 'canceled';
}

export interface CalendlySchedulingLink {
  booking_url: string;
  cancel_url: string;
  reschedule_url: string;
  uri: string;
}

/* ================================================================
   API CLIENT
   ================================================================ */

function buildHeaders(config: CalendlyConfig): HeadersInit {
  return {
    'Authorization': `Bearer ${config.accessToken}`,
    'Content-Type': 'application/json',
  };
}

const CALENDLY_API = 'https://api.calendly.com';

async function calendlyRequest<T>(
  config: CalendlyConfig,
  method: string,
  path: string,
  body?: any
): Promise<T> {
  const url = `${CALENDLY_API}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method,
      headers: buildHeaders(config),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 401) {
      // Attempt token refresh
      if (config.refreshToken) {
        clearTimeout(timeout);
        throw new Error('TOKEN_EXPIRED');
      }
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Calendly API ${response.status}: ${errorText.slice(0, 300)}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as T;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Timeout conectando a Calendly');
    }
    throw err;
  }
}

/* ================================================================
   TOKEN REFRESH
   ================================================================ */

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCalendlyCode(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch('https://auth.calendly.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Calendly OAuth error ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * Refresh an expired access token.
 */
export async function refreshCalendlyToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch('https://auth.calendly.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Calendly token refresh error ${response.status}`);
  }

  return response.json();
}

/**
 * Generate the OAuth2 authorization URL for Calendly.
 */
export function getCalendlyAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
  });
  return `https://auth.calendly.com/oauth/authorize?${params.toString()}`;
}

/* ================================================================
   CRUD OPERATIONS
   ================================================================ */

interface CalendlyCollection<T> {
  collection: T[];
  pagination: { count: number; next_page?: string; prev_page?: string };
}

/**
 * Create a scheduling link for an event type.
 */
export async function createCalendlyEvent(
  config: CalendlyConfig,
  eventData: {
    eventTypeId: string;
    title?: string;
    description?: string;
    startTime?: string;
    invitees: { name: string; email: string }[];
  }
): Promise<CalendlySchedulingLink> {
  return calendlyRequest<CalendlySchedulingLink>(
    config,
    'POST',
    '/scheduling_links',
    {
      max_event_count: 1,
      owner: config.userUri,
      owner_type: 'user',
      event_type: eventData.eventTypeId,
    }
  );
}

/**
 * List upcoming events for the configured user.
 */
export async function listUpcomingEvents(
  config: CalendlyConfig,
  status: 'active' | 'canceled' = 'active',
  count = 20
): Promise<CalendlyEvent[]> {
  const params = new URLSearchParams({
    user: config.userUri,
    status,
    count: String(count),
  });

  const result = await calendlyRequest<CalendlyCollection<CalendlyEvent>>(
    config, 'GET', `/scheduled_events?${params.toString()}`
  );

  return result.collection;
}

/**
 * Get recent webhook events for the organization.
 */
export async function getWebhookEvents(
  config: CalendlyConfig,
  scope: string,
  count = 20
): Promise<any[]> {
  const params = new URLSearchParams({
    organization: scope,
    count: String(count),
  });

  const result = await calendlyRequest<CalendlyCollection<any>>(
    config, 'GET', `/webhook_subscriptions?${params.toString()}`
  );

  return result.collection;
}

/**
 * Cancel a scheduled event.
 */
export async function cancelCalendlyEvent(
  config: CalendlyConfig,
  eventUri: string
): Promise<void> {
  await calendlyRequest(config, 'POST', `${eventUri}/cancellation`, {
    reason: 'Cancelado desde Archii',
  });
}

/* ================================================================
   MAPPERS (Archii ↔ Calendly)
   ================================================================ */

/**
 * Map an Archii meeting to Calendly event data.
 */
export function formatArchiiToCalendly(meeting: {
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  attendees?: { name: string; email: string }[];
  location?: string;
}): {
  eventTypeId: string;
  title: string;
  description?: string;
  startTime?: string;
  invitees: { name: string; email: string }[];
} {
  return {
    eventTypeId: '', // Must be configured by user
    title: meeting.title,
    description: meeting.description,
    startTime: meeting.startTime,
    invitees: meeting.attendees || [],
  };
}

/**
 * Map a Calendly event to an Archii meeting format.
 */
export function formatCalendlyToArchii(event: CalendlyEvent): {
  title: string;
  description?: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
  status: string;
  externalUri: string;
  invitees: { name: string; email: string }[];
} {
  return {
    title: event.name,
    date: event.start_time.split('T')[0],
    startTime: event.start_time,
    endTime: event.end_time,
    location: event.location?.join_url || event.location?.type,
    status: event.status === 'active' ? 'Confirmada' : 'Cancelada',
    externalUri: event.uri,
    invitees: (event.invitees || []).map((inv) => ({
      name: inv.name,
      email: inv.email,
    })),
  };
}

/**
 * Parse an inbound Calendly webhook event.
 */
export function handleCalendlyWebhook(payload: any): {
  event: string;
  data: any;
} | null {
  const event = payload.event;
  if (!event) return null;

  const eventMap: Record<string, string> = {
    'invitee.created': 'meeting.created',
    'invitee.canceled': 'meeting.cancelled',
    'routing_form_submission.created': 'meeting.updated',
  };

  return {
    event: eventMap[event] || 'meeting.updated',
    data: payload.payload,
  };
}

/* ================================================================
   CONNECTOR IMPLEMENTATION
   ================================================================ */

const calendlyConnector: IntegrationConnector = {
  async dispatch(config, event, payload) {
    const calConfig = config as unknown as CalendlyConfig;

    switch (event) {
      case 'meeting.created': {
        const eventData = formatArchiiToCalendly(payload as any);
        if (eventData.eventTypeId) {
          await createCalendlyEvent(calConfig, eventData);
        }
        break;
      }
      case 'meeting.cancelled': {
        if (payload.calendlyEventUri) {
          await cancelCalendlyEvent(calConfig, payload.calendlyEventUri);
        }
        break;
      }
      default:
        break;
    }
  },

  async test(config) {
    try {
      const calConfig = config as unknown as CalendlyConfig;
      const events = await listUpcomingEvents(calConfig, 'active', 1);
      return {
        success: true,
        message: `Conectado. ${events.length} evento(s) próximo(s) encontrado(s).`,
      };
    } catch (err: any) {
      if (err?.message === 'TOKEN_EXPIRED') {
        return { success: false, message: 'Token expirado. Reconecta la cuenta.' };
      }
      return {
        success: false,
        message: `Error: ${err?.message}`,
      };
    }
  },
};

// Auto-register the connector
registerConnector('calendly', calendlyConnector);
