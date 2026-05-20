/**
 * POST/DELETE /api/notifications/push/subscribe
 *
 * POST  → Registra o actualiza la suscripción push de un usuario.
 *          Body: { endpoint: string, keys: { p256dh: string, auth: string } }
 *          Guarda en Firestore: pushSubscriptions/{userId}
 *
 * DELETE → Elimina la suscripción push del usuario autenticado.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';

const COLLECTION = 'pushSubscriptions';

export async function POST(request: NextRequest) {
  /* ── Auth ── */
  let user: { uid: string; email: string };
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Error de autenticación' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { endpoint, keys } = body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: endpoint, keys.p256dh, keys.auth' },
        { status: 400 }
      );
    }

    const { getAdminDb, getAdminFieldValue } = await import('@/lib/firebase-admin');
    const db = getAdminDb();
    const fv = getAdminFieldValue();

    // Leer primero para verificar si el documento es nuevo
    const docSnap = await db.collection(COLLECTION).doc(user.uid).get();
    const isNew = !docSnap.exists || !docSnap.data()?.createdAt;

    const docData: Record<string, unknown> = {
      userId: user.uid,
      email: user.email,
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      userAgent: request.headers.get('user-agent') || '',
      updatedAt: fv.serverTimestamp(),
      active: true,
    };

    // Incluir createdAt solo si es un documento nuevo
    if (isNew) {
      docData.createdAt = fv.serverTimestamp();
    }

    await db.collection(COLLECTION).doc(user.uid).set(docData, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    console.error('[Archii Push] Error guardando suscripción:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  /* ── Auth ── */
  let user: { uid: string };
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Error de autenticación' }, { status: 401 });
  }

  try {
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();

    await db.collection(COLLECTION).doc(user.uid).delete();

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    console.error('[Archii Push] Error eliminando suscripción:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
