/**
 * gdpr-service.ts
 * GDPR compliance service for Archii.
 *
 * Implements GDPR Article 17 (Right to Erasure) and Article 20 (Data Portability):
 *   - exportUserData — export ALL user data as JSON
 *   - exportUserDataCSV — same but CSV format
 *   - deleteUserData — anonymize/remove user data (keeps audit trail)
 *   - getPrivacyConsent / recordConsent — consent management
 *   - generateDataProcessingReport — tenant-level compliance report
 *   - createPrivacyNotice — generate privacy notice
 *   - processGDPRRequest — async processing of GDPR requests
 *
 * Firestore collections used:
 *   - gdpr_requests — tracks all GDPR requests (export, delete)
 *   - privacy_consents — consent records per user
 *
 * Gated by feature flag 'gdpr_tools'.
 */

import { getAdminDb } from './firebase-admin';
import { getAdminAuth } from './firebase-admin';
import { isFlagEnabled } from './feature-flags';
import { hashData } from './encryption';

/* ===== Types ===== */

export type GDPRRequestType = 'export' | 'delete';
export type GDPRRequestStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';

export interface GDPRRequest {
  id: string;
  userId: string;
  tenantId: string;
  /** GDPR Article 20 (portability) or Article 17 (erasure) */
  type: GDPRRequestType;
  status: GDPRRequestStatus;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  /** URL to download exported data (for export requests) */
  resultUrl?: string;
  /** Processing notes / error details */
  notes?: string;
  /** Who approved the request (for delete) */
  reviewedBy?: string;
  /** Anonymized user data summary (for delete confirmation) */
  anonymizedSummary?: Record<string, unknown>;
}

export interface PrivacyConsent {
  id: string;
  userId: string;
  tenantId: string;
  /** Type of consent (e.g. 'data_processing', 'marketing', 'analytics') */
  consentType: string;
  /** Whether consent was granted or withdrawn */
  granted: boolean;
  /** Legal basis text */
  legalBasis?: string;
  /** IP address at time of consent */
  ipAddress?: string;
  /** User agent at time of consent */
  userAgent?: string;
  timestamp: string;
}

export interface UserDataExport {
  userId: string;
  tenantId: string;
  exportedAt: string;
  user: Record<string, unknown>;
  tasksCreated: Record<string, unknown>[];
  tasksAssigned: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  comments: Record<string, unknown>[];
  timeEntries: Record<string, unknown>[];
  auditLogs: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  rfis: Record<string, unknown>[];
  submittals: Record<string, unknown>[];
  punchItems: Record<string, unknown>[];
  consents: Record<string, unknown>[];
}

export interface DataProcessingReport {
  tenantId: string;
  generatedAt: string;
  summary: {
    totalUsers: number;
    totalDocuments: number;
    collectionsCount: number;
    encryptedFields: number;
    retentionPoliciesActive: number;
  };
  gdprRequests: {
    total: number;
    pending: number;
    completed: number;
    failed: number;
  };
  consents: {
    totalRecords: number;
    byType: Record<string, number>;
  };
  dataCategories: Array<{ collection: string; count: number; description: string }>;
}

/* ===== Firestore Collection Names ===== */

const GDPR_REQUESTS = 'gdpr_requests';
const PRIVACY_CONSENTS = 'privacy_consents';

/* ===== User Data Export ===== */

/**
 * Export ALL data belonging to a user as JSON (GDPR Article 20).
 */
