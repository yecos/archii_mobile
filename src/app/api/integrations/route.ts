/**
 * /api/integrations/route.ts
 * API route for integration management (Marketplace).
 *
 * GET  /api/integrations?tenantId=xxx
 *   — Lists available providers + installed integrations for tenant
 *
 * POST /api/integrations
 *   Body: { action: 'install',    tenantId, providerId, config, events? }
 *   Body: { action: 'uninstall',  tenantId, instanceId }
 *   Body: { action: 'update',     tenantId, instanceId, config }
 *   Body: { action: 'trigger',    tenantId, instanceId, event, payload }
 *
 * Auth: Firebase auth + tenant membership check
 * Gated by feature flag 'marketplace'
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { isFlagEnabled } from '@/lib/feature-flags';
import { verifyTenantMembership } from '@/lib/tenant-utils';
import {
  getAvailableProviders,
  getTenantIntegrations,
  installIntegration,
  uninstallIntegration,
  updateIntegrationConfig,
  triggerIntegration,
  getIntegrationLogs,
} from '@/lib/marketplace-service';

/* ================================================================
   GET
   ================================================================ */

export async function GET(request: NextRequest) {
  try {
    if (!isFlagEnabled('marketplace')) {
      return NextResponse.json(
        { error: 'Marketplace no habilitado. Habilita la flag NEXT_PUBLIC_FLAG_MARKETPLACE.' },
        { status: 403 }
      );
    }

    const user = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    // Verify tenant membership
    const isMember = await verifyTenantMembership(user.uid, tenantId);
    if (!isMember) {
      return NextResponse.json({ error: 'Sin acceso al tenant' }, { status: 403 });
    }

    const providers = getAvailableProviders();
    const installed = await getTenantIntegrations(tenantId);

    return NextResponse.json({
      providers,
      installed,
      installedCount: installed.length,
    });
  } catch (error: any) {
    console.error('[Integrations API] GET error:', error?.message);
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}

/* ================================================================
   POST
   ================================================================ */

export async function POST(request: NextRequest) {
  try {
    if (!isFlagEnabled('marketplace')) {
      return NextResponse.json(
        { error: 'Marketplace no habilitado' },
        { status: 403 }
      );
    }

    const user = await requireAuth(request);
    const body = await request.json();
    const { action, tenantId } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    // Verify tenant membership
    const isMember = await verifyTenantMembership(user.uid, tenantId);
    if (!isMember) {
      return NextResponse.json({ error: 'Sin acceso al tenant' }, { status: 403 });
    }

    // SEC-H04: For install, uninstall, and update actions, require Super Admin role
    const requiresSuperAdmin = ['install', 'uninstall', 'update'].includes(action);
    if (requiresSuperAdmin) {
      const { getAdminDb } = await import('@/lib/firebase-admin');
      const db = getAdminDb();
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      if (tenantDoc.exists) {
        const tData = tenantDoc.data()!;
        const isSuperAdmin = tData.createdBy === user.uid || (tData.superAdmins || []).includes(user.uid);
        if (!isSuperAdmin) {
          return NextResponse.json({ error: 'Solo Super Admin puede instalar, desinstalar o actualizar integraciones' }, { status: 403 });
        }
      }
    }

    switch (action) {
      /* ---- INSTALL ---- */
      case 'install': {
        if (!body.providerId?.trim()) {
          return NextResponse.json({ error: 'providerId requerido' }, { status: 400 });
        }
        if (!body.config || typeof body.config !== 'object') {
          return NextResponse.json({ error: 'config requerido (objeto)' }, { status: 400 });
        }

        const instanceId = await installIntegration(
          tenantId,
          body.providerId,
          body.config,
          user.uid,
          body.events
        );

        return NextResponse.json(
          { message: 'Integración instalada', instanceId },
          { status: 201 }
        );
      }

      /* ---- UNINSTALL ---- */
      case 'uninstall': {
        if (!body.instanceId?.trim()) {
          return NextResponse.json({ error: 'instanceId requerido' }, { status: 400 });
        }

        const deleted = await uninstallIntegration(tenantId, body.instanceId);
        if (!deleted) {
          return NextResponse.json(
            { error: 'Integración no encontrada o sin permisos' },
            { status: 404 }
          );
        }

        return NextResponse.json({ message: 'Integración desinstalada' });
      }

      /* ---- UPDATE CONFIG ---- */
      case 'update': {
        if (!body.instanceId?.trim()) {
          return NextResponse.json({ error: 'instanceId requerido' }, { status: 400 });
        }
        if (!body.config || typeof body.config !== 'object') {
          return NextResponse.json({ error: 'config requerido (objeto)' }, { status: 400 });
        }

        await updateIntegrationConfig(body.instanceId, body.config);
        return NextResponse.json({ message: 'Configuración actualizada' });
      }

      /* ---- TRIGGER EVENT ---- */
      case 'trigger': {
        if (!body.instanceId?.trim()) {
          return NextResponse.json({ error: 'instanceId requerido' }, { status: 400 });
        }
        if (!body.event?.trim()) {
          return NextResponse.json({ error: 'event requerido' }, { status: 400 });
        }

        const result = await triggerIntegration(
          body.instanceId,
          body.event,
          body.payload || {}
        );

        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({ message: 'Evento despachado correctamente' });
      }

      /* ---- GET LOGS ---- */
      case 'logs': {
        if (!body.instanceId?.trim()) {
          return NextResponse.json({ error: 'instanceId requerido' }, { status: 400 });
        }

        const limit = Math.min(parseInt(body.limit || '50', 10), 200);
        const logs = await getIntegrationLogs(body.instanceId, limit);

        return NextResponse.json({ logs, count: logs.length });
      }

      default:
        return NextResponse.json(
          { error: `Acción no válida: ${action}. Usa 'install', 'uninstall', 'update', 'trigger' o 'logs'` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('[Integrations API] POST error:', error?.message);
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
