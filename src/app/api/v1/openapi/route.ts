/**
 * /api/v1/openapi/route.ts
 * Genera y sirve la especificación OpenAPI 3.0 de la API pública.
 *
 * GET /api/v1/openapi
 *   — Retorna swagger.json
 */

import { NextRequest, NextResponse } from 'next/server';

const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'Archii API',
    version: '2.0.0',
    description: 'API pública de Archii para gestión de proyectos de arquitectura y construcción.',
    contact: { name: 'Archii', email: 'api@archii.app' },
  },
  servers: [
    { url: 'https://archii-theta.vercel.app/api/v1', description: 'Producción' },
  ],
  security: [
    { ApiKeyAuth: [] },
    { BearerAuth: [] },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API Key obtenida desde /api/v1/keys',
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Firebase ID token (Authorization: Bearer <token>)',
      },
    },
    schemas: {
      Project: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          status: { type: 'string', enum: ['Concepto', 'Diseno', 'Ejecucion', 'Terminado'] },
          client: { type: 'string' },
          location: { type: 'string' },
          budget: { type: 'number' },
          progress: { type: 'number', minimum: 0, maximum: 100 },
          tenantId: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          projectId: { type: 'string' },
          assigneeId: { type: 'string' },
          priority: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
          status: { type: 'string', enum: ['Por hacer', 'En progreso', 'Revision', 'Completado'] },
          dueDate: { type: 'string', format: 'date' },
          tenantId: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        operationId: 'getHealth',
        tags: ['System'],
        security: [],
        responses: { '200': { description: 'Servicio operativo' } },
      },
    },
    '/projects': {
      get: {
        summary: 'Listar proyectos',
        operationId: 'listProjects',
        tags: ['Projects'],
        parameters: [
          { name: 'tenantId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': { description: 'Lista de proyectos' },
          '401': { description: 'No autenticado' },
          '429': { description: 'Rate limit excedido' },
        },
      },
      post: {
        summary: 'Crear proyecto',
        operationId: 'createProject',
        tags: ['Projects'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'status'],
                properties: {
                  name: { type: 'string' },
                  status: { type: 'string' },
                  client: { type: 'string' },
                  location: { type: 'string' },
                  budget: { type: 'number' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Proyecto creado' },
          '403': { description: 'Sin permisos' },
        },
      },
    },
    '/tasks': {
      get: {
        summary: 'Listar tareas',
        operationId: 'listTasks',
        tags: ['Tasks'],
        parameters: [
          { name: 'tenantId', in: 'query', schema: { type: 'string' } },
          { name: 'projectId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: { '200': { description: 'Lista de tareas' } },
      },
      post: {
        summary: 'Crear tarea',
        operationId: 'createTask',
        tags: ['Tasks'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  projectId: { type: 'string' },
                  assigneeId: { type: 'string' },
                  priority: { type: 'string' },
                  status: { type: 'string' },
                  dueDate: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Tarea creada' } },
      },
    },
  },
};

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = [
    'https://archii-theta.vercel.app',
    'https://archii.vercel.app',
    'http://localhost:3000',
  ];
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return NextResponse.json(OPENAPI_SPEC, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = [
    'https://archii-theta.vercel.app',
    'https://archii.vercel.app',
    'http://localhost:3000',
  ];
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
      'Access-Control-Max-Age': '86400',
    },
  });
}
