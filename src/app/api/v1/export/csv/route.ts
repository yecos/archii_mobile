/**
 * /api/v1/export/csv/route.ts
 * CSV data export endpoint for BI tools (Power BI, Tableau, etc.).
 *
 * GET /api/v1/export/csv?collections=projects,tasks&tenantId=xxx&dateFrom=2024-01-01&dateTo=2024-12-31&fields=id,name,status&limit=5000&cursor=xxx&sanitizePII=true
 *
 * Auth: API Key (X-API-Key) or Firebase Bearer token.
 * Rate limited: 10 req/min.
 * Gated by feature flag 'bi_connector'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateAPIKey, checkRateLimit } from '@/lib/rate-limiter';
import { authenticateRequest } from '@/lib/api-auth';
import { isFlagEnabled } from '@/lib/feature-flags';
import { exportToCSV, validateCollections } from '@/lib/bi-export';
import type { BIExportOptions } from '@/lib/bi-export';

/* ---- Auth helper (same pattern as /api/v1/projects) ---- */

async function authenticateExport(
  request: NextRequest,
): Promise<{
  authenticated: boolean;
  tenantId?: string;
  apiKeyRecord?: any;
  error?: { status: number; message: string };
}> {
  // 1. Try API Key
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    const record = await validateAPIKey(apiKey);
    if (!record) {
      return { authenticated: false, error: { status: 401, message: 'API Key inválida o revocada' } };
    }
    // Check 'export' permission
    if (!record.permissions.includes('read') && !record.permissions.includes('export')) {
      return { authenticated: false, error: { status: 403, message: 'API Key sin permisos de exportación' } };
    }
    return { authenticated: true, tenantId: record.tenantId, apiKeyRecord: record };
  }

  // 2. Try Firebase Bearer token
  const user = await authenticateRequest(request);
  if (user) {
    const tenantId = request.headers.get('x-tenant-id');
    if (!tenantId) {
      return { authenticated: false, error: { status: 400, message: 'Header x-tenant-id requerido' } };
    }
    // Verify tenant membership — prevent cross-tenant access
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return { authenticated: false, error: { status: 404, message: 'Espacio de trabajo no encontrado' } };
    }
    const tData = tenantDoc.data()!;
    const isMember = (tData.members || []).includes(user.uid) || tData.createdBy === user.uid || (tData.superAdmins || []).includes(user.uid);
    if (!isMember) {
      return { authenticated: false, error: { status: 403, message: 'No tienes acceso a este espacio de trabajo' } };
    }
    return { authenticated: true, tenantId };
  }

  return { authenticated: false, error: { status: 401, message: 'Autenticación requerida. Usa X-API-Key o Authorization: Bearer.' } };
}

/* ---- Rate-limit config for export endpoints ---- */

const EXPORT_RATE_LIMIT = { limit: 10, windowSeconds: 60 };

/* ---- GET handler ---- */

export async function GET(request: NextRequest) {
  try {
    // Feature flag gate
    if (!isFlagEnabled('bi_connector')) {
      return NextResponse.json(
        { error: 'BI Connector no habilitado. Activa la feature flag bi_connector.' },
        { status: 403 },
      );
    }

    // Auth
    const auth = await authenticateExport(request);
    if (!auth.authenticated || auth.error) {
      return NextResponse.json({ error: auth.error?.message }, { status: auth.error?.status || 401 });
    }

    // Rate limit
    const rateKey = `export:csv:${auth.apiKeyRecord?.keyPrefix || auth.tenantId || 'unknown'}`;
    const rateResult = await checkRateLimit(rateKey, EXPORT_RATE_LIMIT);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit excedido. Máximo 10 exportaciones CSV por minuto.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(0, rateResult.resetAt - Date.now())),
            'X-RateLimit-Limit': String(rateResult.limit),
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const tenantId = auth.tenantId;
    const collectionsParam = searchParams.get('collections');
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;

    // Validate date formats
    if (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      return NextResponse.json({ error: 'dateFrom debe tener formato YYYY-MM-DD' }, { status: 400 });
    }
    if (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return NextResponse.json({ error: 'dateTo debe tener formato YYYY-MM-DD' }, { status: 400 });
    }

    const fieldsParam = searchParams.get('fields');
    const limitParam = searchParams.get('limit');
    const cursor = searchParams.get('cursor') || undefined;
    const sanitizePII = searchParams.get('sanitizePII') === 'true';

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    if (!collectionsParam) {
      return NextResponse.json({ error: 'collections query param requerido (coma-separado)' }, { status: 400 });
    }

    const collections = collectionsParam.split(',').map((c) => c.trim()).filter(Boolean);
    if (collections.length === 0) {
      return NextResponse.json({ error: 'Al menos una colección requerida' }, { status: 400 });
    }

    // Validate collection names
    const validation = validateCollections(collections);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Colecciones desconocidas: ${validation.unknown.join(', ')}` },
        { status: 400 },
      );
    }

    // Build options
    const options: BIExportOptions = {
      tenantId,
      collections,
      format: 'csv',
      dateFrom,
      dateTo,
      limit: limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 1000, 1), 10000) : undefined,
      cursor,
      fields: fieldsParam ? fieldsParam.split(',').map((f) => f.trim()) : undefined,
      sanitizePII,
    };

    // Execute export
    const result = await exportToCSV(options);

    // Build filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `archii-export-${timestamp}.csv`;

    // Return CSV with proper headers
    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Export-Row-Count': String(result.rowCount),
        'X-Export-Next-Cursor': result.nextCursor || '',
        'X-RateLimit-Limit': String(rateResult.limit),
        'X-RateLimit-Remaining': String(rateResult.remaining),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    console.error('[API /export/csv] GET error:', message);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