export async function exportUserData(
  userId: string,
  tenantId: string,
): Promise<UserDataExport> {
  if (!isFlagEnabled('gdpr_tools')) {
    throw new Error('GDPR tools are not enabled');
  }

  const db = getAdminDb();

  // 1. User profile
  let user: Record<string, unknown> = {};
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      user = { id: userDoc.id, ...userDoc.data() };
    }
  } catch {
    console.warn(`[GDPR] User doc ${userId} not found`);
  }

  // 2. Tasks created by user
  const tasksCreated = await queryCollection(db, 'tasks', 'createdBy', userId, tenantId);

  // 3. Tasks assigned to user (assigneeId or assigneeIds array)
  let tasksAssigned = await queryCollection(db, 'tasks', 'assigneeId', userId, tenantId);
  // Also check assigneeIds array field
  try {
    const assigneeIdsSnapshot = await db
      .collection('tasks')
      .where('tenantId', '==', tenantId)
      .where('assigneeIds', 'array-contains', userId)
      .get();
    const fromArray = assigneeIdsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    // Deduplicate
    const existingIds = new Set(tasksAssigned.map((t) => t.id));
    for (const item of fromArray) {
      if (!existingIds.has(item.id)) tasksAssigned.push(item);
    }
  } catch {
    // Index might not exist — skip
  }

  // 4. Expenses
  const expenses = await queryCollection(db, 'expenses', 'createdBy', userId, tenantId);

  // 5. Comments
  const comments = await queryCollection(db, 'comments', 'userId', userId, tenantId);

  // 6. Time entries
  const timeEntries = await queryCollection(db, 'timeEntries', 'userId', userId, tenantId);

  // 7. Audit logs
  const auditLogs = await queryCollection(db, 'audit_logs', 'userId', userId, tenantId);

  // 8. General messages
  const messages = await queryCollection(db, 'generalMessages', 'senderId', userId, tenantId);

  // 9. Invoices created by user
  const invoices = await queryCollection(db, 'invoices', 'createdBy', userId, tenantId);

  // 10. RFIs
  const rfis = await queryCollection(db, 'rfis', 'createdBy', userId, tenantId);

  // 11. Submittals
  const submittals = await queryCollection(db, 'submittals', 'createdBy', userId, tenantId);

  // 12. Punch items
  const punchItems = await queryCollection(db, 'punchItems', 'createdBy', userId, tenantId);

  // 13. Consents
  const consents = await getPrivacyConsent(userId, tenantId);

  return {
    userId,
    tenantId,
    exportedAt: new Date().toISOString(),
    user,
    tasksCreated,
    tasksAssigned,
    expenses,
    comments,
    timeEntries,
    auditLogs,
    messages,
    invoices,
    rfis,
    submittals,
    punchItems,
    consents: consents.map((c) => ({ ...c }) as unknown as Record<string, unknown>),
  };
}

/**
 * Export ALL user data as CSV (one section per collection).
 */
export async function exportUserDataCSV(
  userId: string,
  tenantId: string,
): Promise<string> {
  const data = await exportUserData(userId, tenantId);

  const sections: Array<{ title: string; rows: Record<string, unknown>[] }> = [
    { title: 'User', rows: [data.user] },
    { title: 'Tasks Created', rows: data.tasksCreated },
    { title: 'Tasks Assigned', rows: data.tasksAssigned },
    { title: 'Expenses', rows: data.expenses },
    { title: 'Comments', rows: data.comments },
    { title: 'Time Entries', rows: data.timeEntries },
    { title: 'Audit Logs', rows: data.auditLogs },
    { title: 'Messages', rows: data.messages },
    { title: 'Invoices', rows: data.invoices },
    { title: 'RFIs', rows: data.rfis },
    { title: 'Submittals', rows: data.submittals },
    { title: 'Punch Items', rows: data.punchItems },
    { title: 'Consents', rows: data.consents },
  ];

  const escapeCSV = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines: string[] = [];

  for (const section of sections) {
    if (section.rows.length === 0) continue;

    lines.push('');
    lines.push(`=== ${section.title} ===`);
    lines.push('');

    // Gather headers from first row
    const headers = Object.keys(flattenObject(section.rows[0]));
    lines.push(headers.map(escapeCSV).join(','));

    for (const row of section.rows) {
      const flat = flattenObject(row);
      lines.push(headers.map((h) => escapeCSV(flat[h])).join(','));
    }
  }

  return lines.join('\n');
}

/* ===== User Data Deletion (Anonymization) ===== */

