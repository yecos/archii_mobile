/**
 * /api/compliance/route.ts
 * Compliance & Security API endpoint.
 *
 * GET  actions:
 *   - 'retention-status'  — Get data retention status for all collections
 *   - 'gdpr-requests'     — List GDPR requests for a tenant
 *   - 'privacy-report'    — Generate a full data processing report
 *
 * POST actions:
 *   - 'export-data'       — Create a GDPR data export request
 *   - 'delete-data'       — Create a GDPR deletion request
 *   - 'archive-collection'— Archive documents older than threshold
 *   - 'evaluate-policies' — Evaluate retention policies and return actionable items
 *
 * Auth: Firebase auth + Admin/Director role check.
 * All operations logged to audit_logs.
 * Gated by feature flags 'gdpr_tools' and 'field_encryption'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthUser } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { isFlagEnabled } from '@/lib/feature-flags';
import {
  getRetentionStatus,
  evaluateRetentionPolicies,
  archiveCollection,
  deleteCollection,
} from '@/lib/retention-policy';
import {
  exportUserData,
  exportUserDataCSV,
  deleteUserData,
  createGDPRRequest,
  processGDPRRequest,
  listGDPRRequests,
  generateDataProcessingReport,
  createPrivacyNotice,
  getPrivacyConsent,
  recordConsent,
} from '@/lib/gdpr-service';
import {
  getTenantKeyMetadata,
  generateEncryptionKey,
  storeTenantKey,
  rotateTenantKey,
  detectSensitiveFields,
} from '@/lib/encryption';

/* ===== Role check ===== */

const ALLOWED_ROLES = ['Admin', 'Director', 'SuperAdmin'];

async function hasComplianceAccess(user: AuthUser, tenantId: string): Promise<boolean> {
  // SEC-H02: Verify role from Firestore (authoritative) instead of relying on token claims
  // Token claims may be stale if custom claims haven't been synced yet.
  try {
    const db = getAdminDb();
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (userDoc.exists) {
      const firestoreRole = userDoc.data()?.role;
      if (firestoreRole && ALLOWED_ROLES.includes(firestoreRole)) return true;
    }
  } catch (err) {
    console.error('[Compliance] Error checking Firestore role, falling back to token claim:', err);
  }
  // Fallback to token claim if Firestore lookup fails
  if (user.role && ALLOWED_ROLES.includes(user.role)) return true;
  return false;
}

/* ===== Audit logging helper ===== */

async function logComplianceAction(
  action: string,
  userId: string,
  tenantId: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    const db = getAdminDb();
    await db.collection('audit_logs').add({
      collection: 'compliance',
      docId: `compliance:${action}:${Date.now()}`,
      action: action as any,
      userId,
      tenantId,
      before: null,
      after: details,
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
      metadata: { source: 'compliance_api' },
    });
  } catch (err) {
    console.error('[Compliance API] Audit log failed:', err);
  }
}

/* ===== GET handler ===== */

