'use client';

import { useEffect } from 'react';
import { configureStatusBar, configureKeyboard, addKeyboardListeners, applySafeAreaInsets, hideSplashScreen } from '@/lib/capacitor-ui';
import { KeyboardResize } from '@capacitor/keyboard';
import { initPushNotifications } from '@/lib/capacitor-notifications';
import { isNativePlatform } from '@/lib/capacitor-native';
import { setAuthLanguage } from '@/lib/capacitor-firebase-auth';

/**
 * CapacitorInit
 *
 * Componente invisible que inicializa todos los plugins nativos
 * de Capacitor cuando la app se monta. Solo tiene efecto en
 * plataformas nativas (iOS/Android). En web, es un no-op.
 */
export default function CapacitorInit() {
  useEffect(() => {
    // Solo ejecutar en nativo
    if (!isNativePlatform()) return;

    let keyboardCleanup: (() => void) | undefined;

    async function init() {
      try {
        // 1. Aplicar safe area insets
        applySafeAreaInsets();

        // 2. Configurar status bar según tema oscuro (default)
        await configureStatusBar(true);

        // 3. Configurar teclado nativo
        await configureKeyboard(KeyboardResize.Native);

        // 4. Escuchar cambios del teclado para ajustar layout
        keyboardCleanup = addKeyboardListeners(
          ({ keyboardHeight }) => {
            // Ajustar padding-bottom del body cuando el teclado aparece
            document.body.style.paddingBottom = `${keyboardHeight}px`;
          },
          () => {
            // Restaurar cuando el teclado desaparece
            document.body.style.paddingBottom = '';
          }
        );

        // 5. Inicializar push notifications
        await initPushNotifications();

        // 6. Establecer idioma de auth en español
        await setAuthLanguage('es');

        // 7. Ocultar splash screen después de que React hidrató
        // (El delay permite que la app se renderice antes de quitar la splash)
        setTimeout(() => {
          hideSplashScreen({ fadeOutDuration: 500 });
        }, 1500);

        console.log('[CapacitorInit] All native plugins initialized');
      } catch (err) {
        console.error('[CapacitorInit] Initialization error:', err);
        // Aún así intentar ocultar la splash screen
        hideSplashScreen({ fadeOutDuration: 300 });
      }
    }

    init();

    // Cleanup
    return () => {
      if (keyboardCleanup) {
        keyboardCleanup();
      }
    };
  }, []);

  // Escuchar cambios de tema para ajustar status bar
  useEffect(() => {
    if (!isNativePlatform()) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const isDark = document.documentElement.classList.contains('dark');
          configureStatusBar(isDark);
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // Este componente no renderiza nada visible
  return null;
}
