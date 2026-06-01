import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';

/* ─── Helper: verify auth ─── */
async function verifyAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) throw new Error('No autenticado');
  const decoded = await getAdminAuth().verifyIdToken(token);
  return decoded;
}

/**
 * POST /api/dedup-users
 * Deduplicate users within a tenant — removes duplicate user entries
 * that share the same email, keeping the most recently updated one.
 */
export async function POST(req: NextRequest) {
  try {
    const decoded = await verifyAuth(req);
    const uid = decoded.uid;

    const body = await req.json();
    const { action, tenantId } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId es requerido' }, { status: 400 });
    }

    const db = getAdminDb();

    // Verify tenant membership
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }
    const members: string[] = tenantDoc.data()?.members || [];
    if (!members.includes(uid)) {
      return NextResponse.json({ error: 'Sin permisos para este tenant' }, { status: 403 });
    }

    if (action === 'dedup-tenant') {
      // Get all users for this tenant
      const usersSnap = await db.collection('users')
        .where('tenantId', '==', tenantId)
        .get();

      if (usersSnap.empty) {
        return NextResponse.json({ duplicatesRemoved: 0, message: 'No users found' });
      }

      // Group by email to find duplicates
      const emailMap = new Map<string, Array<{ id: string; data: any }>>();
      usersSnap.docs.forEach(doc => {
        const data = doc.data();
        const email = (data.email || '').toLowerCase().trim();
        if (!email) return;
        if (!emailMap.has(email)) {
          emailMap.set(email, []);
        }
        emailMap.get(email)!.push({ id: doc.id, data });
      });

      let duplicatesRemoved = 0;
      const batch = db.batch();

      for (const [, entries] of emailMap) {
        if (entries.length <= 1) continue; // No duplicates

        // Sort by updatedAt (most recent first), keep the first one
        entries.sort((a, b) => {
          const aTime = a.data.updatedAt?._seconds || a.data.createdAt?._seconds || 0;
          const bTime = b.data.updatedAt?._seconds || b.data.createdAt?._seconds || 0;
          return bTime - aTime;
        });

        // Remove all except the most recent one
        for (let i = 1; i < entries.length; i++) {
          batch.delete(db.collection('users').doc(entries[i].id));
          duplicatesRemoved++;
        }
      }

      if (duplicatesRemoved > 0) {
        await batch.commit();
      }

      return NextResponse.json({
        duplicatesRemoved,
        message: duplicatesRemoved > 0
          ? `${duplicatesRemoved} duplicados eliminados`
          : 'No se encontraron duplicados',
      });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (err: any) {
    console.error('[dedup-users] Error:', err.message);
    if (err.message === 'No autenticado') {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
