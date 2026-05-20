import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * POST /api/update-user
 * Update a user's role or company via Admin SDK (bypasses Firestore rules).
 * Only Admin/Director/Super Admin can change other users' data.
 *
 * Body:
 *   - tenantId (required): the tenant ID for authorization
 *   - targetUid (required): the UID of the user to update
 *   - role (optional): new role to set
 *   - companyId (optional): company ID to assign
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const { tenantId, targetUid, role, companyId } = await req.json();
    if (!tenantId || !targetUid) {
      return NextResponse.json({ error: 'tenantId y targetUid requeridos' }, { status: 400 });
    }
    if (!role && companyId === undefined) {
      return NextResponse.json({ error: 'Se requiere role o companyId' }, { status: 400 });
    }

    const db = getAdminDb();

    // Verify caller is an admin/super admin of the tenant
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }
    const tData = tenantDoc.data()!;
    const isCreator = tData.createdBy === user.uid;
    const isSuperAdmin = (tData.superAdmins || []).includes(user.uid);

    // Check caller's role in users collection
    const callerDoc = await db.collection('users').doc(user.uid).get();
    const callerRole = callerDoc.exists ? (callerDoc.data()?.role || 'Miembro') : 'Miembro';
    const isAdmin = callerRole === 'Admin' || callerRole === 'Director' || isCreator || isSuperAdmin;

    if (!isAdmin) {
      return NextResponse.json({ error: 'Sin permisos para cambiar roles' }, { status: 403 });
    }

    // Cannot change own role
    if (targetUid === user.uid && role) {
      return NextResponse.json({ error: 'No puedes cambiar tu propio rol' }, { status: 400 });
    }

    // Verify target user exists
    const targetDoc = await db.collection('users').doc(targetUid).get();
    if (!targetDoc.exists) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Build update object
    const updates: Record<string, any> = {};
    if (role) updates.role = role;
    if (companyId !== undefined) updates.companyId = companyId || null;

    await db.collection('users').doc(targetUid).update(updates);

    return NextResponse.json({ success: true, message: 'Usuario actualizado' });
  } catch (err: any) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[update-user] Error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
