/**
 * useCapacitor
 *
 * Hook principal que expone todas las capacidades nativas de Capacitor
 * de forma unificada. Detecta automáticamente si estamos en nativo o web.
 */

import { useCallback, useEffect, useState } from 'react';
import { isNativePlatform, isIOS, isAndroid, getPlatform } from '@/lib/capacitor-native';
import {
  signInWithGoogleNative,
  signInWithMicrosoftNative,
  signInWithAppleNative,
  signInWithEmailNative,
  createUserWithEmailNative,
  signOutNative,
  getCurrentUserNative,
} from '@/lib/capacitor-firebase-auth';
import {
  takePhoto,
  pickPhotos,
  requestCameraPermissions,
  checkCameraPermissions,
  shareFile,
  shareContent,
} from '@/lib/capacitor-media';
import {
  requestPushPermission,
  registerPush,
  unregisterPush,
} from '@/lib/capacitor-notifications';
import {
  configureStatusBar,
  hideSplashScreen,
  showSplashScreen,
  addKeyboardListeners,
  hapticLight,
  hapticSuccess,
  hapticError,
} from '@/lib/capacitor-ui';
import type { AuthResult } from '@/lib/capacitor-firebase-auth';
import type { CameraPhotoResult } from '@/lib/capacitor-media';

export interface UseCapacitorReturn {
  // Platform
  isNative: boolean;
  isIOSNative: boolean;
  isAndroidNative: boolean;
  platform: 'ios' | 'android' | 'web';

  // Auth
  signInWithGoogle: () => Promise<AuthResult>;
  signInWithMicrosoft: () => Promise<AuthResult>;
  signInWithApple: () => Promise<AuthResult>;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  createUserWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  getCurrentUser: () => Promise<AuthResult['user']>;

  // Camera & Media
  takePhoto: (source?: 'camera' | 'photos' | 'prompt', allowEditing?: boolean, quality?: number) => Promise<CameraPhotoResult | null>;
  pickPhotos: (multiple?: boolean, quality?: number) => Promise<CameraPhotoResult[]>;
  requestCameraPermissions: () => Promise<{ camera: string; photos: string }>;
  checkCameraPermissions: () => Promise<{ camera: string; photos: string }>;

  // Share
  shareContent: (options: { title?: string; text?: string; url?: string; files?: string[] }) => Promise<void>;
  shareFile: (filename: string, mimeType: string, blob: Blob, title?: string) => Promise<void>;

  // Push Notifications
  requestPushPermission: () => Promise<'granted' | 'denied'>;
  registerPush: () => Promise<void>;
  unregisterPush: () => Promise<void>;

  // UI
  configureStatusBar: (isDark?: boolean) => Promise<void>;
  hideSplashScreen: (fadeOutDuration?: number) => Promise<void>;
  showSplashScreen: () => Promise<void>;
  addKeyboardListeners: (onShow?: (info: { keyboardHeight: number }) => void, onHide?: () => void) => (() => void) | void;
  hapticLight: () => Promise<void>;
  hapticSuccess: () => Promise<void>;
  hapticError: () => Promise<void>;
}

export function useCapacitor(): UseCapacitorReturn {
  // Platform state
  const [platformInfo] = useState({
    isNative: isNativePlatform(),
    isIOSNative: isIOS(),
    isAndroidNative: isAndroid(),
    platform: getPlatform(),
  });

  // Auth methods
  const handleSignInWithGoogle = useCallback(async () => {
    return signInWithGoogleNative();
  }, []);

  const handleSignInWithMicrosoft = useCallback(async () => {
    return signInWithMicrosoftNative();
  }, []);

  const handleSignInWithApple = useCallback(async () => {
    return signInWithAppleNative();
  }, []);

  const handleSignInWithEmail = useCallback(async (email: string, password: string) => {
    return signInWithEmailNative(email, password);
  }, []);

  const handleCreateUserWithEmail = useCallback(async (email: string, password: string) => {
    return createUserWithEmailNative(email, password);
  }, []);

  const handleSignOut = useCallback(async () => {
    return signOutNative();
  }, []);

  const handleGetCurrentUser = useCallback(async () => {
    return getCurrentUserNative();
  }, []);

  // Camera methods
  const handleTakePhoto = useCallback(async (source?: 'camera' | 'photos' | 'prompt', allowEditing?: boolean, quality?: number) => {
    return takePhoto(source, allowEditing, quality);
  }, []);

  const handlePickPhotos = useCallback(async (multiple?: boolean, quality?: number) => {
    return pickPhotos(multiple, quality);
  }, []);

  const handleRequestCameraPermissions = useCallback(async () => {
    return requestCameraPermissions();
  }, []);

  const handleCheckCameraPermissions = useCallback(async () => {
    return checkCameraPermissions();
  }, []);

  // Share methods
  const handleShareContent = useCallback(async (options: { title?: string; text?: string; url?: string; files?: string[] }) => {
    return shareContent(options);
  }, []);

  const handleShareFile = useCallback(async (filename: string, mimeType: string, blob: Blob, title?: string) => {
    return shareFile(filename, mimeType, blob, title);
  }, []);

  // Push methods
  const handleRequestPushPermission = useCallback(async () => {
    return requestPushPermission();
  }, []);

  const handleRegisterPush = useCallback(async () => {
    return registerPush();
  }, []);

  const handleUnregisterPush = useCallback(async () => {
    return unregisterPush();
  }, []);

  // UI methods
  const handleConfigureStatusBar = useCallback(async (isDark?: boolean) => {
    return configureStatusBar(isDark);
  }, []);

  const handleHideSplashScreen = useCallback(async (fadeOutDuration?: number) => {
    return hideSplashScreen({ fadeOutDuration });
  }, []);

  const handleShowSplashScreen = useCallback(async () => {
    return showSplashScreen();
  }, []);

  const handleAddKeyboardListeners = useCallback((onShow?: (info: { keyboardHeight: number }) => void, onHide?: () => void) => {
    return addKeyboardListeners(onShow, onHide);
  }, []);

  const handleHapticLight = useCallback(async () => {
    return hapticLight();
  }, []);

  const handleHapticSuccess = useCallback(async () => {
    return hapticSuccess();
  }, []);

  const handleHapticError = useCallback(async () => {
    return hapticError();
  }, []);

  return {
    ...platformInfo,
    signInWithGoogle: handleSignInWithGoogle,
    signInWithMicrosoft: handleSignInWithMicrosoft,
    signInWithApple: handleSignInWithApple,
    signInWithEmail: handleSignInWithEmail,
    createUserWithEmail: handleCreateUserWithEmail,
    signOut: handleSignOut,
    getCurrentUser: handleGetCurrentUser,
    takePhoto: handleTakePhoto,
    pickPhotos: handlePickPhotos,
    requestCameraPermissions: handleRequestCameraPermissions,
    checkCameraPermissions: handleCheckCameraPermissions,
    shareContent: handleShareContent,
    shareFile: handleShareFile,
    requestPushPermission: handleRequestPushPermission,
    registerPush: handleRegisterPush,
    unregisterPush: handleUnregisterPush,
    configureStatusBar: handleConfigureStatusBar,
    hideSplashScreen: handleHideSplashScreen,
    showSplashScreen: handleShowSplashScreen,
    addKeyboardListeners: handleAddKeyboardListeners,
    hapticLight: handleHapticLight,
    hapticSuccess: handleHapticSuccess,
    hapticError: handleHapticError,
  };
}
