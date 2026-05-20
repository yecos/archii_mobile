/**
 * marketplace-service.ts
 * Core integration management service for the Archii Marketplace.
 *
 * Manages integration providers (Slack, Jira, GitHub, Calendly, Stripe),
 * tenant installation instances, event dispatching, and delivery logs.
 *
 * Firestore collections:
 *   - `integrations`        : installed integration instances per tenant
 *   - `integration_logs`     : delivery logs per instance
 *
 * Gated by feature flag 'marketplace'.
 */

import { getAdminDb } from './firebase-admin';
import { isFlagEnabled } from './feature-flags';

/* ================================================================
   TYPES
   ================================================================ */

export type AuthType = 'oauth2' | 'apiKey' | 'webhook';

export type IntegrationCategory =
  | 'communication'
  | 'project-management'
  | 'version-control'
  | 'scheduling'
  | 'payments';

export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'select';
  required: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  helpText?: string;
}

export interface IntegrationProvider {
  /** Unique provider identifier (e.g. 'slack', 'jira') */
  id: string;
  /** Display name */
  name: string;
  /** Emoji icon */
  icon: string;
  /** Short description */
  description: string;
  /** Category for filtering */
  category: IntegrationCategory;
  /** Authentication type */
  authType: AuthType;
  /** Configuration schema for setup */
  configSchema: ConfigField[];
  /** Event types this provider can handle */
  eventTypes: string[];
  /** Whether this provider is generally available */
  enabled: boolean;
  /** Optional external docs URL */
  docsUrl?: string;
}

export type IntegrationStatus =
  | 'active'
  | 'inactive'
  | 'error'
  | 'pending_setup';

