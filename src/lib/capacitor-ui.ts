/**
 * Capacitor UI Plugins Bridge
 *
 * Maneja StatusBar, Keyboard, SplashScreen y otros ajustes de UI nativa.
 */

import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { isNativePlatform, runNative, isIOS, isAndroid } from './capacitor-native';

// ── Status Bar ──

/**
 * Configura la status bar según el tema actual.
 * En dark mode: texto blanco, fondo oscuro.
 * En light mode: texto negro, fondo claro.
 */
export async function configureStatusBar(isDarkMode = true): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    // Aplicar color de fondo según el tema
    const backgroundColor = isDarkMode ? '#0e0f11' : '#f8f7f4';
    await StatusBar.setBackgroundColor({ color: backgroundColor });

    // Aplicar estilo de texto/icons en status bar
    await StatusBar.setStyle({
      style: isDarkMode ? Style.Dark : Style.Light,
    });

    // Permitir que el contenido se extienda detrás de la status bar
    // (para el efecto glassmorphism premium)
    await StatusBar.setOverlaysWebView({ overlay: true });
  } catch (err) {
    console.warn('[StatusBar] Configuration failed:', err);
  }
}

/**
 * Muestra la status bar (útil después de pantalla splash).
 */
export async function showStatusBar(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await StatusBar.show();
  } catch (err) {
    console.warn('[StatusBar] Show failed:', err);
  }
}

/**
 * Oculta la status bar (para pantalla completa).
 */
export async function hideStatusBar(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await StatusBar.hide();
  } catch (err) {
    console.warn('[StatusBar] Hide failed:', err);
  }
}

// ── Keyboard ──

/**
 * Configura el comportamiento del teclado nativo.
 * 'resize': el contenido se redimensiona cuando aparece el teclado.
 * 'pan': el contenido se desplaza hacia arriba.
 */
export async function configureKeyboard(resizeMode: KeyboardResize = KeyboardResize.Native): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await Keyboard.setResizeMode({ mode: resizeMode });
  } catch (err) {
    console.warn('[Keyboard] Configuration failed:', err);
  }
}

/**
 * Escucha cuando el teclado se muestra/oculta.
 * Útil para ajustar layouts cuando aparece el teclado.
 */
export function addKeyboardListeners(
  onShow?: (info: { keyboardHeight: number }) => void,
  onHide?: () => void
): () => void {
  if (!isNativePlatform()) {
    // En web, usar Visual Viewport API como fallback
    if (onShow || onHide) {
      const handleResize = () => {
        const vv = window.visualViewport;
        if (!vv) return;
        const diff = window.innerHeight - vv.height;
        if (diff > 100) {
          onShow?.({ keyboardHeight: diff });
        } else {
          onHide?.();
        }
      };
      window.visualViewport?.addEventListener('resize', handleResize);
      return () => window.visualViewport?.removeEventListener('resize', handleResize);
    }
    return () => {};
  }

  const unsubShow = Keyboard.addListener('keyboardWillShow', (info) => {
    onShow?.(info);
  });

  const unsubHide = Keyboard.addListener('keyboardWillHide', () => {
    onHide?.();
  });

  // Return cleanup function
  return () => {
    unsubShow.then((s) => s.remove());
    unsubHide.then((s) => s.remove());
  };
}

// ── Splash Screen ──

/**
 * Oculta la splash screen programáticamente.
 * Útil cuando la app ha terminado de cargar.
 */
export async function hideSplashScreen(options?: { fadeOutDuration?: number }): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await SplashScreen.hide({
      fadeOutDuration: options?.fadeOutDuration ?? 500,
    });
  } catch (err) {
    console.warn('[SplashScreen] Hide failed:', err);
  }
}

/**
 * Muestra la splash screen (útil para refrescos).
 */
export async function showSplashScreen(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await SplashScreen.show({
      autoHide: false,
      fadeInDuration: 300,
    });
  } catch (err) {
    console.warn('[SplashScreen] Show failed:', err);
  }
}

// ── Safe Area ──

/**
 * Obtiene las insets de safe area del dispositivo.
 * Útil para posicionar elementos detrás de notch/island.
 */
export function getSafeAreaInsets(): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  if (!isNativePlatform()) {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }

  // Leer desde CSS env() variables
  const styles = getComputedStyle(document.documentElement);
  const top = parseInt(styles.getPropertyValue('--sat') || '0', 10);
  const bottom = parseInt(styles.getPropertyValue('--sab') || '0', 10);
  const left = parseInt(styles.getPropertyValue('--sal') || '0', 10);
  const right = parseInt(styles.getPropertyValue('--sar') || '0', 10);

  return { top, bottom, left, right };
}

/**
 * Aplica las insets de safe area al documento como CSS variables.
 * Esto permite usar env(safe-area-inset-*) en el CSS.
 */
export function applySafeAreaInsets(): void {
  if (!isNativePlatform()) return;

  // Capacitor inyecta estas variables automáticamente
  // Pero nos aseguramos de que estén disponibles
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    const content = meta.getAttribute('content') || '';
    if (!content.includes('viewport-fit=cover')) {
      meta.setAttribute('content', `${content}, viewport-fit=cover`);
    }
  }
}

// ── Haptic Feedback ──

/**
 * Proporciona feedback háptico ligero en dispositivos nativos.
 * En web, es un no-op.
 */
export async function hapticLight(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    // Usar la API de Haptics si está disponible
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Haptics no está instalado, ignorar silenciosamente
  }
}

/**
 * Proporciona feedback háptico de éxito.
 */
export async function hapticSuccess(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // Ignorar
  }
}

/**
 * Feedback háptico de error.
 */
export async function hapticError(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Error });
  } catch {
    // Ignorar
  }
}
