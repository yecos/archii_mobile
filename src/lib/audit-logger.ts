/**
 * audit-logger.ts
 * Sistema de audit logs para Archii.
 *
 * Registra operaciones de escritura en colecciones críticas
 * de Firestore (tasks, projects, expenses, etc.) para trazabilidad
 * y cumplimiento normativo.
 *
 * El registro se hace via API route server-side para que no sea
 * manipulable desde el cliente.
 *
 * Uso desde firestore-actions o API routes:
 *   import { logAudit } from '@/lib/audit-logger';
 *   await logAudit({
 *     action: 'create',
 *     collection: 'tasks',
 *     docId: 'abc123',
 *     before: null,
 *     after: { title: 'Nueva tarea', status: 'Por hacer' },
 *     userId: authUser.uid,
 *     tenantId: 'tenant1',
 *   });
 */

import { getFirebase } from './firebase-service';
import { isFlagEnabled } from './feature-flags';

/* ---- Types ---- */

export type AuditAction = 'create' | 'update' | 'delete' | 'archive' | 'restore' | 'import' | 'export';

export interface AuditLogEntry {
  /** Colección de Firestore afectada */
  collection: string;
  /** ID del documento afectado */
  docId: string;
  /** Tipo de acción realizada */
  action: AuditAction;
  /** ID del usuario que ejecutó la acción */
  userId: string;
  /** tenantId del contexto */
  tenantId: string;
  /** Estado ANTES de la acción (null para create) */
  before: Record<string, any> | null;
  /** Estado DESPUÉS de la acción (null para delete) */
  after: Record<string, any> | null;
  /** Diff de campos modificados (solo para update) */
  changes?: Record<string, { from: any; to: any }>;
  /** Timestamp del evento */
  timestamp: number;
  /** IP del cliente (si está disponible) */
  ip?: string;
  /** User agent del cliente */
  userAgent?: string;
  /** Metadata adicional (ej: motivo de eliminación) */
  metadata?: Record<string, any>;
}

/* ---- Colecciones auditadas ---- */

/**
 * Lista de colecciones que se auditan automáticamente.
 * Cualquier write fuera de esta lista se ignora.
 */
const AUDITED_COLLECTIONS: string[] = [
  'tasks',
  'projects',
  'expenses',
  'suppliers',
  'companies',
  'meetings',
  'galleryPhotos',
  'invProducts',
  'invCategories',
  'invMovements',
  'invTransfers',
  'timeEntries',
  'invoices',
  'comments',
  'rfis',
  'submittals',
  'punchItems',
  'tenants',
];

/* ---- Diff Engine ---- */

/**
 * Calcula el diff entre dos estados de un documento.
 * Solo incluye campos que cambiaron.
 */
function computeDiff(
  before: Record<string, any>,
  after: Record<string, any>
): Record<string, { from: any; to: any }> {
  const diff: Record<string, { from: any; to: any }> = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const beforeVal = before[key];
    const afterVal = after[key];

    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      diff[key] = { from: beforeVal, to: afterVal };
    }
  }

  return diff;
}

/* ---- Sanitización ---- */

/**
 * Elimina campos sensibles del snapshot antes de guardar en audit_logs.
 * No guardamos passwords, tokens, imágenes base64 grandes, etc.
 */
const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'imageData', 'image', 'url'];

function sanitizeData(data: Record<string, any> | null): Record<string, any> | null {
  if (!data) return null;
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_FIELDS.some((f) => key.toLowerCase().includes(f))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 1000) {
      sanitized[key] = value.substring(0, 1000) + '... [truncated]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/* ---- Public API ---- */

/**
 * Registra una entrada de audit log.
 * Si la feature flag AUDIT_LOGS está desactivada, no hace nada.
 * Si la colección no está en la lista auditada, no hace nada.
 *
 * La función es fire-and-forget: no bloquea la operación principal.
 * Errores se loguean pero no se propagan.
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  // Verificar feature flag
  if (!isFlagEnabled('audit_logs')) return;

  // Verificar que la colección esté auditada
  if (!AUDITED_COLLECTIONS.includes(entry.collection)) return;

  // Sanitizar datos
  const sanitizedEntry: Omit<AuditLogEntry, 'before' | 'after'> & {
    before: Record<string, any> | null;
    after: Record<string, any> | null;
  } = {
    collection: entry.collection,
    docId: entry.docId,
    action: entry.action,
    userId: entry.userId,
    tenantId: entry.tenantId,
    before: sanitizeData(entry.before),
    after: sanitizeData(entry.after),
    timestamp: entry.timestamp,
    ip: entry.ip,
    userAgent: entry.userAgent,
    metadata: entry.metadata,
  };

  // Calcular diff para updates
  if (entry.action === 'update' && entry.before && entry.after) {
    sanitizedEntry.changes = computeDiff(entry.before, entry.after);
  }

  // Escribir en Firestore (fire-and-forget)
  try {
    const db = getFirebase().firestore();
    const ts = (db as any).FieldValue?.serverTimestamp?.() || new Date().toISOString();

    await db.collection('audit_logs').add({
      ...sanitizedEntry,
      createdAt: ts,
      // Retention: se puede agregar un Cloud Function para limpiar logs > 90 días
    });
  } catch (err) {
    // Audit logs NO deben romper el flujo principal
    console.error('[AuditLog] Error escribiendo audit log:', err);
  }
}

/**
 * Wrapper para audit logging automático alrededor de operaciones Firestore.
 *
 * @example
 *   await withAudit('tasks', taskId, 'update', userId, tenantId,
 *     async () => {
 *       await db.collection('tasks').doc(taskId).update({ status: 'Completado' });
 *     },
 *     { before: oldData, after: newData }
 *   );
 */
export async function withAudit<T>(
  collection: string,
  docId: string,
  action: AuditAction,
  userId: string,
  tenantId: string,
  operation: () => Promise<T>,
  context?: { before?: Record<string, any>; after?: Record<string, any>; metadata?: Record<string, any> }
): Promise<T> {
  const result = await operation();

  // Log de forma async (no bloquea)
  logAudit({
    collection,
    docId,
    action,
    userId,
    tenantId,
    before: context?.before ?? null,
    after: context?.after ?? null,
    metadata: context?.metadata,
    timestamp: Date.now(),
  }).catch(() => { /* fire-and-forget */ });

  return result;
}
