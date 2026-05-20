/**
 * /api/scim/route.ts
 * SCIM 2.0 endpoint para provisioning automático de usuarios.
 *
 * Recibe webhooks del IdP (Azure AD, Okta, Google Workspace)
 * cuando se crean, actualizan o eliminan usuarios.
 *
 * POST /api/scim
 *   Headers: X-Webhook-Signature: HMAC-SHA256
 *   Body: { operation, tenantId, user: SCIMUser }
 *
 * GET /api/scim?tenantId=xxx
 *   — Lista eventos SCIM recientes (debug)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  processSCIMEvent,
  verifySCIMSignature,
  getSSOConfig,
  type SCIMEvent,
} from '@/lib/sso-service';
import { getAdminDb } from '@/lib/firebase-admin';
import { isFlagEnabled } from '@/lib/feature-flags';

export async function POST(request: NextRequest) {
  try {
    if (!isFlagEnabled('sso_saml')) {
      return NextResponse.json({ error: 'SCIM no habilitado' }, { status: 403 });
    }

    // Leer body raw para verificar firma
    const rawBody = await request.text();
    let body: SCIMEvent;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const { tenantId, user } = body;
    if (!tenantId || !user) {
      return NextResponse.json(
        { error: 'tenantId y user son requeridos' },
        { status: 400 }
      );
    }

    // SECURITY: HMAC signature is mandatory for SCIM events
    const signature = request.headers.get('x-webhook-signature');
    if (!signature) {
      console.error(`[SCIM] Missing signature for tenant ${tenantId} — rejected`);
      return NextResponse.json({ error: 'Firma HMAC requerida' }, { status: 401 });
    }

    const config = await getSSOConfig(tenantId);
    if (!config?.scimSecret) {
      return NextResponse.json(
        { error: 'SCIM no configurado para este tenant' },
        { status: 400 }
      );
    }

    const verified = verifySCIMSignature(rawBody, signature, config.scimSecret);
    if (!verified) {
      console.error(`[SCIM] Firma inválida para tenant ${tenantId}`);
      return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
    }
    body.verified = true;

    body.timestamp = new Date().toISOString();

    // Procesar evento
    const result = await processSCIMEvent(body);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[SCIM API] Error:', error?.message);
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!isFlagEnabled('sso_saml')) {
      return NextResponse.json({ error: 'SCIM no habilitado' }, { status: 403 });
    }

    const { requireAuth, AuthError } = await import('@/lib/api-auth');
    let user;
    try {
      user = await requireAuth(request);
    } catch (err) {
      if (err instanceof AuthError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

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
    const snapshot = await db
      .collection('scim_events')
      .where('tenantId', '==', tenantId)
      .orderBy('processedAt', 'desc')
      .limit(50)
      .get();

    const events = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        operation: data.operation,
        email: data.user?.emails?.[0]?.value,
        active: data.user?.active,
        verified: data.verified,
        processedAt: data.processedAt,
        timestamp: data.timestamp,
      };
    });

    return NextResponse.json({ events, count: events.length });
  } catch (error: any) {
    console.error('[SCIM API] Error:', error?.message);
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
