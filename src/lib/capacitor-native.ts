/**
 * Capacitor Native Bridge
 *
 * Utilidades que detectan si estamos corriendo en Capacitor nativo
 * (Android/iOS) y proporcionan acceso a APIs nativas del sistema operativo.
 *
 * Si no estamos en Capacitor, cae gracefulmente a las APIs web estándar.
 */

import { Capacitor } from '@capacitor/core';

// ── Platform Detection ──

/** Retorna true si estamos en una app nativa de Capacitor */
export const isNativePlatform = (): boolean => {
  return Capacitor.isNativePlatform();
};

/** Retorna la plataforma: 'ios', 'android', o 'web' */
export const getPlatform = (): 'ios' | 'android' | 'web' => {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
};

/** Retorna true si estamos en iOS nativo */
export const isIOS = (): boolean => getPlatform() === 'ios';

/** Retorna true si estamos en Android nativo */
export const isAndroid = (): boolean => getPlatform() === 'android';

// ── Safe execution wrapper ──

/**
 * Ejecuta una función nativa solo si estamos en Capacitor.
 * Si no, ejecuta el fallback (opcional) o retorna undefined.
 */
export async function runNative<T>(
  nativeFn: () => Promise<T>,
  fallbackFn?: () => Promise<T> | T
): Promise<T | undefined> {
  if (isNativePlatform()) {
    try {
      return await nativeFn();
    } catch (err) {
      console.warn('[Capacitor] Native call failed, trying fallback:', err);
      if (fallbackFn) {
        try {
          return await fallbackFn();
        } catch {
          return undefined;
        }
      }
      return undefined;
    }
  }
  if (fallbackFn) {
    try {
      return await fallbackFn();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// ── Feature detection ──

/** Verifica si una función nativa específica está disponible */
export const isFeatureAvailable = (pluginName: string, methodName: string): boolean => {
  return Capacitor.isPluginAvailable(pluginName) && isNativePlatform();
};