export interface IntegrationInstance {
  id: string;
  tenantId: string;
  providerId: string;
  status: IntegrationStatus;
  /** Reference to encrypted credential storage (never stored in plain text) */
  credentialsRef?: string;
  /** JSON string of non-sensitive display config */
  config: Record<string, string>;
  /** Subscribed event types for this instance */
  events: string[];
  /** Last successful sync timestamp */
  lastSyncAt?: string;
  /** Human-readable error message if status === 'error' */
  errorMessage?: string;
  /** Installation metadata */
  installedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationLogEntry {
  id: string;
  instanceId: string;
  tenantId: string;
  providerId: string;
  event: string;
  direction: 'outbound' | 'inbound';
  status: 'success' | 'failed' | 'pending';
  statusCode?: number;
  requestBody?: string;
  responseBody?: string;
  error?: string;
  createdAt: string;
}

/* ================================================================
   BUILT-IN PROVIDERS
   ================================================================ */

const BUILTIN_PROVIDERS: IntegrationProvider[] = [
  {
    id: 'slack',
    name: 'Slack',
    icon: '💬',
    description: 'Envía notificaciones de tareas, proyectos y gastos a canales de Slack con Block Kit.',
    category: 'communication',
    authType: 'webhook',
    configSchema: [
      {
        key: 'webhookUrl',
        label: 'Webhook URL',
        type: 'url',
        required: true,
        placeholder: 'https://hooks.slack.com/services/T.../B.../...',
        helpText: 'Crea un Incoming Webhook en tu workspace de Slack.',
      },
      {
        key: 'channel',
        label: 'Canal por defecto',
        type: 'text',
        required: false,
        placeholder: '#general',
        helpText: 'Canal opcional para mensajes (el webhook ya define uno).',
      },
    ],
    eventTypes: [
      'task.created', 'task.updated', 'task.completed',
      'project.updated', 'expense.created',
    ],
    enabled: true,
    docsUrl: 'https://api.slack.com/messaging/webhooks',
  },
  {
    id: 'jira',
    name: 'Jira',
    icon: '📋',
    description: 'Sincroniza tareas bidireccionalmente con Jira Cloud o Server.',
    category: 'project-management',
    authType: 'apiKey',
    configSchema: [
      {
        key: 'baseUrl',
        label: 'Jira Base URL',
        type: 'url',
        required: true,
        placeholder: 'https://your-domain.atlassian.net',
      },
      {
        key: 'email',
        label: 'Email de API',
        type: 'text',
        required: true,
        placeholder: 'admin@company.com',
      },
      {
        key: 'apiToken',
        label: 'API Token',
        type: 'password',
        required: true,
        helpText: 'Genera un token en Atlassian > Account > Security > API Tokens.',
      },
      {
        key: 'projectKey',
        label: 'Project Key',
        type: 'text',
        required: true,
        placeholder: 'PROJ',
      },
    ],
    eventTypes: [
      'task.created', 'task.updated', 'task.completed',
    ],
    enabled: true,
    docsUrl: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/',
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: '🐙',
    description: 'Crea issues, comenta PRs y recibe eventos de push, issues y pull requests.',
    category: 'version-control',
    authType: 'apiKey',
    configSchema: [
      {
        key: 'token',
        label: 'Personal Access Token',
        type: 'password',
        required: true,
        helpText: 'GitHub > Settings > Developer Settings > Personal Access Tokens.',
      },
      {
        key: 'owner',
        label: 'Owner / Org',
        type: 'text',
        required: true,
        placeholder: 'your-org',
      },
      {
        key: 'repo',
        label: 'Repository',
        type: 'text',
        required: true,
        placeholder: 'archii-tasks',
      },
    ],
    eventTypes: [
      'task.created', 'task.updated', 'task.completed',
    ],
    enabled: true,
    docsUrl: 'https://docs.github.com/en/rest',
  },
  {
    id: 'calendly',
    name: 'Calendly',
    icon: '📅',
    description: 'Sincroniza reuniones y crea enlaces de agendamiento directamente desde Archii.',
    category: 'scheduling',
    authType: 'oauth2',
    configSchema: [
      {
        key: 'accessToken',
        label: 'Access Token',
        type: 'password',
        required: true,
        helpText: 'Se obtiene automáticamente vía OAuth2.',
      },
      {
        key: 'refreshToken',
        label: 'Refresh Token',
        type: 'password',
        required: false,
      },
      {
        key: 'userUri',
        label: 'User URI',
        type: 'url',
        required: true,
        placeholder: 'https://api.calendly.com/users/...',
      },
    ],
    eventTypes: [
      'meeting.created', 'meeting.updated', 'meeting.cancelled',
    ],
    enabled: true,
    docsUrl: 'https://developer.calendly.com/api-docs',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    icon: '💳',
    description: 'Crea facturas, gestiona clientes y recibe notificaciones de pagos.',
    category: 'payments',
    authType: 'apiKey',
    configSchema: [
      {
        key: 'secretKey',
        label: 'Secret Key',
        type: 'password',
        required: true,
        helpText: 'Stripe Dashboard > Developers > API Keys > Secret key.',
      },
      {
        key: 'webhookSecret',
        label: 'Webhook Signing Secret',
        type: 'password',
        required: false,
        helpText: 'Para verificar webhooks entrantes de Stripe.',
      },
    ],
    eventTypes: [
      'invoice.created', 'invoice.paid', 'invoice.overdue',
    ],
    enabled: true,
    docsUrl: 'https://docs.stripe.com/api',
  },
];

/* ================================================================
   PROVIDER REGISTRY (extensible)
   ================================================================ */

const providerRegistry = new Map<string, IntegrationProvider>();

// Register built-in providers
for (const p of BUILTIN_PROVIDERS) {
  providerRegistry.set(p.id, p);
}

/* ================================================================
   PUBLIC API
   ================================================================ */

/**
 * Returns all available integration providers.
 */
export function getAvailableProviders(): IntegrationProvider[] {
  return Array.from(providerRegistry.values()).filter((p) => p.enabled);
}

/**
 * Returns a single provider by ID, or undefined.
 */
export function getProvider(providerId: string): IntegrationProvider | undefined {
  return providerRegistry.get(providerId);
}

/**
 * Register a new (or update an existing) integration provider.
 * This allows third-party or custom integrations.
 */
export function registerProvider(provider: IntegrationProvider): void {
  providerRegistry.set(provider.id, provider);
}

/**
 * Install a new integration for a tenant.
 */
export async function installIntegration(
  tenantId: string,
  providerId: string,
  config: Record<string, string>,
  installedBy: string,
  events?: string[]
): Promise<string> {
  if (!isFlagEnabled('marketplace')) {
    throw new Error('Marketplace no habilitado');
  }

  const provider = providerRegistry.get(providerId);
  if (!provider) {
    throw new Error(`Proveedor no encontrado: ${providerId}`);
  }

  // Validate required config fields
  for (const field of provider.configSchema) {
    if (field.required && !config[field.key]?.trim()) {
      throw new Error(`Campo requerido faltante: ${field.label}`);
    }
  }

  const db = getAdminDb();
  const instanceId = (await db.collection('integrations').add({
    tenantId,
    providerId,
    status: 'active' as IntegrationStatus,
    config,
    events: events || provider.eventTypes,
    installedBy,
    lastSyncAt: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })).id;

  return instanceId;
}

/**
 * Uninstall (remove) an integration instance.
 */
export async function uninstallIntegration(
  tenantId: string,
  instanceId: string
): Promise<boolean> {
  if (!isFlagEnabled('marketplace')) {
    throw new Error('Marketplace no habilitado');
  }

  const db = getAdminDb();
  const docRef = db.collection('integrations').doc(instanceId);
  const doc = await docRef.get();

  if (!doc.exists) return false;
  const data = doc.data();
  if (!data || data.tenantId !== tenantId) return false;

  await docRef.delete();

  // Also clean up logs
  const logsSnap = await db
    .collection('integration_logs')
    .where('instanceId', '==', instanceId)
    .limit(500)
    .get();

  const batch = db.batch();
  for (const logDoc of logsSnap.docs) {
    batch.delete(logDoc.ref);
  }
  await batch.commit();

  return true;
}

/**
 * List all installed integrations for a tenant.
 */
export async function getTenantIntegrations(
  tenantId: string
): Promise<IntegrationInstance[]> {
  const db = getAdminDb();
  const snapshot = await db
    .collection('integrations')
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<IntegrationInstance, 'id'>),
  }));
}

