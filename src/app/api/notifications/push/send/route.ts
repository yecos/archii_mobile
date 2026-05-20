/**
 * POST /api/notifications/push/send
 *
 * Envía notificaciones push usando la librería `web-push` con VAPID.
 *
 * Body individual: { userId, title, body, data? }
 * Body broadcast:  { broadcast: true, title, body, data? }
 *
 * Busca la suscripción en Firestore (colección `pushSubscriptions`)
 * y envía el payload al service worker del navegador destino.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import webpush from 'web-push';

const COLLECTION = 'pushSubscriptions';

/** Configura claves VAPID para web-push (se ejecuta una sola vez) */
function configureVapid() {
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@archii.app';
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!privateKey || !publicKey) {
    throw new Error(
      'VAPID_PRIVATE_KEY y NEXT_PUBLIC_VAPID_PUBLIC_KEY deben estar configuradas en .env'
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
}

/** Envía un push a una suscripción individual.
 *  Retorna 'sent' si se envió correctamente,
 *  'expired' si la suscripción ya no existe (404/410),
 *  'failed' para otros errores transitorios.
 */
async function sendToSubscription(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; icon?: string; data?: Record<string, string> }
): Promise<'sent' | 'expired' | 'failed'> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      JSON.stringify(payload),
      {
        TTL: 86400, // 24 horas
        urgency: 'normal',
      }
    );
    return 'sent';
  } catch (err: any) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      console.warn(`[Archii Push] Suscripción expirada: ${subscription.endpoint}`);
      return 'expired';
    }
    console.error('[Archii Push] Error enviando push:', err.message);
    return 'failed';
  }
}

export async function POST(request: NextRequest) {
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

  /* ── Parse body ── */
  let body: {
    userId?: string;
    broadcast?: boolean;
    title?: string;
    body?: string;
    data?: Record<string, string>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  if (!body.title || !body.body) {
    return NextResponse.json(
      { error: 'Campos requeridos: title, body' },
      { status: 400 }
    );
  }

  /* ── Configure VAPID ── */
  try {
    configureVapid();
  } catch (err: any) {
    console.error('[Archii Push]', err.message);
    return NextResponse.json({ error: 'Configuración VAPID incompleta' }, { status: 500 });
  }

  /* ── Get Firestore ── */
  const { getAdminDb } = await import('@/lib/firebase-admin');
  const db = getAdminDb();

  const payload = {
    title: body.title,
    body: body.body,
    icon: '/icon-192.png',
    data: body.data || {},
  };

  try {
    /* ── Broadcast: enviar a todos los usuarios con suscripción activa ── */
    if (body.broadcast) {
      // Solo admins pueden hacer broadcast — verificar rol en Firestore
      const userSnap = await db.collection('users').doc(user.uid).get();
      const userRole = userSnap.exists ? userSnap.data()?.role : '';
      if (userRole !== 'Super Admin') {
        return NextResponse.json(
          { error: 'No autorizado para broadcast' },
          { status: 403 }
        );
      }

      // Get caller's tenantId
      const callerDoc = await db.collection('users').doc(user.uid).get();
      const callerTenantId = callerDoc.exists ? callerDoc.data()?.tenantId : null;
      if (!callerTenantId) {
        return NextResponse.json({ error: 'Usuario sin tenant asociado' }, { status: 400 });
      }

      const snap = await db
        .collection(COLLECTION)
        .where('active', '==', true)
        .get();
      // Filter subscriptions to same tenant
      const subsInTenant = snap.docs.filter((doc) => {
        const data = doc.data();
        return data.tenantId === callerTenantId;
      });

      let sent = 0;
      let failed = 0;
      const expiredEndpoints: string[] = [];

      for (const doc of subsInTenant) {
        const sub = doc.data() as {
          endpoint: string;
          keys: { p256dh: string; auth: string };
        };

        if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) continue;

        // No enviarse a sí mismo en broadcast
        if (doc.id === user.uid) continue;

        const result = await sendToSubscription(sub, payload);
        if (result === 'sent') {
          sent++;
        } else if (result === 'expired') {
          failed++;
          expiredEndpoints.push(doc.id);
        } else {
          failed++;
        }
      }

      // Solo limpiar suscripciones expiradas (404/410), no las que fallaron por otros motivos
      if (expiredEndpoints.length > 0) {
        // Firestore batches have a 500-op limit
        const chunks: string[][] = [];
        for (let i = 0; i < expiredEndpoints.length; i += 450) {
          chunks.push(expiredEndpoints.slice(i, i + 450));
        }
        for (const chunk of chunks) {
          const batch = db.batch();
          for (const uid of chunk) {
            batch.update(db.collection(COLLECTION).doc(uid), { active: false });
          }
          await batch.commit();
        }
      }

      return NextResponse.json({ ok: true, sent, failed, total: subsInTenant.length });
    }

    /* ── Individual: enviar a un usuario específico ── */
    if (!body.userId) {
      return NextResponse.json({ error: 'userId requerido' }, { status: 400 });
    }

    // Verificar que caller y target comparten el mismo tenant
    const [callerSnap, targetSnap] = await Promise.all([
      db.collection('users').doc(user.uid).get(),
      db.collection('users').doc(body.userId).get(),
    ]);
    const callerTenant = callerSnap.exists ? callerSnap.data()?.tenantId : null;
    const targetTenant = targetSnap.exists ? targetSnap.data()?.tenantId : null;
    if (!callerTenant || callerTenant !== targetTenant) {
      return NextResponse.json(
        { error: 'No autorizado: los usuarios no comparten el mismo tenant' },
        { status: 403 }
      );
    }

    const subDoc = await db.collection(COLLECTION).doc(body.userId).get();

    if (!subDoc.exists) {
      return NextResponse.json(
        { ok: true, sent: 0, reason: 'no_subscription' },
        { status: 200 }
      );
    }

    const subData = subDoc.data() as {
      active: boolean;
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    if (!subData.active || !subData.endpoint || !subData.keys?.p256dh || !subData.keys?.auth) {
      return NextResponse.json(
        { ok: true, sent: 0, reason: 'inactive_subscription' },
        { status: 200 }
      );
    }

    const result = await sendToSubscription(subData, payload);

    if (result === 'expired') {
      // Solo desactivar si la suscripción expiró (404/410), no en otros errores
      await db.collection(COLLECTION).doc(body.userId).update({ active: false });
      return NextResponse.json({ ok: true, sent: 0, reason: 'subscription_expired' });
    }

    if (result === 'failed') {
      return NextResponse.json({ ok: true, sent: 0, reason: 'send_failed' });
    }

    return NextResponse.json({ ok: true, sent: 1 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    console.error('[Archii Push] Error enviando notificación:', message);
    return NextResponse.json({ ok: false, error: 'Error interno del servidor' }, { status: 500 });
  }
}
