/**
 * webhook-service.ts
 * Sistema de webhooks para integraciones externas.
 *
 * Los tenants pueden registrar webhooks que reciben notificaciones
 * cuando ocurren eventos en la plataforma (tarea creada, proyecto actualizado, etc.).
 *
 * Características:
 *   - Múltiples webhooks por tenant
 *   - Filtro por tipo de evento
 *   - Firma HMAC-SHA256 para verificación
 *   - Reintentos exponenciales (3 intentos)
 *   - Log de entregas para debugging
 *
 * Colección Firestore: 'webhooks'
 * Colección Firestore: 'webhook_deliveries' (log de entregas)
 *
 * Gated por feature flag 'webhooks_system'.
 */

import { getAdminDb } from './firebase-admin';
import { isFlagEnabled } from './feature-flags';

/* ---- Types ---- */

/** Eventos disponibles para webhooks */
export type WebhookEventType =
  | 'task.created' | 'task.updated' | 'task.completed' | 'task.deleted'
  | 'project.created' | 'project.updated' | 'project.completed'
  | 'expense.created' | 'expense.updated'
  | 'rfi.created' | 'rfi.responded'
  | 'submittal.created' | 'submittal.approved' | 'submittal.rejected'
  | 'punch_item.created' | 'punch_item.completed'
  | 'member.joined' | 'member.removed'
  | 'comment.created'
  | 'health_score.alert';

/** Todas las categorías de eventos agrupadas */
export const WEBHOOK_EVENT_CATEGORIES: Record<string, WebhookEventType[]> = {
  tasks: ['task.created', 'task.updated', 'task.completed', 'task.deleted'],
  projects: ['project.created', 'project.updated', 'project.completed'],
  expenses: ['expense.created', 'expense.updated'],
  rfis: ['rfi.created', 'rfi.responded'],
  submittals: ['submittal.created', 'submittal.approved', 'submittal.rejected'],
  punchItems: ['punch_item.created', 'punch_item.completed'],
  members: ['member.joined', 'member.removed'],
  comments: ['comment.created'],
  health: ['health_score.alert'],
};

export interface WebhookConfig {
  id?: string;
  tenantId: string;
  /** URL destino del webhook */
  url: string;
  /** Eventos que suscribe (vacío = todos) */
  events: WebhookEventType[];
  /** Secret para verificar firma HMAC */
  secret: string;
  /** Nombre descriptivo */
  name: string;
  /** ¿Está activo? */
  active: boolean;
  /** Headers personalizados adicionales */
  customHeaders?: Record<string, string>;
  /** Metadata */
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface WebhookPayload {
  /** Tipo de evento */
  event: WebhookEventType;
  /** tenantId del contexto */
  tenantId: string;
  /** ID del documento que disparó el evento */
  resourceId: string;
  /** Tipo del recurso (colección) */
  resourceType: string;
  /** Datos del recurso (sanitized) */
  payload: Record<string, any>;
  /** Timestamp del evento */
  timestamp: string;
  /** ID único del evento */
  eventId: string;
}

export interface WebhookDelivery {
  id?: string;
  webhookId: string;
  tenantId: string;
  eventId: string;
  event: WebhookEventType;
  url: string;
  /** Status de la entrega */
  status: 'pending' | 'success' | 'failed' | 'retrying';
  /** HTTP status code de la respuesta */
  responseCode?: number;
  /** Body de la respuesta */
  responseBody?: string;
  /** Timestamp de la entrega */
  deliveredAt?: string;
  /** Número de intento */
  attempt: number;
  /** Error message si falló */
  error?: string;
  /** Siguiente reintento */
  nextRetryAt?: string;
  createdAt: string;
}

/* ---- Secret Generation ---- */

const crypto = require('crypto');

/**
 * Genera un secret HMAC para webhooks.
 * Formato: whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 */
export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

/* ---- HMAC Signature ---- */

/**
 * Genera la firma HMAC-SHA256 de un payload.
 * Se usa el header X-Webhook-Signature-256 para que el receptor verifique.
 */
export function signWebhookPayload(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/* ---- Webhook Management ---- */

/**
 * Crea un nuevo webhook para un tenant.
 */
export async function createWebhook(config: Omit<WebhookConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  if (!isFlagEnabled('webhooks_system')) {
    throw new Error('Sistema de webhooks no habilitado');
  }

  const db = getAdminDb();
  const docRef = await db.collection('webhooks').add({
    ...config,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return docRef.id;
}

/**
 * Lista los webhooks de un tenant.
 */
export async function listWebhooks(tenantId: string): Promise<WebhookConfig[]> {
  const db = getAdminDb();
  const snapshot = await db
    .collection('webhooks')
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<WebhookConfig, 'id'>),
    // No exponer el secret completo
    secret: doc.data().secret ? `${doc.data().secret.slice(0, 12)}...` : '',
  })) as any[];
}

/**
 * Elimina un webhook.
 */
export async function deleteWebhook(webhookId: string, tenantId: string): Promise<boolean> {
  const db = getAdminDb();
  const docRef = db.collection('webhooks').doc(webhookId);
  const doc = await docRef.get();

  if (!doc.exists) return false;
  const data = doc.data();
  if (!data || data.tenantId !== tenantId) return false;

  await docRef.delete();
  return true;
}

/* ---- Event Dispatch ---- */

/**
 * Dispara webhooks para un evento específico.
 * Busca todos los webhooks activos del tenant que coincidan con el tipo de evento.
 * Las entregas son asíncronas (fire-and-forget).
 */
