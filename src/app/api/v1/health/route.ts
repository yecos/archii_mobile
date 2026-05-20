/**
 * /api/v1/health/route.ts
 * Health check endpoint público (no requiere auth).
 *
 * GET /api/v1/health
 *   — Retorna estado del servicio, uptime, versión.
 */

import { NextResponse } from 'next/server';

const START_TIME = Date.now();

export async function GET() {
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);

  return NextResponse.json({
    status: 'ok',
    service: 'Archii API',
    version: '2.0.0',
    uptime: `${hours}h ${minutes}m`,
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET  /api/v1/health',
      'GET  /api/v1/projects',
      'POST /api/v1/projects',
      'GET  /api/v1/tasks',
      'POST /api/v1/tasks',
    ],
    auth_methods: ['X-API-Key', 'Authorization: Bearer'],
  });
}