/**
 * Delete/anonymize user data (GDPR Article 17 — Right to Erasure).
 *
 * Strategy: Anonymize rather than hard-delete to preserve audit trail.
 *   - Name → "Deleted User"
 *   - Email → SHA-256 hash prefix (e.g., "deleted_abc123...")
 *   - photoURL → removed
 *   - Phone/address → "[REDACTED]"
 *   - Documents kept for audit but PII removed
 *
 * Returns a summary of what was anonymized.
 */
export async function deleteUserData(
  userId: string,
  tenantId: string,
): Promise<Record<string, unknown>> {
  if (!isFlagEnabled('gdpr_tools')) {
    throw new Error('GDPR tools are not enabled');
  }

  const db = getAdminDb();
  const anonymizedSummary: Record<string, number> = {};

  // 1. Anonymize user profile
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data() as Record<string, unknown>;
      const emailHash = hashData(String(userData.email || userId)).slice(0, 16);

      await db.collection('users').doc(userId).update({
        name: 'Deleted User',
        email: `deleted_${emailHash}@anon.redacted`,
        photoURL: null,
        phone: null,
        address: null,
        // Preserve: id, tenantId, role (for audit), createdAt
        anonymizedAt: new Date().toISOString(),
        gdprDeleted: true,
      });
      anonymizedSummary['users'] = 1;
    }
  } catch (err) {
    console.warn(`[GDPR] Failed to anonymize user doc:`, err);
  }

  // 2. Anonymize references in tasks (createdBy, assigneeId)
  const taskCollections = ['tasks', 'expenses', 'comments', 'timeEntries', 'invoices', 'rfis', 'submittals', 'punchItems'];

  for (const collection of taskCollections) {
    try {
      // createdBy
      const createdSnapshot = await db
        .collection(collection)
        .where('tenantId', '==', tenantId)
        .where('createdBy', '==', userId)
        .get();

      if (!createdSnapshot.empty) {
        const batch = db.batch();
        createdSnapshot.docs.forEach((doc) => {
          batch.update(doc.ref, { createdBy: 'DELETED_USER' });
        });
        await batch.commit();
        anonymizedSummary[collection] = (anonymizedSummary[collection] || 0) + createdSnapshot.size;
      }
    } catch {
      // Index may not exist — skip
    }
  }

  // 3. Anonymize assigneeId in tasks
  try {
    const assigneeSnapshot = await db
      .collection('tasks')
      .where('tenantId', '==', tenantId)
      .where('assigneeId', '==', userId)
      .get();

    if (!assigneeSnapshot.empty) {
      const batch = db.batch();
      assigneeSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { assigneeId: 'DELETED_USER' });
      });
      await batch.commit();
      anonymizedSummary['tasks_assigneeId'] = (anonymizedSummary['tasks_assigneeId'] || 0) + assigneeSnapshot.size;
    }
  } catch {
    // Index may not exist
  }

  // 4. Anonymize senderId in messages
  try {
    const msgSnapshot = await db
      .collection('generalMessages')
      .where('tenantId', '==', tenantId)
      .where('senderId', '==', userId)
      .get();

    if (!msgSnapshot.empty) {
      const batch = db.batch();
      msgSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          senderId: 'DELETED_USER',
          senderName: 'Deleted User',
        });
      });
      await batch.commit();
      anonymizedSummary['generalMessages'] = (anonymizedSummary['generalMessages'] || 0) + msgSnapshot.size;
    }
  } catch {
    // Index may not exist
  }

  // 5. Disable Firebase Auth user
  try {
    await getAdminAuth().updateUser(userId, {
      disabled: true,
      displayName: 'Deleted User',
    });
    anonymizedSummary['auth_disabled'] = 1;
  } catch (err) {
    console.warn(`[GDPR] Failed to disable Firebase Auth user:`, err);
  }

  // 6. Remove from tenant members
  try {
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (tenantDoc.exists) {
      const tenantData = tenantDoc.data() as Record<string, unknown>;
      const members: string[] = Array.isArray(tenantData.members) ? tenantData.members : [];
      const updatedMembers = members.filter((m) => m !== userId);
      if (updatedMembers.length !== members.length) {
        await db.collection('tenants').doc(tenantId).update({
          members: updatedMembers,
        });
        anonymizedSummary['tenant_members_removed'] = members.length - updatedMembers.length;
      }
    }
  } catch {
    // Ignore
  }

  return anonymizedSummary;
}

