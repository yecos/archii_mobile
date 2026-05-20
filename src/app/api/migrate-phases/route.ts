import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { initPhasesForProject } from '@/lib/firestore-actions';

/**
 * POST /api/migrate-phases
 * Reinitialize work phases for projects using Admin SDK (bypasses Firestore rules).
 *
 * Body:
 *   - tenantId (required): the tenant ID
 *   - projectId (optional): if provided, only migrate that project; otherwise migrate all
 *   - projectType (optional): force a specific type ('Diseño', 'Ejecución', 'Ambos'). Defaults to 'Ambos'.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const { tenantId, projectId, projectType: forcedType } = await req.json();
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
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

    if (projectId) {
      // Single project mode
      const projDoc = await db.collection('projects').doc(projectId).get();
      if (!projDoc.exists) {
        return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
      }
      const projData = projDoc.data()!;
      if (projData.tenantId !== tenantId) {
        return NextResponse.json({ error: 'Proyecto no pertenece al tenant' }, { status: 403 });
      }

      await initPhasesForProject(
        db as any,
        projectId,
        forcedType || projData.projectType || 'Ambos',
        [],          // enabledPhases: empty = enable all
        Date.now(),  // ts
        tenantId,
      );
      return NextResponse.json({ success: true, message: 'Fases reinicializadas' });
    }

    // Bulk migration mode
    const projectsSnap = await db.collection('projects').where('tenantId', '==', tenantId).get();
    let migrated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const projDoc of projectsSnap.docs) {
      const projData = projDoc.data();
      const phasesSnap = await db
        .collection('projects')
        .doc(projDoc.id)
        .collection('workPhases')
        .limit(1)
        .get();
      if (phasesSnap.size > 0) {
        skipped++;
        continue;
      }
      try {
        await initPhasesForProject(
          db as any,
          projDoc.id,
          forcedType || projData.projectType || 'Ambos',
          [],          // enabledPhases: empty = enable all
          Date.now(),  // ts
          tenantId,
        );
        migrated++;
      } catch (err: any) {
        errors.push(`${projDoc.id}: ${err.message}`);
      }
    }

    return NextResponse.json({ migrated, skipped, errors });
  } catch (err: any) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[migrate-phases] Error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
