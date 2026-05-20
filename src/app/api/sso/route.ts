/**
 * /api/sso/route.ts
 * Gestión de configuración SSO/SAML por tenant.
 *
 * GET /api/sso?tenantId=xxx
 *   — Obtiene la config SSO activa
 *
 * POST /api/sso
 *   Body: { action: 'save', ...SSOConfig }
 *   Body: { action: 'disable', tenantId }
 *   Body: { action: 'metadata', tenantId }
 *   Body: { action: 'test', tenantId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  saveSSOConfig,
  getSSOConfig,
  disableSSO,
  generateSPMetadata,
  generateSCIMSecret,
  type SSOConfig,
} from '@/lib/sso-service';
import { isFlagEnabled } from '@/lib/feature-flags';

export async function GET(request: NextRequest) {
  try {
    if (!isFlagEnabled('sso_saml')) {
      return NextResponse.json({ error: 'SSO/SAML no habilitado' }, { status: 403 });
    }

    const user = await requireAuth(request);
    const tenantId = new URL(request.url).searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    // Verify tenant membership
    const { getAdminDb } = await import('@/lib/firebase-admin');
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

    const config = await getSSOConfig(tenantId);

    if (!config) {
      return NextResponse.json({
        configured: false,
        message: 'SSO no configurado para este tenant',
      });
    }

    // SEC-M03: No exponer el certificate, SCIM secret, ni roleMapping en la respuesta GET
    // roleMapping reveals internal role structure — only return to Super Admins
    const { idpCertificate, scimSecret, roleMapping, ...safeConfig } = config;

    // Check if caller is Super Admin for roleMapping access
    const isSuperAdmin = tData.createdBy === user.uid || (tData.superAdmins || []).includes(user.uid);

    return NextResponse.json({
      configured: true,
      config: isSuperAdmin ? { ...safeConfig, roleMapping } : safeConfig,
      hasCertificate: !!idpCertificate,
      hasSCIMSecret: !!scimSecret,
    });
  } catch (error: any) {
    console.error('[SSO API] Error:', error?.message);
    if (error?.status === 401) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isFlagEnabled('sso_saml')) {
      return NextResponse.json({ error: 'SSO/SAML no habilitado' }, { status: 403 });
    }

    const user = await requireAuth(request);
    const body = await request.json();
    const { action, tenantId } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    // Verify tenant membership
    const { getAdminDb } = await import('@/lib/firebase-admin');
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

    // For save and disable, require Super Admin
    if (action === 'save' || action === 'disable') {
      const { getAdminDb } = await import('@/lib/firebase-admin');
      const db2 = getAdminDb();
      const tenantDoc2 = await db2.collection('tenants').doc(tenantId).get();
      if (tenantDoc2.exists) {
        const tData2 = tenantDoc2.data()!;
        const isSA = tData2.createdBy === user.uid || (tData2.superAdmins || []).includes(user.uid);
        if (!isSA) {
          return NextResponse.json({ error: 'Solo Super Admin puede modificar SSO' }, { status: 403 });
        }
      }
    }

    switch (action) {
      case 'save': {
        const config: SSOConfig = {
          tenantId,
          provider: body.provider || 'custom',
          idpEntityId: body.idpEntityId,
          idpSsoUrl: body.idpSsoUrl,
          idpCertificate: body.idpCertificate,
          attributeMapping: body.attributeMapping || {
            email: 'email',
            displayName: 'name',
            role: 'role',
          },
          roleMapping: body.roleMapping || {
            admin: ['Admin', 'Director'],
            editor: ['Arquitecto', 'Interventor'],
            viewer: ['Cliente', 'Contratista'],
          },
          autoProvision: body.autoProvision !== false,
          autoDeprovision: body.autoDeprovision !== false,
          active: body.active !== false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: user.uid,
        };

        // Generar SCIM secret si se solicita provisioning
        if (config.autoProvision || config.autoDeprovision) {
          config.scimSecret = generateSCIMSecret();
        }

        const configId = await saveSSOConfig(config);

        return NextResponse.json({
          message: 'Configuración SSO guardada exitosamente',
          configId,
          hasSCIMSecret: !!config.scimSecret,
        });
      }

      case 'disable': {
        await disableSSO(tenantId);
        return NextResponse.json({ message: 'SSO desactivado para el tenant' });
      }

      case 'metadata': {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://archii-theta.vercel.app';
        const entityId = `${baseUrl}/saml/${tenantId}`;
        const metadata = generateSPMetadata(tenantId, entityId);

        return new NextResponse(metadata, {
          headers: { 'Content-Type': 'application/xml' },
        });
      }

      default:
        return NextResponse.json(
          { error: `Acción no válida: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('[SSO API] Error:', error?.message);
    if (error?.status === 401) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
