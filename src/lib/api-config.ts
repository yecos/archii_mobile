/**
 * API Configuration for Archii Mobile
 *
 * En la app nativa (Capacitor), las API routes no existen localmente
 * porque el build es estático. Esta configuración permite que las
 * llamadas a /api/* se redirijan al backend de la PWA en Vercel.
 *
 * Uso:
 *   import { getApiUrl } from '@/lib/api-config';
 *   const res = await fetch(getApiUrl('/api/create-entity'), { ... });
 */

import { isNativePlatform } from './capacitor-native';

// URL del backend (PWA en Vercel). Cambiar cuando se despliegue.
const PWA_BACKEND_URL = process.env.NEXT_PUBLIC_PWA_BACKEND_URL || 'https://archii-theta.vercel.app';

/**
 * Retorna la URL completa para una API route.
 *
 * - En web (PWA): retorna la ruta relativa (ej. "/api/create-entity")
 *   porque el servidor Next.js la maneja localmente.
 *
 * - En nativo (Capacitor): retorna la URL completa del backend
 *   (ej. "https://archii-theta.vercel.app/api/create-entity")
 *   porque la app estática no tiene servidor.
 */
export function getApiUrl(path: string): string {
  if (isNativePlatform() && path.startsWith('/api/')) {
    return `${PWA_BACKEND_URL}${path}`;
  }
  return path;
}

/**
 * Retorna la URL base del backend.
 * Útil para construir URLs dinámicamente.
 */
export function getBackendUrl(): string {
  if (isNativePlatform()) {
    return PWA_BACKEND_URL;
  }
  return '';
}

/**
 * Headers adicionales para requests nativos.
 * Incluye el token de autenticación de Firebase si está disponible.
 */
export function getNativeHeaders(): Record<string, string> {
  if (!isNativePlatform()) return {};

  return {
    'X-Client-Platform': 'capacitor-native',
    'X-Client-Version': '2.0.0',
  };
}

export default getApiUrl;
