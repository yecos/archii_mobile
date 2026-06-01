/**
 * firebase-admin.ts
 * Firebase Admin SDK para uso en API routes (server-side).
 * El firebase-service.ts usa window.firebase (client-side),
 * pero las API routes corren en el servidor donde no existe window.
 *
 * Este módulo inicializa firebase-admin con las credenciales del proyecto.
 */

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// SEC-M02: Remove hardcoded project ID fallback — require the env var explicitly
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (!FIREBASE_PROJECT_ID) {
  console.error('[Archii Admin] NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set. Firebase Admin SDK will not initialize correctly.');
}

/** Check if Admin SDK has proper credentials configured */
export function isAdminInitialized(): { ok: boolean; reason?: string } {
  const credJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!credJson) {
    return { ok: false, reason: 'FIREBASE_ADMIN_CREDENTIALS env var is not set' };
  }
  try {
    const parsed = JSON.parse(credJson);
    if (!parsed.private_key || !parsed.client_email) {
      return { ok: false, reason: 'Credentials JSON missing private_key or client_email' };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: `JSON parse error: ${e?.message || String(e)}` };
  }
}

// Credenciales para firebase-admin desde variables de entorno o JSON
function getAdminConfig() {
  // Si hay un JSON de credenciales completo, usarlo
  const credJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (credJson) {
    try {
      const parsed = JSON.parse(credJson);
      // Fix private_key newlines: env vars sometimes have literal '\n' instead of actual newlines.
      // After JSON.parse, '\n' becomes real newlines, but '\\n' stays as literal \n strings.
      // Always normalize: replace literal \n strings with actual newlines if the key looks wrong.
      if (parsed.private_key && typeof parsed.private_key === 'string') {
        // If the key has literal backslash-n (\\n after JSON.parse → \n in JS string) instead of real newlines
        if (parsed.private_key.includes('\\n')) {
          parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
        }
        // Also handle case where the key was double-escaped in the env var
        if (!parsed.private_key.includes('\n') && parsed.private_key.length > 100) {
          // Key has no newlines at all but is long enough to be a real key — try replacing
          parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
        }
      }
      return cert(parsed);
    } catch (e: any) {
      console.error('[Archii Admin] Error parseando FIREBASE_ADMIN_CREDENTIALS:', e?.message || String(e));
    }
  }

  // Si no, usar credenciales individuales (Application Default Credentials en Vercel)
  // Esto funciona si configuramos la cuenta de servicio en Vercel
  console.warn('[Archii Admin] No FIREBASE_ADMIN_CREDENTIALS found, falling back to ADC (may not work on Vercel)');
  return undefined; // Usa ADC automáticamente
}

// Singleton
let _adminApp: ReturnType<typeof initializeApp> | null = null;
let _adminDb: ReturnType<typeof getFirestore> | null = null;

export function getAdminApp() {
  if (_adminApp) return _adminApp;
  if (getApps().length > 0) {
    _adminApp = getApp();
  } else {
    const credential = getAdminConfig();
    // Only include credential if it's defined — passing credential: undefined
    // causes "Invalid Firebase app options" error
    const config: any = { projectId: FIREBASE_PROJECT_ID };
    if (credential) {
      config.credential = credential;
    }
    _adminApp = initializeApp(config);
  }
  return _adminApp;
}

export function getAdminDb() {
  if (_adminDb) return _adminDb;
  try {
    _adminDb = getFirestore(getAdminApp());
  } catch (err: any) {
    console.error('[Archii Admin] getAdminDb failed:', err.message);
    throw new Error(
      'Firebase Admin no está configurado. Agrega FIREBASE_ADMIN_CREDENTIALS a tu archivo .env.local. ' +
      'Genera la clave desde Firebase Console → Project Settings → Service Accounts → Generate New Private Key.'
    );
  }
  return _adminDb;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

/**
 * FieldValue equivalente para server-side
 */
export function getAdminFieldValue() {
  return FieldValue;
}
