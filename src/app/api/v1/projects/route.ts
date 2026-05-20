/**
 * /api/v1/projects/route.ts
 * API pública de proyectos.
 *
 * GET    /api/v1/projects?tenantId=xxx&status=xxx&page=1&limit=20
 * POST   /api/v1/projects  (crear proyecto)
 * GET    /api/v1/projects/[id]  (detalle)
 * PATCH  /api/v1/projects/[id]  (actualizar)
 *
 * Autenticación: API Key (header: X-API-Key) o Bearer token Firebase.
 * Rate limiting: 100 req/min por API key.
 * Gated por feature flag 'public_api'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateAPIKey, checkRateLimit } from '@/lib/rate-limiter';
import { authenticateRequest } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { isFlagEnabled } from '@/lib/feature-flags';

const COLLECTION = 'projects';

async function authenticateV1(request: NextRequest): Promise<{
  authenticated: boolean;
  tenantId?: string;
  apiKeyRecord?: any;
  user?: any;
  error?: { status: number; message: string };
}> {
  // 1. Intentar API Key
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    const record = await validateAPIKey(apiKey);
    if (!record) {
      return { authenticated: false, error: { status: 401, message: 'API Key inválida o revocada' } };
    }

    // Rate limit
    const rateResult = await checkRateLimit(`apikey:${record.keyPrefix}`, record.rateLimit);
    if (!rateResult.allowed) {
      return { authenticated: false, error: { status: 429, message: 'Rate limit excedido. Intenta más tarde.' } };
    }

    return { authenticated: true, tenantId: record.tenantId, apiKeyRecord: record };
  }

  // 2. Intentar Firebase Bearer token
  const user = await authenticateRequest(request);
  if (user) {
    const tenantId = request.headers.get('x-tenant-id');
    if (!tenantId) {
      return { authenticated: false, error: { status: 400, message: 'x-tenant-id header requerido' } };
    }
    // Verify tenant membership
    const db = getAdminDb();
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return { authenticated: false, error: { status: 404, message: 'Espacio de trabajo no encontrado' } };
    }
    const tenantData = tenantDoc.data()!;
    const members: string[] = tenantData.members || [];
    const superAdmins: string[] = tenantData.superAdmins || [];
    if (!members.includes(user.uid) && !superAdmins.includes(user.uid)) {
      return { authenticated: false, error: { status: 403, message: 'No tienes acceso a este espacio de trabajo' } };
    }
    return { authenticated: true, tenantId, user };
  }

  return { authenticated: false, error: { status: 401, message: 'Autenticación requerida. Usa X-API-Key o Authorization: Bearer.' } };
}

export async function GET(request: NextRequest) {
  try {
    if (!isFlagEnabled('public_api')) {
      return NextResponse.json({ error: 'API pública no habilitada' }, { status: 403 });
    }

    const auth = await authenticateV1(request);
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: auth.error?.message }, { status: auth.error?.status || 401 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = auth.tenantId;
    const status = searchParams.get('status');
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100);

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    const db = getAdminDb();
    let query = db.collection(COLLECTION).where('tenantId', '==', tenantId);

    if (status) {
      query = query.where('status', '==', status);
    }

    // Contar total
    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    // Paginar
    const offset = (page - 1) * limit;
    const snapshot = await query.orderBy('createdAt', 'desc').offset(offset).limit(limit).get();

    const projects = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json(
      { projects, total, page, limit, pages: Math.ceil(total / limit) }
    );
  } catch (error: any) {
    console.error('[API v1 /projects] GET error:', error?.message);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isFlagEnabled('public_api')) {
      return NextResponse.json({ error: 'API pública no habilitada' }, { status: 403 });
    }

    const auth = await authenticateV1(request);
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: auth.error?.message }, { status: auth.error?.status || 401 });
    }

    // Verificar permisos de escritura
    if (auth.apiKeyRecord && !auth.apiKeyRecord.permissions.includes('write')) {
      return NextResponse.json({ error: 'API Key sin permisos de escritura' }, { status: 403 });
    }

    const body = await request.json();
    const tenantId = auth.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    // Validar campos obligatorios
    const required = ['name', 'status'];
    for (const field of required) {
      if (!body[field]?.trim()) {
        return NextResponse.json({ error: `Campo '${field}' requerido` }, { status: 400 });
      }
    }

    const db = getAdminDb();
    const docRef = await db.collection(COLLECTION).add({
      name: (body.name || '').trim(),
      status: (body.status || '').trim(),
      client: body.client || '',
      location: body.location || '',
      description: body.description || '',
      progress: typeof body.progress === 'number' ? body.progress : 0,
      budget: typeof body.budget === 'number' ? body.budget : 0,
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: auth.user?.uid || auth.apiKeyRecord?.createdBy || 'api',
    });

    return NextResponse.json(
      { id: docRef.id, message: 'Proyecto creado' },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[API v1 /projects] POST error:', error?.message);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