/**
 * Update an integration's configuration.
 * Only the `config` object is updated; credentials are handled separately.
 */
export async function updateIntegrationConfig(
  instanceId: string,
  config: Record<string, string>
): Promise<void> {
  if (!isFlagEnabled('marketplace')) {
    throw new Error('Marketplace no habilitado');
  }

  const db = getAdminDb();
  await db.collection('integrations').doc(instanceId).update({
    config,
    status: 'active',
    errorMessage: null,
    updatedAt: new Date().toISOString(),
  });

}

/**
 * Trigger (dispatch) an event to a specific integration instance.
 * Delegates to the appropriate connector.
 */
export async function triggerIntegration(
  instanceId: string,
  event: string,
  payload: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  if (!isFlagEnabled('marketplace')) {
    return { success: false, error: 'Marketplace no habilitado' };
  }

  const db = getAdminDb();
  const doc = await db.collection('integrations').doc(instanceId).get();

  if (!doc.exists) {
    return { success: false, error: 'Integración no encontrada' };
  }

  const instance = { id: doc.id, ...doc.data() } as IntegrationInstance;

  // Check if this instance subscribes to the event
  if (instance.events.length > 0 && !instance.events.includes(event)) {
    return { success: false, error: 'Evento no suscrito' };
  }

  try {
    // Delegate to the appropriate connector
    const connector = getConnector(instance.providerId);
    if (!connector) {
      return { success: false, error: `Conector no disponible: ${instance.providerId}` };
    }

    await connector.dispatch(instance.config, event, payload);

    // Log success
    await logDelivery({
      instanceId,
      tenantId: instance.tenantId,
      providerId: instance.providerId,
      event,
      direction: 'outbound',
      status: 'success',
      requestBody: JSON.stringify(payload).slice(0, 2000),
    });

    // Update lastSyncAt
    await db.collection('integrations').doc(instanceId).update({
      lastSyncAt: new Date().toISOString(),
      status: 'active',
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  } catch (err: any) {
    const errorMsg = err?.message || 'Error desconocido';

    // Log failure
    await logDelivery({
      instanceId,
      tenantId: instance.tenantId,
      providerId: instance.providerId,
      event,
      direction: 'outbound',
      status: 'failed',
      error: errorMsg,
      requestBody: JSON.stringify(payload).slice(0, 2000),
    });

    // Mark instance as error
    await db.collection('integrations').doc(instanceId).update({
      status: 'error',
      errorMessage: errorMsg,
      updatedAt: new Date().toISOString(),
    });

    return { success: false, error: errorMsg };
  }
}

/**
 * Get delivery logs for a specific integration instance.
 */
export async function getIntegrationLogs(
  instanceId: string,
  limit = 50
): Promise<IntegrationLogEntry[]> {
  const db = getAdminDb();
  const snapshot = await db
    .collection('integration_logs')
    .where('instanceId', '==', instanceId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as IntegrationLogEntry[];
}

/* ================================================================
   CONNECTOR INTERFACE & REGISTRY
   ================================================================ */

export interface IntegrationConnector {
  dispatch(
    config: Record<string, string>,
    event: string,
    payload: Record<string, any>
  ): Promise<void>;
  test?(config: Record<string, string>): Promise<{ success: boolean; message: string }>;
}

const connectorRegistry = new Map<string, IntegrationConnector>();

/**
 * Register a connector for a provider.
 */
export function registerConnector(providerId: string, connector: IntegrationConnector): void {
  connectorRegistry.set(providerId, connector);
}

function getConnector(providerId: string): IntegrationConnector | undefined {
  return connectorRegistry.get(providerId);
}

/* ================================================================
   INTERNAL HELPERS
   ================================================================ */

async function logDelivery(entry: Omit<IntegrationLogEntry, 'id' | 'createdAt'>): Promise<void> {
  try {
    const db = getAdminDb();
    await db.collection('integration_logs').add({
      ...entry,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    // Logging should not break the main flow
    console.error('[Marketplace] Failed to write log:', err);
  }
}

/**
 * Convenience: trigger all matching integrations for a tenant event.
 * E.g. when a task is created, dispatch to all active instances that listen to 'task.created'.
 */
export async function dispatchTenantEvent(
  tenantId: string,
  event: string,
  payload: Record<string, any>
): Promise<{ dispatched: number; errors: number }> {
  const instances = await getTenantIntegrations(tenantId);
  let dispatched = 0;
  let errors = 0;

  for (const instance of instances) {
    if (instance.status !== 'active') continue;
    if (instance.events.length > 0 && !instance.events.includes(event)) continue;

    const result = await triggerIntegration(instance.id, event, payload);
    if (result.success) {
      dispatched++;
    } else {
      errors++;
    }
  }

  return { dispatched, errors };
}
