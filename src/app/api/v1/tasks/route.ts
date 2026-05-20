/**
 * /api/v1/tasks/route.ts
 * API pública de tareas.
 *
 * GET  /api/v1/tasks?tenantId=xxx&projectId=yyy&status=xxx
 * POST /api/v1/tasks
 *
 * Autenticación: API Key o Bearer token.
 * Rate limiting: aplicado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateAPIKey, checkRateLimit } from '@/lib/rate-limiter';
import { authenticateRequest } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { isFlagEnabled } from '@/lib/feature-flags';

async function authenticateV1(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    const record = await validateAPIKey(apiKey);
    if (!record) return { authenticated: false, error: { status: 401, message: 'API Key inválida' } };
    const rateResult = await checkRateLimit(`apikey:${record.keyPrefix}`, record.rateLimit);
    if (!rateResult.allowed) return { authenticated: false, error: { status: 429, message: 'Rate limit excedido' } };
    return { authenticated: true, tenantId: record.tenantId, apiKeyRecord: record };
  }
  const user = await authenticateRequest(request);
  if (user) {
    const tenantId = request.headers.get('x-tenant-id');
    if (!tenantId) return { authenticated: false, error: { status: 400, message: 'x-tenant-id requerido' } };
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
  return { authenticated: false, error: { status: 401, message: 'Autenticación requerida' } };
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
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');
    const assigneeId = searchParams.get('assigneeId');
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100);

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    const db = getAdminDb();
    let query: any = db.collection('tasks').where('tenantId', '==', tenantId);

    if (projectId) query = query.where('projectId', '==', projectId);
    if (status) query = query.where('status', '==', status);
    if (assigneeId) query = query.where('assigneeId', '==', assigneeId);

    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    const offset = (page - 1) * limit;
    const snapshot = await query.orderBy('createdAt', 'desc').offset(offset).limit(limit).get();

    const tasks = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ tasks, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (error: any) {
    console.error('[API v1 /tasks] GET error:', error?.message);
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

    if (auth.apiKeyRecord && !auth.apiKeyRecord.permissions.includes('write')) {
      return NextResponse.json({ error: 'Sin permisos de escritura' }, { status: 403 });
    }

    const body = await request.json();
    const tenantId = auth.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }
    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'title requerido' }, { status: 400 });
    }

    const validStatuses = ['Por hacer', 'En progreso', 'Revision', 'Completado'];
    const status = validStatuses.includes(body.status) ? body.status : 'Por hacer';
    const now = new Date().toISOString();
    const db = getAdminDb();
    const docRef = await db.collection('tasks').add({
      title: body.title.trim(),
      description: body.description || '',
      projectId: body.projectId || '',
      assigneeId: body.assigneeId || '',
      assigneeIds: Array.isArray(body.assigneeIds) ? body.assigneeIds : (body.assigneeId ? [body.assigneeId] : []),
      priority: body.priority || 'Media',
      status,
      dueDate: body.dueDate || '',
      startDate: body.startDate || '',
      phaseId: body.phaseId || '',
      estimatedHours: typeof body.estimatedHours === 'number' && body.estimatedHours >= 0 ? body.estimatedHours : null,
      tags: Array.isArray(body.tags) && body.tags.length > 0 ? body.tags : null,
      subtasks: Array.isArray(body.subtasks) ? body.subtasks.filter((s: any) => s.text?.trim()) : [],
      completedAt: status === 'Completado' ? now : null,
      tenantId,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user?.uid || auth.apiKeyRecord?.createdBy || 'api',
    });

    return NextResponse.json({ id: docRef.id, message: 'Tarea creada' }, { status: 201 });
  } catch (error: any) {
    console.error('[API v1 /tasks] POST error:', error?.message);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
