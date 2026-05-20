import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/project-phases?projectId=xxx&tenantId=xxx
 * Lee fases usando Admin SDK (bypass security rules).
 * REQUIRES: Authentication (Bearer token)
 */
export async function GET(req: NextRequest) {
  try {
    // SECURITY: Require authentication
    const user = await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const tenantId = searchParams.get('tenantId');

    if (!projectId || !tenantId) {
      return NextResponse.json({ error: 'projectId y tenantId requeridos' }, { status: 400 });
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

    const snap = await db.collection('projects').doc(projectId).collection('workPhases')
      .orderBy('order', 'asc').get();

    const phases = snap.docs.map((doc: any) => ({
      id: doc.id,
      data: doc.data(),
    }));

    return NextResponse.json({ phases });
  } catch (err: any) {
    console.error('[ProjectPhases] Error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
