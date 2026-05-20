/**
 * GET/POST /api/notifications/history
 *
 * Persist notification history in Firestore so it survives page refreshes.
 *
 * POST: Save a new notification to Firestore
 *   Body: { title, body, icon, type, read, screen, itemId }
 *   Returns: { ok, id }
 *
 * GET: Read notification history for the authenticated user
 *   Query: ?limit=50&after=<docId> (pagination)
 *   Returns: { notifications: [...], hasMore }
 *
 * PATCH: Mark notifications as read
 *   Body: { ids: string[] } or { markAll: true }
 *   Returns: { ok, updated }
 *
 * DELETE: Clear notification history
 *   Returns: { ok, deleted }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';

const COLLECTION = 'notifHistory';

export async function POST(request: NextRequest) {
  let user: { uid: string };
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Error de autenticación' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, body: notifBody, icon, type, screen, itemId } = body;

    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();

    const docRef = await db.collection(COLLECTION).add({
      userId: user.uid,
      title,
      body: notifBody || '',
      icon: icon || '🔔',
      type: type || 'info',
      read: false,
      screen: screen || null,
      itemId: itemId || null,
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err: any) {
    console.error('[Archii NotifHistory] POST error:', err.message);
    return NextResponse.json({ error: 'Error guardando notificación' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  let user: { uid: string };
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Error de autenticación' }, { status: 401 });
  }

  try {
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    const after = url.searchParams.get('after');

    let query = db.collection(COLLECTION)
      .where('userId', '==', user.uid)
      .orderBy('createdAt', 'desc')
      .limit(limit + 1); // +1 to check hasMore

    if (after) {
      const afterDoc = await db.collection(COLLECTION).doc(after).get();
      if (afterDoc.exists) {
        query = query.startAfter(afterDoc);
      }
    }

    const snap = await query.get();
    const docs = snap.docs.slice(0, limit);
    const hasMore = snap.docs.length > limit;

    const notifications = docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        body: data.body,
        icon: data.icon,
        type: data.type,
        read: data.read || false,
        screen: data.screen,
        itemId: data.itemId,
        timestamp: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
      };
    });

    return NextResponse.json({ notifications, hasMore });
  } catch (err: any) {
    console.error('[Archii NotifHistory] GET error:', err.message);
    return NextResponse.json({ error: 'Error cargando notificaciones' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let user: { uid: string };
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Error de autenticación' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();

    if (body.markAll) {
      // Mark all as read
      const snap = await db.collection(COLLECTION)
        .where('userId', '==', user.uid)
        .where('read', '==', false)
        .get();

      if (snap.empty) return NextResponse.json({ ok: true, updated: 0 });

      const batch = db.batch();
      snap.docs.forEach((doc: any) => batch.update(doc.ref, { read: true }));
      await batch.commit();

      return NextResponse.json({ ok: true, updated: snap.size });
    }

    if (body.ids && Array.isArray(body.ids)) {
      const batch = db.batch();
      for (const id of body.ids) {
        batch.update(db.collection(COLLECTION).doc(id), { read: true });
      }
      await batch.commit();
      return NextResponse.json({ ok: true, updated: body.ids.length });
    }

    return NextResponse.json({ error: 'Provide ids[] or markAll' }, { status: 400 });
  } catch (err: any) {
    console.error('[Archii NotifHistory] PATCH error:', err.message);
    return NextResponse.json({ error: 'Error actualizando notificaciones' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let user: { uid: string };
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Error de autenticación' }, { status: 401 });
  }

  try {
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();

    const snap = await db.collection(COLLECTION)
      .where('userId', '==', user.uid)
      .limit(500)
      .get();

    if (snap.empty) return NextResponse.json({ ok: true, deleted: 0 });

    const batch = db.batch();
    snap.docs.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();

    return NextResponse.json({ ok: true, deleted: snap.size });
  } catch (err: any) {
    console.error('[Archii NotifHistory] DELETE error:', err.message);
    return NextResponse.json({ error: 'Error eliminando notificaciones' }, { status: 500 });
  }
}