export async function dispatchWebhookEvent(payload: WebhookPayload): Promise<void> {
  if (!isFlagEnabled('webhooks_system')) return;

  const db = getAdminDb();

  // Buscar webhooks activos del tenant
  const snapshot = await db
    .collection('webhooks')
    .where('tenantId', '==', payload.tenantId)
    .where('active', '==', true)
    .get();

  if (snapshot.empty) return;

  // Sanitizar payload (no enviar campos sensibles)
  const sanitizedPayload = sanitizePayload(payload);

  for (const doc of snapshot.docs) {
    const webhook = doc.data() as WebhookConfig;

    // Verificar si el webhook suscribe a este evento
    if (webhook.events.length > 0 && !webhook.events.includes(payload.event)) {
      continue;
    }

    // Crear registro de delivery
    const deliveryRef = await db.collection('webhook_deliveries').add({
      webhookId: doc.id,
      tenantId: payload.tenantId,
      eventId: payload.eventId,
      event: payload.event,
      url: webhook.url,
      status: 'pending',
      attempt: 1,
      createdAt: new Date().toISOString(),
    });

    // Entregar de forma asíncrona
    deliverWebhook(deliveryRef.id, sanitizedPayload, webhook).catch((err) => {
      console.error(`[Webhooks] Delivery error for ${doc.id}:`, err?.message);
    });
  }
}

/**
 * Sanitiza el payload del webhook para no exponer datos sensibles.
 */
function sanitizePayload(payload: WebhookPayload): WebhookPayload {
  const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'imageData', 'image'];
  const sanitized = { ...payload };

  if (sanitized.payload) {
    sanitized.payload = { ...payload.payload };
    for (const key of Object.keys(sanitized.payload)) {
      if (SENSITIVE_FIELDS.some((f) => key.toLowerCase().includes(f))) {
        (sanitized.payload as any)[key] = '[REDACTED]';
      }
    }
  }

  return sanitized;
}

/**
 * Entrega un webhook a la URL destino con reintentos.
 */
async function deliverWebhook(
  deliveryId: string,
  payload: WebhookPayload,
  webhook: WebhookConfig
): Promise<void> {
  const db = getAdminDb();
  const deliveryRef = db.collection('webhook_deliveries').doc(deliveryId);

  const maxRetries = 3;
  const baseDelay = 5000; // 5s, 10s, 20s

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const payloadString = JSON.stringify(payload);
      const signature = signWebhookPayload(payloadString, webhook.secret);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Id': deliveryId,
          'X-Webhook-Event': payload.event,
          'X-Webhook-Signature-256': `sha256=${signature}`,
          'X-Webhook-Timestamp': payload.timestamp,
          'User-Agent': 'Archii-Webhooks/2.0',
          ...(webhook.customHeaders || {}),
        },
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const responseBody = await response.text().catch(() => '');

      if (response.ok) {
        // Éxito
        await deliveryRef.update({
          status: 'success',
          responseCode: response.status,
          responseBody: responseBody.slice(0, 1000),
          deliveredAt: new Date().toISOString(),
          attempt,
        });
        return;
      }

      // Error HTTP — reintentar si no es 4xx (client error)
      if (response.status >= 400 && response.status < 500) {
        await deliveryRef.update({
          status: 'failed',
          responseCode: response.status,
          responseBody: responseBody.slice(0, 1000),
          error: `HTTP ${response.status}: Client error, no retry`,
          attempt,
        });
        return;
      }

      // Server error — reintentar
      const nextRetry = new Date(Date.now() + baseDelay * Math.pow(2, attempt - 1)).toISOString();
      await deliveryRef.update({
        status: 'retrying',
        responseCode: response.status,
        responseBody: responseBody.slice(0, 1000),
        error: `HTTP ${response.status}`,
        attempt,
        nextRetryAt: nextRetry,
      });

    } catch (err: any) {
      console.error(`[Webhooks] Attempt ${attempt} failed:`, err?.message);

      if (attempt === maxRetries) {
        await deliveryRef.update({
          status: 'failed',
          error: err?.message || 'Unknown error',
          attempt,
        });
        return;
      }

      const nextRetry = new Date(Date.now() + baseDelay * Math.pow(2, attempt - 1)).toISOString();
      await deliveryRef.update({
        status: 'retrying',
        error: err?.message,
        attempt,
        nextRetryAt: nextRetry,
      });
    }
  }
}

/**
 * Genera un eventId único.
 */
export function generateEventId(): string {
  return `evt_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Función helper para disparar webhooks fácilmente desde cualquier parte del código.
 *
 * @example
 *   import { triggerWebhook } from '@/lib/webhook-service';
 *   triggerWebhook('task.created', tenantId, 'tasks', taskId, taskData);
 */
export function triggerWebhook(
  event: WebhookEventType,
  tenantId: string,
  resourceType: string,
  resourceId: string,
  payload: Record<string, any>
): void {
  dispatchWebhookEvent({
    event,
    tenantId,
    resourceId,
    resourceType,
    payload,
    timestamp: new Date().toISOString(),
    eventId: generateEventId(),
  }).catch((err) => {
    // Fire-and-forget — webhooks no deben romper el flujo principal
    console.error('[Webhooks] dispatch error:', err?.message);
  });
}

/**
 * Obtiene el log de entregas de webhooks de un tenant.
 */
export async function getWebhookDeliveries(
  tenantId: string,
  limit = 50
): Promise<WebhookDelivery[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection('webhook_deliveries')
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as WebhookDelivery[];
}
