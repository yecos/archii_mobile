/**
 * Capacitor Firebase Authentication Bridge
 *
 * Maneja la autenticación en dispositivos nativos usando el SDK nativo
 * de Firebase en lugar de los popups de OAuth que no funcionan en WebView.
 *
 * En web (PWA/navegador), usa el flujo estándar de Firebase.
 * En nativo (Capacitor), usa @capacitor-firebase/authentication.
 */

import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { isNativePlatform } from './capacitor-native';

// ── Types ──

export interface AuthResult {
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoUrl: string | null;
    providerId: string;
  } | null;
  credential: {
    idToken: string;
    accessToken: string | null;
  } | null;
  error?: string;
}

// ── Google Sign-In ──

/**
 * Inicia sesión con Google.
 * En nativo: usa el SDK nativo de Google Sign-In.
 * En web: delega al flujo de Firebase estándar (popup/redirect).
 */
export async function signInWithGoogleNative(): Promise<AuthResult> {
  if (!isNativePlatform()) {
    // En web, usar el flujo estándar de Firebase
    return { user: null, credential: null };
  }

  try {
    const result = await FirebaseAuthentication.signInWithGoogle();
    return {
      user: result.user
        ? {
            uid: result.user.uid,
            email: result.user.email,
            displayName: result.user.displayName,
            photoUrl: result.user.photoUrl,
            providerId: 'google.com',
          }
        : null,
      credential: result.credential
        ? {
            idToken: result.credential.idToken || '',
            accessToken: result.credential.accessToken || null,
          }
        : null,
    };
  } catch (err: any) {
    console.error('[Capacitor Auth] Google sign-in failed:', err);
    return {
      user: null,
      credential: null,
      error: err.message || 'Google sign-in failed',
    };
  }
}

// ── Microsoft Sign-In ──

/**
 * Inicia sesión con Microsoft (OAuth).
 * En nativo: usa el flujo OAuth nativo.
 * En web: delega al flujo de Firebase estándar.
 */
export async function signInWithMicrosoftNative(): Promise<AuthResult> {
  if (!isNativePlatform()) {
    return { user: null, credential: null };
  }

  try {
    const result = await FirebaseAuthentication.signInWithMicrosoft();
    return {
      user: result.user
        ? {
            uid: result.user.uid,
            email: result.user.email,
            displayName: result.user.displayName,
            photoUrl: result.user.photoUrl,
            providerId: 'microsoft.com',
          }
        : null,
      credential: result.credential
        ? {
            idToken: result.credential.idToken || '',
            accessToken: result.credential.accessToken || null,
          }
        : null,
    };
  } catch (err: any) {
    console.error('[Capacitor Auth] Microsoft sign-in failed:', err);
    return {
      user: null,
      credential: null,
      error: err.message || 'Microsoft sign-in failed',
    };
  }
}

// ── Apple Sign-In ──

/**
 * Inicia sesión con Apple (OAuth).
 * Disponible en iOS nativo.
 */
export async function signInWithAppleNative(): Promise<AuthResult> {
  if (!isNativePlatform()) {
    return { user: null, credential: null };
  }

  try {
    const result = await FirebaseAuthentication.signInWithApple();
    return {
      user: result.user
        ? {
            uid: result.user.uid,
            email: result.user.email,
            displayName: result.user.displayName,
            photoUrl: result.user.photoUrl,
            providerId: 'apple.com',
          }
        : null,
      credential: result.credential
        ? {
            idToken: result.credential.idToken || '',
            accessToken: result.credential.accessToken || null,
          }
        : null,
    };
  } catch (err: any) {
    console.error('[Capacitor Auth] Apple sign-in failed:', err);
    return {
      user: null,
      credential: null,
      error: err.message || 'Apple sign-in failed',
    };
  }
}

// ── Email/Password ──

/**
 * Inicia sesión con email y password usando el SDK nativo.
 */
export async function signInWithEmailNative(
  email: string,
  password: string
): Promise<AuthResult> {
  if (!isNativePlatform()) {
    return { user: null, credential: null };
  }

  try {
    const result = await FirebaseAuthentication.signInWithEmailAndPassword({
      email,
      password,
    });
    return {
      user: result.user
        ? {
            uid: result.user.uid,
            email: result.user.email,
            displayName: result.user.displayName,
            photoUrl: result.user.photoUrl,
            providerId: 'password',
          }
        : null,
      credential: null,
    };
  } catch (err: any) {
    console.error('[Capacitor Auth] Email sign-in failed:', err);
    return {
      user: null,
      credential: null,
      error: err.message || 'Email sign-in failed',
    };
  }
}

/**
 * Registra un usuario con email y password usando el SDK nativo.
 */
export async function createUserWithEmailNative(
  email: string,
  password: string
): Promise<AuthResult> {
  if (!isNativePlatform()) {
    return { user: null, credential: null };
  }

  try {
    const result = await FirebaseAuthentication.createUserWithEmailAndPassword({
      email,
      password,
    });
    return {
      user: result.user
        ? {
            uid: result.user.uid,
            email: result.user.email,
            displayName: result.user.displayName,
            photoUrl: result.user.photoUrl,
            providerId: 'password',
          }
        : null,
      credential: null,
    };
  } catch (err: any) {
    console.error('[Capacitor Auth] Email registration failed:', err);
    return {
      user: null,
      credential: null,
      error: err.message || 'Email registration failed',
    };
  }
}

// ── Sign Out ──

/** Cierra sesión en Firebase nativo */
export async function signOutNative(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await FirebaseAuthentication.signOut();
  } catch (err) {
    console.error('[Capacitor Auth] Sign out failed:', err);
  }
}

// ── Auth State ──

/**
 * Obtiene el usuario actual nativo.
 * Útil para sincronizar el estado de auth entre el WebView y nativo.
 */
export async function getCurrentUserNative(): Promise<AuthResult['user']> {
  if (!isNativePlatform()) return null;

  try {
    const result = await FirebaseAuthentication.getCurrentUser();
    return result.user
      ? {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          photoUrl: result.user.photoUrl,
          providerId: result.user.providerId || 'firebase',
        }
      : null;
  } catch {
    return null;
  }
}

// ── Set Language Code ──

/** Establece el idioma para los emails de Firebase Auth */
export async function setAuthLanguage(code: string): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await FirebaseAuthentication.setLanguageCode({ languageCode: code });
  } catch (err) {
    console.warn('[Capacitor Auth] Failed to set language:', err);
  }
}
