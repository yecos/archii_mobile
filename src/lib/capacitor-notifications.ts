/**
 * Capacitor Push Notifications Bridge
 *
 * Maneja las notificaciones push nativas usando @capacitor/push-notifications.
 * En web/PWA, delega al Service Worker existente.
 */

import { PushNotifications } from '@capacitor/push-notifications';
import { isNativePlatform, runNative } from './capacitor-native';

// ── Types ──

export interface PushToken {
  value: string;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  id: string;
  tag?: string;
  data?: Record<string, unknown>;
}

// ── Event Listeners ──

let listenersRegistered = false;

/**
 * Inicializa el sistema de push notifications nativo.
 * Debe llamarse una sola vez al iniciar la app.
 */
export async function initPushNotifications(): Promise<void> {
  if (!isNativePlatform()) {
    // En web, el Service Worker ya maneja las push
    console.log('[Push] Web platform - using Service Worker');
    return;
  }

  if (listenersRegistered) return;

  // Escuchar cuando se recibe el token del dispositivo
  await PushNotifications.addListener('registration', (token) => {
    console.log('[Push] Native token received:', token.value);
    // Aquí puedes enviar el token a tu servidor/Firestore
    // para asociarlo con el usuario actual
    window.dispatchEvent(
      new CustomEvent('capacitor-push-token', {
        detail: { token: token.value },
      })
    );
  });

  // Error de registro
  await PushNotifications.addListener('registrationError', (err) => {
    console.error('[Push] Registration error:', err.error);
  });

  // Notificación recibida en primer plano
  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[Push] Notification received:', notification);
    // Emitir evento para que la app lo maneje
    window.dispatchEvent(
      new CustomEvent('capacitor-push-received', {
        detail: notification,
      })
    );
  });

  // Usuario tocó una notificación
  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('[Push] Notification action performed:', action);
    window.dispatchEvent(
      new CustomEvent('capacitor-push-action', {
        detail: action,
      })
    );
  });

  listenersRegistered = true;
}

// ── Request Permission ──

/**
 * Solicita permiso para notificaciones push.
 * En iOS, muestra el diálogo de permiso nativo.
 * En Android, el permiso se solicita automáticamente en Android 13+.
 */
export async function requestPushPermission(): Promise<'granted' | 'denied'> {
  return runNative(
    async () => {
      const result = await PushNotifications.requestPermissions();
      return result.receive === 'granted' ? 'granted' : 'denied';
    },
    async () => {
      // Fallback web
      if (!('Notification' in window)) return 'denied';
      const result = await Notification.requestPermission();
      return result === 'granted' ? 'granted' : 'denied';
    }
  ) as Promise<'granted' | 'denied'>;
}

// ── Register ──

/** Registra el dispositivo para recibir push notifications */
export async function registerPush(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await PushNotifications.register();
  } catch (err) {
    console.error('[Push] Failed to register:', err);
  }
}

// ── Unregister ──

/** Elimina el registro de push notifications */
export async function unregisterPush(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await PushNotifications.unregister();
  } catch (err) {
    console.error('[Push] Failed to unregister:', err);
  }
}

// ── Delivered Notifications ──

/** Obtiene las notificaciones entregadas (iOS) */
export async function getDeliveredNotifications(): Promise<PushNotificationPayload[]> {
  if (!isNativePlatform()) return [];

  try {
    const result = await PushNotifications.getDeliveredNotifications();
    return result.notifications.map((n) => ({
      title: n.title || '',
      body: n.body || '',
      id: n.id,
      data: n.data as Record<string, unknown>,
    }));
  } catch {
    return [];
  }
}

/** Elimina las notificaciones entregadas específicas (iOS) */
export async function removeDeliveredNotifications(ids: string[]): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await PushNotifications.removeDeliveredNotifications({
      notifications: ids.map((id) => ({ id, title: '', body: '', data: {} })),
    });
  } catch (err) {
    console.error('[Push] Failed to remove delivered notifications:', err);
  }
}

/** Elimina todas las notificaciones entregadas (iOS) */
export async function removeAllDeliveredNotifications(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await PushNotifications.removeAllDeliveredNotifications();
  } catch (err) {
    console.error('[Push] Failed to remove all delivered notifications:', err);
  }
}