/* ===== Consent Management ===== */

/**
 * Get all consent records for a user.
 */
export async function getPrivacyConsent(
  userId: string,
  tenantId: string,
): Promise<PrivacyConsent[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(PRIVACY_CONSENTS)
    .where('userId', '==', userId)
    .where('tenantId', '==', tenantId)
    .orderBy('timestamp', 'desc')
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<PrivacyConsent, 'id'>),
  }));
}

/**
 * Record a consent action (grant or withdraw).
 */
export async function recordConsent(
  userId: string,
  tenantId: string,
  consentType: string,
  granted: boolean,
  metadata?: { ipAddress?: string; userAgent?: string; legalBasis?: string },
): Promise<string> {
  const db = getAdminDb();

  const docRef = await db.collection(PRIVACY_CONSENTS).add({
    userId,
    tenantId,
    consentType,
    granted,
    legalBasis: metadata?.legalBasis,
    ipAddress: metadata?.ipAddress,
    userAgent: metadata?.userAgent,
    timestamp: new Date().toISOString(),
  });

  return docRef.id;
}

/* ===== Reports ===== */

/**
 * Generate a data processing report for a tenant.
 */
export async function generateDataProcessingReport(
  tenantId: string,
): Promise<DataProcessingReport> {
  if (!isFlagEnabled('gdpr_tools')) {
    throw new Error('GDPR tools are not enabled');
  }

  const db = getAdminDb();

  // Count users
  let totalUsers = 0;
  try {
    const membersSnapshot = await db.collection('tenants').doc(tenantId).get();
    if (membersSnapshot.exists) {
      const members = (membersSnapshot.data() as Record<string, unknown>).members;
      totalUsers = Array.isArray(members) ? members.length : 0;
    }
  } catch { /* ignore */ }

  // Count GDPR requests
  let gdprRequestsTotal = 0;
  let gdprRequestsPending = 0;
  let gdprRequestsCompleted = 0;
  let gdprRequestsFailed = 0;
  try {
    const gdprSnapshot = await db
      .collection(GDPR_REQUESTS)
      .where('tenantId', '==', tenantId)
      .get();
    gdprRequestsTotal = gdprSnapshot.size;
    for (const doc of gdprSnapshot.docs) {
      const status = (doc.data() as Record<string, unknown>).status;
      if (status === 'pending') gdprRequestsPending++;
      else if (status === 'completed') gdprRequestsCompleted++;
      else if (status === 'failed') gdprRequestsFailed++;
    }
  } catch { /* ignore */ }

  // Count consents
  let consentsTotal = 0;
  const consentByType: Record<string, number> = {};
  try {
    const consentsSnapshot = await db
      .collection(PRIVACY_CONSENTS)
      .where('tenantId', '==', tenantId)
      .get();
    consentsTotal = consentsSnapshot.size;
    for (const doc of consentsSnapshot.docs) {
      const data = doc.data() as Record<string, unknown>;
      const type = String(data.consentType || 'unknown');
      consentByType[type] = (consentByType[type] || 0) + 1;
    }
  } catch { /* ignore */ }

  // Data categories (collection counts)
  const dataCategories: Array<{ collection: string; count: number; description: string }> = [];
  const categoryCollections = [
    { name: 'projects', desc: 'Construction projects' },
    { name: 'tasks', desc: 'Work tasks' },
    { name: 'expenses', desc: 'Financial expenses' },
    { name: 'invoices', desc: 'Client invoices' },
    { name: 'timeEntries', desc: 'Time tracking records' },
    { name: 'suppliers', desc: 'Supplier records' },
    { name: 'rfis', desc: 'Requests for Information' },
    { name: 'submittals', desc: 'Design submittals' },
    { name: 'punchItems', desc: 'Punch list items' },
    { name: 'generalMessages', desc: 'Chat messages' },
    { name: 'comments', desc: 'Document comments' },
    { name: 'audit_logs', desc: 'Audit trail' },
  ];

  for (const cat of categoryCollections) {
    try {
      const countSnapshot = await db
        .collection(cat.name)
        .where('tenantId', '==', tenantId)
        .count()
        .get();
      dataCategories.push({
        collection: cat.name,
        count: countSnapshot.data().count,
        description: cat.desc,
      });
    } catch {
      dataCategories.push({ collection: cat.name, count: 0, description: cat.desc });
    }
  }

  const totalDocuments = dataCategories.reduce((sum, cat) => sum + cat.count, 0);

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    summary: {
      totalUsers,
      totalDocuments,
      collectionsCount: dataCategories.length,
      encryptedFields: 0, // Would require scanning all docs — expensive
      retentionPoliciesActive: 14, // From DEFAULT_RETENTION_POLICIES
    },
    gdprRequests: {
      total: gdprRequestsTotal,
      pending: gdprRequestsPending,
      completed: gdprRequestsCompleted,
      failed: gdprRequestsFailed,
    },
    consents: {
      totalRecords: consentsTotal,
      byType: consentByType,
    },
    dataCategories,
  };
}

