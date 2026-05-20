import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';

/**
 * POST /api/delete-entity
 * Server-side deletion using Firebase Admin SDK (bypasses Firestore rules).
 * Used when client-side rules block the operation (e.g. member/superAdmin mismatch).
 */
export async function POST(request: NextRequest) {
  try {
    // Verify auth
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const auth = getAdminAuth();
    let uid: string;
    try {
      const decoded = await auth.verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const body = await request.json();
    const { type, id, tenantId } = body;

    if (!type || !id) {
      return NextResponse.json({ error: 'Falta type o id' }, { status: 400 });
    }

    // Security: tenantId is required to prevent cross-tenant deletion
    if (!tenantId) {
      return NextResponse.json({ error: 'Se requiere tenantId' }, { status: 400 });
    }

    const db = getAdminDb();

    // Verify tenant exists and user is a member
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Espacio de trabajo no encontrado' }, { status: 404 });
    }
    const tenantData = tenantDoc.data()!;
    const members: string[] = tenantData.members || [];
    const superAdmins: string[] = tenantData.superAdmins || [];
    const isTenantMember = members.includes(uid) || tenantData.createdBy === uid || superAdmins.includes(uid);
    if (!isTenantMember) {
      return NextResponse.json({ error: 'No eres miembro de este espacio de trabajo' }, { status: 403 });
    }

    // Role verification: only Super Admin, Admin, or Director can delete entities
    const isCreator = tenantData.createdBy === uid;
    const isSuperAdmin = superAdmins.includes(uid);
    const callerDoc = await db.collection('users').doc(uid).get();
    const callerRole = callerDoc.exists ? (callerDoc.data()?.role || 'Miembro') : 'Miembro';
    const isAdmin = callerRole === 'Admin' || callerRole === 'Director' || isCreator || isSuperAdmin;
    if (!isAdmin) {
      return NextResponse.json({ error: 'Solo Admin, Director o Super Admin pueden eliminar entidades' }, { status: 403 });
    }

    if (type === 'project') {
      // 1. Verify project belongs to user's tenant
      const projDoc = await db.collection('projects').doc(id).get();
      if (!projDoc.exists) {
        return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
      }
      const projData = projDoc.data();
      if (!projData) {
        return NextResponse.json({ error: 'Datos del proyecto no encontrados' }, { status: 404 });
      }
      if (projData.tenantId !== tenantId) {
        return NextResponse.json({ error: 'Proyecto no pertenece a tu espacio' }, { status: 403 });
      }

      // 2. Delete subcollections (paginated)
      const subcollections = ['messages', 'workPhases', 'files', 'approvals', 'dailyLogs'];
      for (const col of subcollections) {
        let query = db.collection('projects').doc(id).collection(col).orderBy('__name__').limit(500);
        let snap = await query.get();
        while (snap.size > 0) {
          const batch = db.batch();
          snap.docs.forEach((doc: any) => batch.delete(doc.ref));
          await batch.commit();
          const lastDoc = snap.docs[snap.size - 1];
          query = db.collection('projects').doc(id).collection(col).orderBy('__name__').startAfter(lastDoc).limit(500);
          snap = await query.get();
        }
      }

      // 3. Delete orphaned top-level docs
      const topLevelCollections = ['tasks', 'comments', 'expenses', 'rfis', 'submittals', 'punchItems', 'meetings', 'timeEntries', 'invoices', 'galleryPhotos'];
      for (const col of topLevelCollections) {
        let query = db.collection(col).where('projectId', '==', id).limit(500);
        let snap = await query.get();
        while (snap.size > 0) {
          const batch = db.batch();
          snap.docs.forEach((doc: any) => batch.delete(doc.ref));
          await batch.commit();
          const lastDoc = snap.docs[snap.size - 1];
          query = db.collection(col).where('projectId', '==', id).startAfter(lastDoc).limit(500);
          snap = await query.get();
        }
      }

      // 4. Delete project
      await db.collection('projects').doc(id).delete();

      return NextResponse.json({ success: true });
    }

    // Simple single-doc deletes
    const simpleDeletes: Record<string, string> = {
      task: 'tasks',
      expense: 'expenses',
      supplier: 'suppliers',
      company: 'companies',
      meeting: 'meetings',
      invoice: 'invoices',
      rfi: 'rfis',
      submittal: 'submittals',
      punchItem: 'punchItems',
      comment: 'comments',
      galleryPhoto: 'galleryPhotos',
      invProduct: 'invProducts',
      invCategory: 'invCategories',
      invMovement: 'invMovements',
      invTransfer: 'invTransfers',
      timeEntry: 'timeEntries',
    };

    if (simpleDeletes[type]) {
      // Security: verify tenant ownership before deleting
      const docRef = db.collection(simpleDeletes[type]).doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
      }
      const docData = docSnap.data();
      if (docData?.tenantId !== tenantId) {
        return NextResponse.json({ error: 'No tienes permiso para eliminar este documento' }, { status: 403 });
      }
      await docRef.delete();
      return NextResponse.json({ success: true });
    }

    // Subcollection deletes (need projectId)
    const subDeletes: Record<string, string> = {
      projectFile: 'files',
      approval: 'approvals',
    };

    if (subDeletes[type]) {
      const { projectId } = body;
      if (!projectId) return NextResponse.json({ error: 'Falta projectId' }, { status: 400 });
      // Security: verify project belongs to tenant before deleting subcollection doc
      const projSnap = await db.collection('projects').doc(projectId).get();
      if (!projSnap.exists || projSnap.data()?.tenantId !== tenantId) {
        return NextResponse.json({ error: 'Proyecto no pertenece a tu espacio' }, { status: 403 });
      }
      await db.collection('projects').doc(projectId).collection(subDeletes[type]).doc(id).delete();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Tipo no soportado: ${type}` }, { status: 400 });
  } catch (err: any) {
    console.error('[Archii] delete-entity error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
