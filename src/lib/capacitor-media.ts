/**
 * Capacitor Media & Camera Bridge
 *
 * Maneja la cámara, fotos y archivos usando plugins nativos de Capacitor.
 * En web, usa el input file estándar como fallback.
 */

import { Camera, CameraResultType, CameraSource, CameraDirection } from '@capacitor/camera';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNativePlatform, runNative } from './capacitor-native';

// ── Camera ──

export interface CameraPhotoResult {
  base64String?: string;
  webPath?: string;
  path?: string;
  format: string;
  saved: boolean;
}

/**
 * Toma una foto usando la cámara nativa o selecciona de la galería.
 *
 * @param source 'camera' | 'photos' | 'prompt'
 * @param allowEditing Permite editar/recortar la foto
 * @param quality Calidad 0-100 (default: 90)
 */
export async function takePhoto(
  source: 'camera' | 'photos' | 'prompt' = 'camera',
  allowEditing = false,
  quality = 90
): Promise<CameraPhotoResult | null> {
  // Solicitar permisos primero
  const permissions = await Camera.requestPermissions();
  if (permissions.camera !== 'granted' && source === 'camera') {
    console.warn('[Camera] Camera permission not granted');
    return null;
  }
  if (permissions.photos !== 'granted' && source === 'photos') {
    console.warn('[Camera] Photos permission not granted');
    return null;
  }

  try {
    const sourceMap = {
      camera: CameraSource.Camera,
      photos: CameraSource.Photos,
      prompt: CameraSource.Prompt,
    };

    const photo = await Camera.getPhoto({
      quality,
      allowEditing,
      resultType: CameraResultType.Base64,
      source: sourceMap[source],
      direction: CameraDirection.Rear,
      saveToGallery: true,
      width: 1920, // Max resolution
      height: 1920,
    });

    return {
      base64String: photo.base64String,
      webPath: photo.webPath,
      path: photo.path,
      format: photo.format,
      saved: true,
    };
  } catch (err: any) {
    // Usuario canceló o error
    if (err.message?.includes('cancel') || err.message?.includes('User cancelled')) {
      return null;
    }
    console.error('[Camera] Error taking photo:', err);
    return null;
  }
}

/**
 * Selecciona múltiples fotos de la galería.
 * Solo disponible en nativo.
 */
export async function pickPhotos(
  multiple = true,
  quality = 90
): Promise<CameraPhotoResult[]> {
  if (!isNativePlatform()) {
    // En web, el input file múltiple es el fallback
    return [];
  }

  try {
    const photos = await Camera.pickImages({
      quality,
      limit: multiple ? 10 : 1,
    });

    return photos.photos.map((p) => ({
      webPath: p.webPath,
      format: 'jpeg',
      saved: false,
    }));
  } catch (err) {
    console.error('[Camera] Error picking photos:', err);
    return [];
  }
}

/**
 * Solicita permisos de cámara.
 * En iOS, esto muestra el diálogo nativo de permisos.
 */
export async function requestCameraPermissions(): Promise<{
  camera: 'granted' | 'denied' | 'prompt';
  photos: 'granted' | 'denied' | 'prompt';
}> {
  return runNative(
    () => Camera.requestPermissions(),
    () => ({ camera: 'granted', photos: 'granted' }) // Web: asumir granted
  ) as Promise<{ camera: 'granted' | 'denied' | 'prompt'; photos: 'granted' | 'denied' | 'prompt' }>;
}

/**
 * Verifica el estado actual de los permisos de cámara.
 */
export async function checkCameraPermissions(): Promise<{
  camera: 'granted' | 'denied' | 'prompt';
  photos: 'granted' | 'denied' | 'prompt';
}> {
  return runNative(
    () => Camera.checkPermissions(),
    () => ({ camera: 'granted', photos: 'granted' })
  ) as Promise<{ camera: 'granted' | 'denied' | 'prompt'; photos: 'granted' | 'denied' | 'prompt' }>;
}

// ── Filesystem ──

/**
 * Guarda un archivo en el sistema de archivos nativo.
 */
export async function saveFile(
  path: string,
  data: string,
  directory: Directory = Directory.Data
): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await Filesystem.writeFile({
      path,
      data,
      directory,
      encoding: Encoding.UTF8,
    });
  } catch (err) {
    console.error('[Filesystem] Error saving file:', err);
  }
}

/**
 * Lee un archivo del sistema de archivos nativo.
 */
export async function readFile(
  path: string,
  directory: Directory = Directory.Data
): Promise<string | null> {
  if (!isNativePlatform()) return null;

  try {
    const result = await Filesystem.readFile({
      path,
      directory,
      encoding: Encoding.UTF8,
    });
    return result.data as string;
  } catch {
    return null;
  }
}

/**
 * Guarda un Blob como archivo y retorna una URI nativa.
 */
export async function saveBlobToFile(
  filename: string,
  blob: Blob,
  directory: Directory = Directory.Cache
): Promise<string | null> {
  if (!isNativePlatform()) return null;

  try {
    const base64 = await blobToBase64(blob);
    const result = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory,
    });
    return result.uri;
  } catch (err) {
    console.error('[Filesystem] Error saving blob:', err);
    return null;
  }
}

// ── Share ──

/**
 * Comparte contenido usando el sheet nativo de compartir.
 * Funciona en iOS y Android.
 */
export async function shareContent(options: {
  title?: string;
  text?: string;
  url?: string;
  files?: string[];
  dialogTitle?: string;
}): Promise<void> {
  await runNative(
    async () => { Share.share(options); },
    async () => {
      // Fallback web: usar Web Share API si está disponible
      if (navigator.share) {
        await navigator.share({
          title: options.title,
          text: options.text,
          url: options.url,
        });
      } else {
        // Fallback: copiar al portapapeles
        if (options.text || options.url) {
          await navigator.clipboard.writeText(options.text || options.url || '');
        }
      }
    }
  );
}

/**
 * Comparte un archivo (PDF, Excel, etc.) descargándolo y usando el share nativo.
 */
export async function shareFile(
  filename: string,
  mimeType: string,
  blob: Blob,
  title?: string
): Promise<void> {
  if (!isNativePlatform()) {
    // Web fallback: descarga normal
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  // Nativo: guardar en cache y compartir
  const fileUri = await saveBlobToFile(filename, blob, Directory.Cache);
  if (fileUri) {
    await Share.share({
      title: title || filename,
      files: [fileUri],
    });
  }
}

// ── Helpers ──

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
