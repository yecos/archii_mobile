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
    description:
      'API pública de Archii para gestión de proyectos de arquitectura y construcción. ' +
      'Autenticación mediante API Key (X-API-Key) o Firebase Bearer Token. ' +
      'Todos los endpoints con datos están aislados por tenant.',
    contact: { name: 'Archii', email: 'api@archii.app' },
  },
  servers: [
    { url: 'https://archii-theta.vercel.app/api/v1', description: 'Producción' },
  ],
  security: [
    { ApiKeyAuth: [] },
    { BearerAuth: [] },
  ],
  tags: [
    { name: 'System', description: 'Endpoints del sistema (health, metadata)' },
    { name: 'Projects', description: 'CRUD de proyectos' },
    { name: 'Tasks', description: 'CRUD de tareas' },
    { name: 'API Keys', description: 'Gestión de claves API' },
    { name: 'BI & Export', description: 'Conector BI y exportación de datos' },
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
        description: 'Firebase ID token (Authorization: Bearer <token>) + header x-tenant-id',
      },
    },
    schemas: {
      Project: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID del documento en Firestore' },
          name: { type: 'string' },
          status: { type: 'string', enum: ['Concepto', 'Diseno', 'Ejecucion', 'Terminado'] },
          client: { type: 'string' },
          location: { type: 'string' },
          description: { type: 'string' },
          budget: { type: 'number', description: 'Presupuesto en COP' },
          progress: { type: 'number', minimum: 0, maximum: 100 },
          tenantId: { type: 'string' },
          createdBy: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
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
          assigneeIds: { type: 'array', items: { type: 'string' } },
          priority: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
          status: { type: 'string', enum: ['Por hacer', 'En progreso', 'Revision', 'Completado'] },
          dueDate: { type: 'string', format: 'date' },
          startDate: { type: 'string', format: 'date' },
          phaseId: { type: 'string' },
          estimatedHours: { type: 'number' },
          tags: { type: 'array', items: { type: 'string' } },
          subtasks: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' } } } },
          tenantId: { type: 'string' },
          createdBy: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time' },
        },
      },
      APIKey: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          keyPrefix: { type: 'string', description: 'Primeros 8 caracteres de la clave' },
          permissions: { type: 'array', items: { type: 'string', enum: ['read', 'write', 'export'] } },
          rateLimit: { type: 'object', properties: { limit: { type: 'integer' }, windowSeconds: { type: 'integer' } } },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          revokedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      PaginatedProjects: {
        type: 'object',
        properties: {
          projects: { type: 'array', items: { $ref: '#/components/schemas/Project' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          pages: { type: 'integer' },
        },
      },
      PaginatedTasks: {
        type: 'object',
        properties: {
          tasks: { type: 'array', items: { $ref: '#/components/schemas/Task' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          pages: { type: 'integer' },
        },
      },
      ExportPagination: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          rowCount: { type: 'integer' },
          nextCursor: { type: 'string', nullable: true },
          hasMore: { type: 'boolean' },
        },
      },
      ExportInfo: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['csv', 'json'] },
          collections: { type: 'array', items: { type: 'string' } },
          tenantId: { type: 'string' },
          exportedAt: { type: 'string', format: 'date-time' },
          piiSanitized: { type: 'boolean' },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
    },
    parameters: {
      tenantIdHeader: {
        name: 'x-tenant-id',
        in: 'header',
        required: false,
        schema: { type: 'string' },
        description: 'Tenant ID (requerido con Bearer auth)',
      },
      pageParam: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', default: 1 },
        description: 'Número de página (paginación offset)',
      },
      limitParam: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', default: 20, maximum: 100 },
        description: 'Elementos por página',
      },
    },
  },
  paths: {
    // ─── System ───
    '/health': {
      get: {
        summary: 'Health check del servicio',
        operationId: 'getHealth',
        tags: ['System'],
        security: [],
        responses: {
          '200': {
            description: 'Servicio operativo',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    service: { type: 'string', example: 'Archii API' },
                    version: { type: 'string', example: '2.0.0' },
                    uptime: { type: 'string', example: '2h 15m' },
                    timestamp: { type: 'string', format: 'date-time' },
                    endpoints: { type: 'array', items: { type: 'string' } },
                    auth_methods: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─── Projects ───
    '/projects': {
      get: {
        summary: 'Listar proyectos',
        description: 'Retorna proyectos del tenant autenticado. Requiere feature flag public_api habilitado.',
        operationId: 'listProjects',
        tags: ['Projects'],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['Concepto', 'Diseno', 'Ejecucion', 'Terminado'] }, description: 'Filtrar por estado' },
          { $ref: '#/components/parameters/pageParam' },
          { $ref: '#/components/parameters/limitParam' },
          { $ref: '#/components/parameters/tenantIdHeader' },
        ],
        responses: {
          '200': { description: 'Lista de proyectos', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedProjects' } } } },
          '401': { description: 'No autenticado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Feature flag public_api deshabilitado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Rate limit excedido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      post: {
        summary: 'Crear proyecto',
        description: 'Crea un nuevo proyecto en el tenant. Requiere permiso write en la API Key.',
        operationId: 'createProject',
        tags: ['Projects'],
        parameters: [
          { $ref: '#/components/parameters/tenantIdHeader' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'status'],
                properties: {
                  name: { type: 'string', description: 'Nombre del proyecto' },
                  status: { type: 'string', enum: ['Concepto', 'Diseno', 'Ejecucion', 'Terminado'] },
                  client: { type: 'string' },
                  location: { type: 'string' },
                  description: { type: 'string' },
                  budget: { type: 'number', description: 'Presupuesto en COP' },
                  progress: { type: 'number', minimum: 0, maximum: 100 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Proyecto creado', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, message: { type: 'string' } } } } } },
          '400': { description: 'Datos inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Sin permisos de escritura', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ─── Tasks ───
    '/tasks': {
      get: {
        summary: 'Listar tareas',
        description: 'Retorna tareas del tenant. Filtros opcionales por proyecto, estado, asignado.',
        operationId: 'listTasks',
        tags: ['Tasks'],
        parameters: [
          { name: 'projectId', in: 'query', schema: { type: 'string' }, description: 'Filtrar por proyecto' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['Por hacer', 'En progreso', 'Revision', 'Completado'] }, description: 'Filtrar por estado' },
          { name: 'assigneeId', in: 'query', schema: { type: 'string' }, description: 'Filtrar por asignado' },
          { $ref: '#/components/parameters/pageParam' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 }, description: 'Elementos por página' },
          { $ref: '#/components/parameters/tenantIdHeader' },
        ],
        responses: {
          '200': { description: 'Lista de tareas', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedTasks' } } } },
          '401': { description: 'No autenticado' },
          '429': { description: 'Rate limit excedido' },
        },
      },
      post: {
        summary: 'Crear tarea',
        description: 'Crea una nueva tarea. Requiere permiso write en la API Key.',
        operationId: 'createTask',
        tags: ['Tasks'],
        parameters: [
          { $ref: '#/components/parameters/tenantIdHeader' },
        ],
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
                  assigneeIds: { type: 'array', items: { type: 'string' } },
                  priority: { type: 'string', enum: ['Alta', 'Media', 'Baja'], default: 'Media' },
                  status: { type: 'string', enum: ['Por hacer', 'En progreso', 'Revision', 'Completado'], default: 'Por hacer' },
                  dueDate: { type: 'string', format: 'date' },
                  startDate: { type: 'string', format: 'date' },
                  phaseId: { type: 'string' },
                  estimatedHours: { type: 'number' },
                  tags: { type: 'array', items: { type: 'string' } },
                  subtasks: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' } } } },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Tarea creada', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, message: { type: 'string' } } } } } },
          '400': { description: 'Datos inválidos' },
          '403': { description: 'Sin permisos de escritura' },
        },
      },
    },

    // ─── API Keys ───
    '/keys': {
      get: {
        summary: 'Listar API Keys del tenant',
        description: 'Retorna todas las API Keys del tenant (sin mostrar el secreto). Solo autenticación Firebase Bearer.',
        operationId: 'listApiKeys',
        tags: ['API Keys'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'tenantId', in: 'query', required: true, schema: { type: 'string' }, description: 'ID del tenant' },
        ],
        responses: {
          '200': { description: 'Lista de API Keys', content: { 'application/json': { schema: { type: 'object', properties: { keys: { type: 'array', items: { $ref: '#/components/schemas/APIKey' } }, count: { type: 'integer' } } } } } },
          '401': { description: 'No autenticado' },
          '403': { description: 'No eres miembro del tenant' },
        },
      },
      post: {
        summary: 'Crear o revocar API Key',
        description: 'Crea una nueva API Key o revoca una existente. Solo Firebase Bearer auth.',
        operationId: 'manageApiKey',
        tags: ['API Keys'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['action', 'tenantId'],
                properties: {
                  action: { type: 'string', enum: ['create', 'revoke'], description: 'Acción a realizar' },
                  tenantId: { type: 'string' },
                  name: { type: 'string', description: 'Nombre descriptivo (solo para create)' },
                  permissions: { type: 'array', items: { type: 'string', enum: ['read', 'write', 'export'] }, default: ['read'], description: 'Permisos de la clave (solo para create)' },
                  rateLimit: { type: 'object', properties: { limit: { type: 'integer', maximum: 1000 }, windowSeconds: { type: 'integer', minimum: 10 } }, description: 'Configuración de rate limit (solo para create)' },
                  expiresAt: { type: 'string', format: 'date-time', description: 'Fecha de expiración (solo para create)' },
                  keyId: { type: 'string', description: 'ID de la clave a revocar (solo para revoke)' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'API Key creada', content: { 'application/json': { schema: { type: 'object', properties: { key: { type: 'string' }, message: { type: 'string' }, keyPrefix: { type: 'string' }, permissions: { type: 'array', items: { type: 'string' } }, createdAt: { type: 'string' } } } } } },
          '200': { description: 'API Key revocada', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
          '400': { description: 'Datos inválidos' },
          '403': { description: 'Sin permisos' },
        },
      },
    },

    // ─── BI Schema ───
    '/bi/schema': {
      get: {
        summary: 'Obtener esquema BI',
        description: 'Retorna el esquema de datos disponible para herramientas BI (Power BI, Tableau). Requiere feature flag bi_connector. Respuesta cacheada 1 hora.',
        operationId: 'getBISchema',
        tags: ['BI & Export'],
        security: [],
        responses: {
          '200': { description: 'Esquema BI disponible', content: { 'application/json': { schema: { type: 'object', description: 'Esquema completo de colecciones y campos' } } } },
          '403': { description: 'BI Connector deshabilitado' },
        },
      },
      head: {
        summary: 'Verificar disponibilidad BI',
        description: 'Verifica si el conector BI está habilitado. Sin cuerpo de respuesta.',
        operationId: 'checkBIAvailability',
        tags: ['BI & Export'],
        security: [],
        responses: {
          '200': { description: 'BI Connector habilitado', headers: { 'X-BI-Collections': { schema: { type: 'string' }, description: 'Lista de colecciones separadas por coma' }, 'X-BI-Schema-Version': { schema: { type: 'string' }, description: 'Versión del esquema' } } },
          '403': { description: 'BI Connector deshabilitado' },
        },
      },
    },

    // ─── Export CSV ───
    '/export/csv': {
      get: {
        summary: 'Exportar datos en CSV',
        description: 'Exporta datos de las colecciones especificadas como archivo CSV. Requiere feature flag bi_connector y permiso read o export en API Key. Rate limit: 10 req/min.',
        operationId: 'exportCsv',
        tags: ['BI & Export'],
        parameters: [
          { name: 'collections', in: 'query', required: true, schema: { type: 'string' }, description: 'Colecciones separadas por coma (ej: projects,tasks,expenses)' },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Fecha inicial (YYYY-MM-DD)' },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Fecha final (YYYY-MM-DD)' },
          { name: 'fields', in: 'query', schema: { type: 'string' }, description: 'Campos a incluir, separados por coma' },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1000 }, description: 'Máximo de filas' },
          { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Token de paginación para siguiente página' },
          { name: 'sanitizePII', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Enmascarar datos personales' },
          { $ref: '#/components/parameters/tenantIdHeader' },
        ],
        responses: {
          '200': {
            description: 'Archivo CSV',
            content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } },
            headers: {
              'X-Export-Row-Count': { schema: { type: 'integer' }, description: 'Filas exportadas' },
              'X-Export-Next-Cursor': { schema: { type: 'string' }, description: 'Cursor para siguiente página' },
              'X-RateLimit-Limit': { schema: { type: 'integer' } },
              'X-RateLimit-Remaining': { schema: { type: 'integer' } },
            },
          },
          '400': { description: 'Colecciones inválidas' },
          '403': { description: 'Sin permisos o BI Connector deshabilitado' },
          '429': { description: 'Rate limit excedido (10 req/min)' },
        },
      },
    },

    // ─── Export JSON ───
    '/export/json': {
      get: {
        summary: 'Exportar datos en JSON',
        description: 'Exporta datos de las colecciones especificadas como JSON. Mismos filtros que CSV. Requiere feature flag bi_connector.',
        operationId: 'exportJson',
        tags: ['BI & Export'],
        parameters: [
          { name: 'collections', in: 'query', required: true, schema: { type: 'string' }, description: 'Colecciones separadas por coma' },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Fecha inicial' },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Fecha final' },
          { name: 'fields', in: 'query', schema: { type: 'string' }, description: 'Campos a incluir' },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1000 }, description: 'Máximo de filas' },
          { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Token de paginación' },
          { name: 'sanitizePII', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Enmascarar datos personales' },
          { name: 'pretty', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'JSON indentado' },
          { $ref: '#/components/parameters/tenantIdHeader' },
        ],
        responses: {
          '200': {
            description: 'Datos en formato JSON',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { type: 'object' } },
                    pagination: { $ref: '#/components/schemas/ExportPagination' },
                    exportInfo: { $ref: '#/components/schemas/ExportInfo' },
                  },
                },
              },
            },
          },
          '400': { description: 'Colecciones inválidas' },
          '403': { description: 'Sin permisos o BI Connector deshabilitado' },
          '429': { description: 'Rate limit excedido' },
        },
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