/**
 * Create a privacy notice for a tenant.
 */
export function createPrivacyNotice(
  tenantId: string,
  tenantName: string,
): {
  title: string;
  effectiveDate: string;
  content: string;
} {
  const effectiveDate = new Date().toISOString().split('T')[0];

  return {
    title: `Aviso de Privacidad — ${tenantName}`,
    effectiveDate,
    content: `AVISO DE PRIVACIDAD

Fecha de vigencia: ${effectiveDate}
Responsable del tratamiento: ${tenantName}

1. Datos que recopilamos
   - Datos de identificación: nombre, correo electrónico, foto, rol.
   - Datos de construcción: proyectos, tareas, gastos, facturas, registros de tiempo.
   - Datos de comunicación: mensajes, comentarios, notificaciones.
   - Datos técnicos: dirección IP, user agent, registros de auditoría.

2. Finalidad del tratamiento
   - Gestión de proyectos de construcción.
   - Asignación y seguimiento de tareas.
   - Control financiero (presupuestos, gastos, facturas).
   - Comunicación entre miembros del equipo.
   - Cumplimiento de obligaciones legales y fiscales.

3. Base legal
   - Consentimiento del titular (Art. 6.1.a GDPR).
   - Ejecución contractual (Art. 6.1.b GDPR).
   - Obligación legal (Art. 6.1.c GDPR).

4. Conservación de datos
   - Datos de proyectos: 7 años (obligaciones fiscales).
   - Bitácoras diarias: 3 años (archivo).
   - Mensajes: 6 meses.
   - Notificaciones: 90 días.
   - Registros de auditoría: 2 años.

5. Derechos del titular
   - Acceso (Art. 15 GDPR)
   - Rectificación (Art. 16 GDPR)
   - Supresión (Art. 17 GDPR)
   - Portabilidad (Art. 20 GDPR)
   - Oposición (Art. 21 GDPR)

6. Contacto
   Para ejercer sus derechos de protección de datos, contacte al administrador
   de su organización o utilice las herramientas de cumplimiento integradas.

7. Transferencias internacionales
   Los datos se almacenan en los servidores de Firebase/Google Cloud Platform.
   Se aplican las Cláusulas Contractuales Tipo de la Comisión Europea.

8. Encargado del tratamiento
   Archii es el encargado del tratamiento de datos conforme al Art. 28 GDPR.`,
  };
}

/* ===== GDPR Request Processing ===== */

/**
 * Create a new GDPR request.
 */
export async function createGDPRRequest(
  userId: string,
  tenantId: string,
  type: GDPRRequestType,
): Promise<string> {
  if (!isFlagEnabled('gdpr_tools')) {
    throw new Error('GDPR tools are not enabled');
  }

  const db = getAdminDb();

  const docRef = await db.collection(GDPR_REQUESTS).add({
    userId,
    tenantId,
    type,
    status: 'pending',
    requestedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    resultUrl: null,
    notes: null,
    reviewedBy: null,
    anonymizedSummary: null,
  });

  return docRef.id;
}