export async function GET(request: NextRequest) {
  try {
    // At least one compliance feature flag must be enabled
    if (!isFlagEnabled('gdpr_tools') && !isFlagEnabled('field_encryption')) {
      return NextResponse.json(
        { error: 'Herramientas de cumplimiento no habilitadas. Activa gdpr_tools o field_encryption.' },
        { status: 403 },
      );
    }

    // Auth + role check
    const user = await authenticateRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Autenticación requerida' }, { status: 401 });
    }

    const tenantId = request.headers.get('x-tenant-id') || request.nextUrl.searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido (header x-tenant-id o query param)' }, { status: 400 });
    }

    if (!(await hasComplianceAccess(user, tenantId))) {
      return NextResponse.json(
        { error: 'Acceso denegado. Se requiere rol Admin o Director.' },
        { status: 403 },
      );
    }

    const db = getAdminDb();
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }
    const tData = tenantDoc.data()!;
    const hasAccess = (tData.members || []).includes(user.uid) || tData.createdBy === user.uid || (tData.superAdmins || []).includes(user.uid);
    if (!hasAccess) {
      return NextResponse.json({ error: 'No tienes acceso a este tenant' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (!action) {
      return NextResponse.json({ error: 'Query param "action" requerido. Valores: retention-status, gdpr-requests, privacy-report' }, { status: 400 });
    }

    switch (action) {
      /* ---- Retention Status ---- */
      case 'retention-status': {
        if (!isFlagEnabled('gdpr_tools')) {
          return NextResponse.json({ error: 'gdpr_tools no habilitado' }, { status: 403 });
        }
        const status = await getRetentionStatus(tenantId);
        await logComplianceAction('retention-status', user.uid, tenantId, { collections: status.length });
        return NextResponse.json({ retentionStatus: status });
      }

      /* ---- GDPR Requests List ---- */
      case 'gdpr-requests': {
        if (!isFlagEnabled('gdpr_tools')) {
          return NextResponse.json({ error: 'gdpr_tools no habilitado' }, { status: 403 });
        }
        const status = searchParams.get('status') as any;
        const requests = await listGDPRRequests(tenantId, status || undefined);
        await logComplianceAction('gdpr-requests-list', user.uid, tenantId, { count: requests.length });
        return NextResponse.json({ requests });
      }

      /* ---- Privacy Report ---- */
      case 'privacy-report': {
        if (!isFlagEnabled('gdpr_tools')) {
          return NextResponse.json({ error: 'gdpr_tools no habilitado' }, { status: 403 });
        }
        const report = await generateDataProcessingReport(tenantId);
        await logComplianceAction('privacy-report', user.uid, tenantId, { generated: true });
        return NextResponse.json({ report });
      }

      /* ---- Privacy Notice ---- */
      case 'privacy-notice': {
        if (!isFlagEnabled('gdpr_tools')) {
          return NextResponse.json({ error: 'gdpr_tools no habilitado' }, { status: 403 });
        }
        const notice = createPrivacyNotice(tenantId, `Tenant ${tenantId}`);
        return NextResponse.json({ notice });
      }

      /* ---- Encryption Key Metadata ---- */
      case 'encryption-keys': {
        if (!isFlagEnabled('field_encryption')) {
          return NextResponse.json({ error: 'field_encryption no habilitado' }, { status: 403 });
        }
        const keyMeta = await getTenantKeyMetadata(tenantId);
        await logComplianceAction('encryption-keys-view', user.uid, tenantId, {});
        return NextResponse.json({ encryptionKey: keyMeta });
      }

      /* ---- Download Export ---- */
      case 'download-export': {
        if (!isFlagEnabled('gdpr_tools')) {
          return NextResponse.json({ error: 'gdpr_tools no habilitado' }, { status: 403 });
        }
        const requestId = searchParams.get('requestId');
        const exportId = searchParams.get('exportId');
        if (!requestId || !exportId) {
          return NextResponse.json({ error: 'requestId y exportId requeridos' }, { status: 400 });
        }

        const db = getAdminDb();
        const exportDoc = await db
          .collection('gdpr_requests')
          .doc(requestId)
          .collection('exports')
          .doc(exportId)
          .get();

        if (!exportDoc.exists) {
          return NextResponse.json({ error: 'Exportación no encontrada' }, { status: 404 });
        }

        const exportData = exportDoc.data() as { data: string; format: string; createdAt: string };
        const format = searchParams.get('format') || exportData.format || 'json';

        await logComplianceAction('export-download', user.uid, tenantId, { requestId, exportId });

        if (format === 'csv') {
          return new NextResponse(exportData.data, {
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': `attachment; filename="gdpr-export-${requestId}.csv"`,
            },
          });
        }

        return new NextResponse(exportData.data, {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="gdpr-export-${requestId}.json"`,
          },
        });
      }

      default:
        return NextResponse.json({ error: `Acción GET desconocida: ${action}` }, { status: 400 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    console.error('[API /compliance] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ===== POST handler ===== */

export async function POST(request: NextRequest) {
  try {
    // At least one compliance feature flag must be enabled
    if (!isFlagEnabled('gdpr_tools') && !isFlagEnabled('field_encryption')) {
      return NextResponse.json(
        { error: 'Herramientas de cumplimiento no habilitadas. Activa gdpr_tools o field_encryption.' },
        { status: 403 },
      );
    }

    // Auth + role check
    const user = await authenticateRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Autenticación requerida' }, { status: 401 });
    }

    const body = await request.json();
    const { action, tenantId } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido en body' }, { status: 400 });
    }

    if (!(await hasComplianceAccess(user, tenantId))) {
      return NextResponse.json(
        { error: 'Acceso denegado. Se requiere rol Admin o Director.' },
        { status: 403 },
      );
    }

    // Verify tenant membership
    const db = getAdminDb();
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }
    const tData = tenantDoc.data()!;
    const hasAccess = (tData.members || []).includes(user.uid) || tData.createdBy === user.uid || (tData.superAdmins || []).includes(user.uid);
    if (!hasAccess) {
      return NextResponse.json({ error: 'No tienes acceso a este tenant' }, { status: 403 });
    }

    if (!action) {
      return NextResponse.json({ error: '"action" requerido en body. Valores: export-data, delete-data, archive-collection, evaluate-policies' }, { status: 400 });
    }

    switch (action) {
      /* ---- Export User Data (GDPR Art. 20) ---- */
      case 'export-data': {
        if (!isFlagEnabled('gdpr_tools')) {
          return NextResponse.json({ error: 'gdpr_tools no habilitado' }, { status: 403 });
        }

        const { userId } = body;
        if (!userId) {
          return NextResponse.json({ error: 'userId requerido' }, { status: 400 });
        }

        // SEC-M11: Verify target userId belongs to the same tenant
        const targetUserDoc = await db.collection('users').doc(userId).get();
        if (targetUserDoc.exists) {
          const targetTenantId = targetUserDoc.data()?.defaultTenantId;
          if (targetTenantId !== tenantId) {
            // Also check if userId is in tenant members
            const isInMembers = (tData.members || []).includes(userId);
            if (!isInMembers) {
              return NextResponse.json({ error: 'El usuario no pertenece a este tenant' }, { status: 403 });
            }
          }
        }

        // Create a GDPR request
        const requestId = await createGDPRRequest(userId, tenantId, 'export');
        await logComplianceAction('export-data-request', user.uid, tenantId, { targetUserId: userId, requestId });

        // Process it immediately (synchronous for small datasets)
        try {
          const result = await processGDPRRequest(requestId);
          return NextResponse.json({
            message: 'Exportación completada',
            requestId: result.id,
            status: result.status,
            resultUrl: result.resultUrl,
            notes: result.notes,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error procesando exportación';
          return NextResponse.json({
            message: 'Exportación iniciada (procesamiento asíncrono)',
            requestId,
            status: 'processing',
            error: msg,
          }, { status: 202 });
        }
      }

      /* ---- Delete User Data (GDPR Art. 17) ---- */
      case 'delete-data': {
        if (!isFlagEnabled('gdpr_tools')) {
          return NextResponse.json({ error: 'gdpr_tools no habilitado' }, { status: 403 });
        }

        const { userId } = body;
        if (!userId) {
          return NextResponse.json({ error: 'userId requerido' }, { status: 400 });
        }

        // SEC-M11: Verify target userId belongs to the same tenant
        const targetUserDoc2 = await db.collection('users').doc(userId).get();
        if (targetUserDoc2.exists) {
          const targetTenantId = targetUserDoc2.data()?.defaultTenantId;
          if (targetTenantId !== tenantId) {
            const isInMembers = (tData.members || []).includes(userId);
            if (!isInMembers) {
              return NextResponse.json({ error: 'El usuario no pertenece a este tenant' }, { status: 403 });
            }
          }
        }

        // Create a GDPR request
        const requestId = await createGDPRRequest(userId, tenantId, 'delete');
        await logComplianceAction('delete-data-request', user.uid, tenantId, { targetUserId: userId, requestId });

        // Process immediately
        try {
          const result = await processGDPRRequest(requestId);
          return NextResponse.json({
            message: 'Datos de usuario anonimizados exitosamente',
            requestId: result.id,
            status: result.status,
            anonymizedSummary: result.anonymizedSummary,
            notes: result.notes,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error procesando eliminación';
          return NextResponse.json({
            message: 'Eliminación iniciada (procesamiento asíncrono)',
            requestId,
            status: 'processing',
            error: msg,
          }, { status: 202 });
        }
      }

      /* ---- Archive Collection ---- */
      case 'archive-collection': {
        if (!isFlagEnabled('gdpr_tools')) {
          return NextResponse.json({ error: 'gdpr_tools no habilitado' }, { status: 403 });
        }

        const { collection, olderThanDays } = body;
        if (!collection || !olderThanDays) {
          return NextResponse.json({ error: 'collection y olderThanDays requeridos' }, { status: 400 });
        }

        const ALLOWED_ARCHIVE_COLLECTIONS = ['tasks', 'expenses', 'meetings', 'comments', 'generalMessages', 'galleryPhotos', 'invMovements', 'invTransfers', 'invoices', 'timeEntries'];
        if (!ALLOWED_ARCHIVE_COLLECTIONS.includes(collection)) {
          return NextResponse.json({ error: `Colección "${collection}" no permitida para archivar` }, { status: 400 });
        }

        const archived = await archiveCollection(tenantId, collection, Number(olderThanDays));
        await logComplianceAction('archive-collection', user.uid, tenantId, {
          collection,
          olderThanDays,
          archivedCount: archived,
        });

        return NextResponse.json({
          message: `Archivados ${archived} documentos de "${collection}"`,
          collection,
          archivedCount: archived,
          archiveCollection: `archive_${collection}`,
        });
      }

      /* ---- Delete Collection ---- */
      case 'delete-collection': {
        if (!isFlagEnabled('gdpr_tools')) {
          return NextResponse.json({ error: 'gdpr_tools no habilitado' }, { status: 403 });
        }

        const { collection, olderThanDays } = body;
        if (!collection || !olderThanDays) {
          return NextResponse.json({ error: 'collection y olderThanDays requeridos' }, { status: 400 });
        }

        const ALLOWED_DELETE_COLLECTIONS = ['tasks', 'expenses', 'meetings', 'comments', 'generalMessages', 'galleryPhotos', 'invMovements', 'invTransfers', 'invoices', 'timeEntries'];
        if (!ALLOWED_DELETE_COLLECTIONS.includes(collection)) {
          return NextResponse.json({ error: `Colección "${collection}" no permitida para eliminar` }, { status: 400 });
        }

        const deleted = await deleteCollection(tenantId, collection, Number(olderThanDays));
        await logComplianceAction('delete-collection', user.uid, tenantId, {
          collection,
          olderThanDays,
          deletedCount: deleted,
        });

        return NextResponse.json({
          message: `Eliminados permanentemente ${deleted} documentos de "${collection}"`,
          collection,
          deletedCount: deleted,
        });
      }

      /* ---- Evaluate Policies ---- */
      case 'evaluate-policies': {
        if (!isFlagEnabled('gdpr_tools')) {
          return NextResponse.json({ error: 'gdpr_tools no habilitado' }, { status: 403 });
        }

        const actionableItems = await evaluateRetentionPolicies(tenantId);
        await logComplianceAction('evaluate-policies', user.uid, tenantId, {
          actionableCount: actionableItems.length,
        });

        return NextResponse.json({
          message: actionableItems.length > 0
            ? `${actionableItems.length} acciones de retención pendientes`
            : 'No hay acciones de retención pendientes',
          actionableItems,
        });
      }

      /* ---- Record Consent ---- */
      case 'record-consent': {
        if (!isFlagEnabled('gdpr_tools')) {
          return NextResponse.json({ error: 'gdpr_tools no habilitado' }, { status: 403 });
        }

        const { userId, consentType, granted } = body;
        if (!userId || !consentType || typeof granted !== 'boolean') {
          return NextResponse.json({ error: 'userId, consentType y granted (boolean) requeridos' }, { status: 400 });
        }

        const consentId = await recordConsent(userId, tenantId, consentType, granted, {
          ipAddress: request.headers.get('x-forwarded-for') || undefined,
          userAgent: request.headers.get('user-agent') || undefined,
        });

        await logComplianceAction('record-consent', user.uid, tenantId, {
          targetUserId: userId,
          consentType,
          granted,
          consentId,
        });

        return NextResponse.json({
          message: 'Consentimiento registrado',
          consentId,
          consentType,
          granted,
        });
      }

      /* ---- Generate Encryption Key ---- */
      case 'generate-encryption-key': {
        if (!isFlagEnabled('field_encryption')) {
          return NextResponse.json({ error: 'field_encryption no habilitado' }, { status: 403 });
        }

        const { label } = body;
        const newKey = generateEncryptionKey();
        const keyId = await storeTenantKey({
          tenantId,
          key: newKey,
          label: label || `Encryption key ${new Date().toISOString()}`,
          createdBy: user.uid,
        });

        await logComplianceAction('generate-encryption-key', user.uid, tenantId, {
          keyId,
          label,
        });

        return NextResponse.json({
          message: 'Clave de encriptación generada y almacenada',
          keyId,
          label,
        });
      }

      /* ---- Rotate Encryption Key ---- */
      case 'rotate-encryption-key': {
        if (!isFlagEnabled('field_encryption')) {
          return NextResponse.json({ error: 'field_encryption no habilitado' }, { status: 403 });
        }

        const { label } = body;
        const newKey = generateEncryptionKey();
        const keyId = await rotateTenantKey({
          tenantId,
          newKey,
          label: label || `Rotated key ${new Date().toISOString()}`,
          rotatedBy: user.uid,
        });

        await logComplianceAction('rotate-encryption-key', user.uid, tenantId, {
          keyId,
        });

        return NextResponse.json({
          message: 'Clave de encriptación rotada exitosamente',
          keyId,
        });
      }

      default:
        return NextResponse.json({ error: `Acción POST desconocida: ${action}` }, { status: 400 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    console.error('[API /compliance] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
