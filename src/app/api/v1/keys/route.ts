/**
 * /api/v1/keys/route.ts
 * Gestión de API Keys.
 *
 * POST /api/v1/keys
 *   Body: { action: 'create', tenantId, name, permissions?, rateLimit?, expiresAt? }
 *
 * GET /api/v1/keys?tenantId=xxx
 *   — Lista API keys del tenant (sin hash)
 *
 * POST /api/v1/keys
 *   Body: { action: 'revoke', tenantId, keyId }
 *   — Revoca una API key
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  createAPIKey,
  listAPIKeys,
  revokeAPIKey,
} from '@/lib/rate-limiter';
import { isFlagEnabled } from '@/lib/feature-flags';

export async function GET(request: NextRequest) {
  try {
    if (!isFlagEnabled('public_api')) {
      return NextResponse.json({ error: 'API pública no habilitada' }, { status: 403 });
    }

    const user = await requireAuth(request);
    const tenantId = new URL(request.url).searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    // Verify tenant membership — prevent cross-tenant access
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }
    const tData = tenantDoc.data()!;
    const isMember = (tData.members || []).includes(user.uid) || tData.createdBy === user.uid || (tData.superAdmins || []).includes(user.uid);
    if (!isMember) {
      return NextResponse.json({ error: 'No eres miembro de este tenant' }, { status: 403 });
    }

    const keys = await listAPIKeys(tenantId);
    return NextResponse.json({ keys, count: keys.length });
  } catch (error: any) {
    console.error('[API Keys] GET error:', error?.message);
    if (error?.status === 401) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isFlagEnabled('public_api')) {
      return NextResponse.json({ error: 'API pública no habilitada' }, { status: 403 });
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
    const isMember = (tData.members || []).includes(user.uid) || tData.createdBy === user.uid || (tData.superAdmins || []).includes(user.uid);
    if (!isMember) {
      return NextResponse.json({ error: 'No eres miembro de este tenant' }, { status: 403 });
    }

    switch (action) {
      case 'create': {
        if (!body.name?.trim()) {
          return NextResponse.json({ error: 'name requerido' }, { status: 400 });
        }

        // Validate permissions
        const allowedPermissions = ['read', 'write', 'export'];
        const perms = (body.permissions || ['read']).filter((p: string) => allowedPermissions.includes(p));
        if (perms.length === 0) {
          return NextResponse.json({ error: 'Permisos inválidos' }, { status: 400 });
        }

        // Validate expiresAt
        if (body.expiresAt && new Date(body.expiresAt) <= new Date()) {
          return NextResponse.json({ error: 'expiresAt debe ser una fecha futura' }, { status: 400 });
        }

        const result = await createAPIKey({
          tenantId,
          name: body.name,
          createdBy: user.uid,
          permissions: perms,
          rateLimit: body.rateLimit ? { limit: Math.min(body.rateLimit.limit || 100, 1000), windowSeconds: Math.max(body.rateLimit.windowSeconds || 60, 10) } : undefined,
          expiresAt: body.expiresAt,
        });

        // Solo mostramos la key completa UNA VEZ
        return NextResponse.json(
          {
            key: result.key,
            message: '⚠️ Guarda esta API Key ahora. No podrás verla de nuevo.',
            keyPrefix: result.record.keyPrefix,
            permissions: result.record.permissions,
            rateLimit: result.record.rateLimit,
            createdAt: result.record.createdAt,
          },
          { status: 201 }
        );
      }

      case 'revoke': {
        if (!body.keyId) {
          return NextResponse.json({ error: 'keyId requerido' }, { status: 400 });
        }

        const revoked = await revokeAPIKey(body.keyId, tenantId);
        if (!revoked) {
          return NextResponse.json({ error: 'API Key no encontrada o no pertenece al tenant' }, { status: 404 });
        }

        return NextResponse.json({ message: 'API Key revocada' });
      }

      default:
        return NextResponse.json(
          { error: `Acción no válida: ${action}. Usa 'create' o 'revoke'` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('[API Keys] POST error:', error?.message);
    if (error?.status === 401) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
