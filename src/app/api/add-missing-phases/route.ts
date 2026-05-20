import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { PROJECT_TYPE_PHASES } from '@/lib/types';

/**
 * POST /api/add-missing-phases
 * Adds phases that are missing from a project (does NOT delete existing ones).
 *
 * Body:
 *   - tenantId (required)
 *   - projectId (required)
 *   - projectType (optional): 'Diseño', 'Ejecución', or 'Ambos'. Defaults to 'Ambos'.
 *
 * Compares existing phases (by phaseKey) against the templates and only creates
 * the ones that don't exist yet.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const { tenantId, projectId, projectType: forcedType } = await req.json();
    if (!tenantId || !projectId) {
      return NextResponse.json({ error: 'tenantId y projectId requeridos' }, { status: 400 });
    }

    const db = getAdminDb();

    // Verify user has access to tenant
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }
    const tData = tenantDoc.data()!;
    const hasAccess =
      (tData.members || []).includes(user.uid) ||
      tData.createdBy === user.uid ||
      (tData.superAdmins || []).includes(user.uid);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Sin acceso al tenant' }, { status: 403 });
    }

    // Verify project
    const projDoc = await db.collection('projects').doc(projectId).get();
    if (!projDoc.exists) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }
    const projData = projDoc.data()!;
    if (projData.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Proyecto no pertenece al tenant' }, { status: 403 });
    }

    // Determine which phase templates to use
    const effectiveType = forcedType || projData.projectType || 'Ambos';
    const types = effectiveType === 'Ambos' ? ['Diseño', 'Ejecución'] : [effectiveType];

    // Get existing phases
    const existingSnap = await db
      .collection('projects')
      .doc(projectId)
      .collection('workPhases')
      .get();
    const existingKeys = new Set(existingSnap.docs.map((d: any) => d.data()?.phaseKey).filter(Boolean));

    // Find existing phases count per type to set correct order
    const existingByType: Record<string, number> = {};
    for (const doc of existingSnap.docs) {
      const data = doc.data();
      if (data.type && data.order !== undefined) {
        existingByType[data.type] = Math.max(existingByType[data.type] || 0, data.order + 1);
      }
    }

    // Collect missing phases
    const batch = db.batch();
    let addedCount = 0;
    const ts = Date.now();

    for (const type of types) {
      const templates = PROJECT_TYPE_PHASES[type] || [];
      for (const tpl of templates) {
        if (existingKeys.has(tpl.key)) continue; // Already exists, skip

        existingByType[type] = (existingByType[type] || 0) + 1;

        const phaseRef = db
          .collection('projects')
          .doc(projectId)
          .collection('workPhases')
          .doc();
        batch.set(phaseRef, {
          name: tpl.name,
          description: tpl.description,
          status: 'Pendiente',
          order: existingByType[type] - 1,
          startDate: '',
          endDate: '',
          createdAt: ts,
          tenantId: tenantId || '',
          type,
          enabled: true,
          phaseKey: tpl.key,
        });
        addedCount++;
      }
    }

    if (addedCount === 0) {
      return NextResponse.json({ success: true, message: 'No faltan fases por agregar', added: 0 });
    }

    await batch.commit();

    // Optionally update projectType on the project document
    if (forcedType && forcedType !== projData.projectType) {
      await db.collection('projects').doc(projectId).update({ projectType: forcedType });
    }

    return NextResponse.json({
      success: true,
      message: `${addedCount} fase${addedCount > 1 ? 's' : ''} agregada${addedCount > 1 ? 's' : ''}`,
      added: addedCount,
    });
  } catch (err: any) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[add-missing-phases] Error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
