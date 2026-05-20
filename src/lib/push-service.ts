/**
 * push-service.ts
 * Gestor de suscripción a Web Push (client-side).
 *
 * Usa la Push API del navegador con claves VAPID para suscribirse
 * a notificaciones push. La suscripción se guarda en Firestore vía
 * la API route /api/notifications/push/subscribe.
 *
 * NO usa Firebase Messaging compat (no está cargado en layout.tsx).
 * En su lugar, usa navigator.serviceWorker.pushManager directamente.
 */

import { getAuthHeaders } from './firebase-service';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

/* ── Helpers ── */

/** Convierte una clave VAPID base64 (URL-safe) a Uint8Array para la Push API. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Extrae las claves de una PushSubscription como strings base64. */
function extractKeys(sub: PushSubscription) {
  const p256dhKey = sub.getKey('p256dh');
  const authKey = sub.getKey('auth');
  return {
    p256dh: p256dhKey ? btoa(String.fromCharCode(...new Uint8Array(p256dhKey))) : '',
    auth: authKey ? btoa(String.fromCharCode(...new Uint8Array(authKey))) : '',
  };
}

/* ── API calls ── */

/** Guarda la suscripción push en el servidor Firestore. */
async function saveSubscriptionToServer(subscription: PushSubscription): Promise<boolean> {
  try {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders['Authorization']) {
      console.warn('[Archii Push] Usuario no autenticado, no se guarda la suscripción');
      return false;
    }

    const res = await fetch('/api/notifications/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: extractKeys(subscription),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      console.error('[Archii Push] Error del servidor al guardar:', err.error);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error('[Archii Push] Error guardando suscripción:', err.message);
    return false;
  }
}

/** Elimina la suscripción push del servidor Firestore. */
async function removeSubscriptionFromServer(): Promise<void> {
  try {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders['Authorization']) return;

    await fetch('/api/notifications/push/subscribe', {
      method: 'DELETE',
      headers: { ...authHeaders },
    });
  } catch (err: any) {
    console.error('[Archii Push] Error eliminando suscripción:', err.message);
  }
}

/* ── Public API ── */

/**
 * Registra una suscripción push para el usuario actual.
 * Si ya existe una suscripción, la re-guarda en el servidor.
 *
 * @returns `true` si la suscripción está activa, `false` si falló.
 */
export async function registerPushSubscription(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Archii Push] Push API no soportada en este navegador');
    return false;
  }

  if (!VAPID_PUBLIC_KEY) {
    console.warn('[Archii Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY no configurada');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Verificar permiso
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[Archii Push] Permiso de notificación denegado:', permission);
      return false;
    }

    // Verificar suscripción existente
    const existing = await registration.pushManager.getSubscription();

    if (existing) {
      const saved = await saveSubscriptionToServer(existing);
      return saved;
    }

    // Crear nueva suscripción
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    });

    const saved = await saveSubscriptionToServer(subscription);
    return saved;
  } catch (err: any) {
    console.error('[Archii Push] Error en registerPushSubscription:', err.message);
    return false;
  }
}

/**
 * Elimina la suscripción push del navegador y del servidor.
 */
export async function unregisterPushSubscription(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
    }

    await removeSubscriptionFromServer();
  } catch (err: any) {
    console.error('[Archii Push] Error en unregisterPushSubscription:', err.message);
  }
}

/**
 * Verifica si el navegador soporta Push y las claves VAPID están configuradas.
 */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;
}

/**
 * Devuelve el estado actual del permiso de notificaciones.
 */
export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined') return 'denied';
  return Notification.permission;
}