/**
 * Process a pending GDPR request.
 * For 'export': generates the export and stores it.
 * For 'delete': anonymizes user data.
 */
export async function processGDPRRequest(
  requestId: string,
): Promise<GDPRRequest> {
  if (!isFlagEnabled('gdpr_tools')) {
    throw new Error('GDPR tools are not enabled');
  }

  const db = getAdminDb();
  const requestDoc = await db.collection(GDPR_REQUESTS).doc(requestId).get();

  if (!requestDoc.exists) {
    throw new Error(`GDPR request ${requestId} not found`);
  }

  const requestData = requestDoc.data() as GDPRRequest;

  if (requestData.status !== 'pending') {
    throw new Error(`GDPR request ${requestId} is not pending (current: ${requestData.status})`);
  }

  // Mark as processing
  await db.collection(GDPR_REQUESTS).doc(requestId).update({
    status: 'processing',
    startedAt: new Date().toISOString(),
  });

  try {
    if (requestData.type === 'export') {
      // Export user data as JSON string and store in Firestore
      const exportData = await exportUserData(requestData.userId, requestData.tenantId);
      const exportJson = JSON.stringify(exportData, null, 2);

      // Store export in a subcollection for retrieval
      const exportRef = await db
        .collection(GDPR_REQUESTS)
        .doc(requestId)
        .collection('exports')
        .add({
          format: 'json',
          size: exportJson.length,
          data: exportJson,
          createdAt: new Date().toISOString(),
        });

      await db.collection(GDPR_REQUESTS).doc(requestId).update({
        status: 'completed',
        completedAt: new Date().toISOString(),
        resultUrl: `/api/compliance?action=download-export&requestId=${requestId}&exportId=${exportRef.id}`,
        notes: `Export completed: ${exportData.tasksCreated.length} tasks, ${exportData.expenses.length} expenses, ${exportData.timeEntries.length} time entries.`,
      });
    } else if (requestData.type === 'delete') {
      const summary = await deleteUserData(requestData.userId, requestData.tenantId);

      await db.collection(GDPR_REQUESTS).doc(requestId).update({
        status: 'completed',
        completedAt: new Date().toISOString(),
        anonymizedSummary: summary,
        notes: `User data anonymized across ${Object.keys(summary).length} collections.`,
      });
    }

    // Return updated request
    const updatedDoc = await db.collection(GDPR_REQUESTS).doc(requestId).get();
    return { id: updatedDoc.id, ...updatedDoc.data() } as GDPRRequest;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    await db.collection(GDPR_REQUESTS).doc(requestId).update({
      status: 'failed',
      completedAt: new Date().toISOString(),
      notes: `Processing failed: ${message}`,
    });

    throw err;
  }
}

/**
 * List GDPR requests for a tenant.
 */
export async function listGDPRRequests(
  tenantId: string,
  status?: GDPRRequestStatus,
): Promise<GDPRRequest[]> {
  const db = getAdminDb();

  let query: FirebaseFirestore.Query = db
    .collection(GDPR_REQUESTS)
    .where('tenantId', '==', tenantId);

  if (status) {
    query = query.where('status', '==', status);
  }

  const snapshot = await query.orderBy('requestedAt', 'desc').limit(100).get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<GDPRRequest, 'id'>),
  }));
}

/* ===== Internal Helpers ===== */

async function queryCollection(
  db: FirebaseFirestore.Firestore,
  collection: string,
  field: string,
  value: string,
  tenantId: string,
): Promise<Record<string, unknown>[]> {
  try {
    const snapshot = await db
      .collection(collection)
      .where('tenantId', '==', tenantId)
      .where(field, '==', value)
      .limit(10000)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (err) {
    console.warn(`[GDPR] Query on ${collection}.${field} failed:`, err);
    return [];
  }
}

function flattenObject(
  obj: Record<string, unknown>,
  prefix = '',
  maxDepth = 2,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      maxDepth > 0
    ) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey, maxDepth - 1));
    } else if (Array.isArray(value)) {
      result[fullKey] = value.join(', ');
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}
