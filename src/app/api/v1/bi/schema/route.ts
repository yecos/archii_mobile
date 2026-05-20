/**
 * /api/v1/bi/schema/route.ts
 * BI schema discovery endpoint.
 *
 * GET /api/v1/bi/schema
 *
 * Returns the BI schema for all available collections.
 * Used by BI tools (Power BI, Tableau) to configure data sources.
 *
 * No authentication required — this is public schema metadata only.
 * Gated by feature flag 'bi_connector'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isFlagEnabled } from '@/lib/feature-flags';
import { getBISchema, getAvailableCollections } from '@/lib/bi-export';

export async function GET(_request: NextRequest) {
  try {
    // Feature flag gate
    if (!isFlagEnabled('bi_connector')) {
      return NextResponse.json(
        { error: 'BI Connector no habilitado. Activa la feature flag bi_connector.' },
        { status: 403 },
      );
    }

    const schema = getBISchema();

    // Return schema with minimal metadata
    return NextResponse.json(
      {
        ...schema,
        _meta: {
          endpoint: '/api/v1/bi/schema',
          exportEndpoints: {
            csv: '/api/v1/export/csv',
            json: '/api/v1/export/json',
          },
          maxRowsPerRequest: 10000,
          supportedFormats: ['csv', 'json', 'parquet'],
          authMethods: ['api_key', 'bearer_token'],
          documentationUrl: 'https://docs.archii.co/bi-connector',
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600', // Cache for 1 hour — schema changes rarely
        },
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    console.error('[API /bi/schema] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * HEAD — lightweight check for BI Connector availability.
 * Returns 200 if BI Connector is enabled, 403 otherwise.
 */
export async function HEAD(_request: NextRequest) {
  if (!isFlagEnabled('bi_connector')) {
    return new NextResponse(null, { status: 403 });
  }

  const collections = getAvailableCollections();
  return new NextResponse(null, {
    status: 200,
    headers: {
      'X-BI-Collections': collections.join(','),
      'X-BI-Schema-Version': '1.0.0',
    },
  });
}
