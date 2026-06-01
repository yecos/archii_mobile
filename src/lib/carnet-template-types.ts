/* ─── Image Compression Utility ─── */

/**
 * Compress an image file to a base64 data URL with size constraints.
 * Uses Canvas to resize and JPEG compression to reduce file size.
 * This is needed because Firestore has a ~1MB limit per field value.
 *
 * @param file - The image File to compress
 * @param maxWidth - Maximum width in pixels (default: 800)
 * @param maxHeight - Maximum height in pixels (default: 1200)
 * @param quality - JPEG quality 0-1 (default: 0.7)
 * @returns Promise<string> - Compressed base64 data URL
 */
export function compressImage(
  file: File,
  maxWidth: number = 800,
  maxHeight: number = 1200,
  quality: number = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Calculate new dimensions maintaining aspect ratio
        let w = img.width;
        let h = img.height;

        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        if (h > maxHeight) {
          w = Math.round((w * maxHeight) / h);
          h = maxHeight;
        }

        // Draw on canvas and export as JPEG
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);

        // Convert to JPEG with compression
        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        // If still too large (>900KB base64 ≈ 675KB raw), reduce quality further
        const base64Length = dataUrl.length - dataUrl.indexOf(',') - 1;
        const estimatedBytes = Math.ceil(base64Length * 0.75);

        if (estimatedBytes > 900000 && quality > 0.3) {
          // Retry with lower quality
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(dataUrl); // Return original if blob fails
                return;
              }
              const retryReader = new FileReader();
              retryReader.onload = () => resolve(retryReader.result as string);
              retryReader.onerror = reject;
              retryReader.readAsDataURL(blob);
            },
            'image/jpeg',
            quality * 0.6
          );
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => reject(new Error('Error loading image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compress a base64 data URL to fit within Firestore's ~1MB field limit.
 * Re-encodes the image at lower quality/size.
 */
export function compressBase64Image(
  dataUrl: string,
  maxWidth: number = 800,
  maxHeight: number = 1200,
  quality: number = 0.6
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;

      if (w > maxWidth) {
        h = Math.round((h * maxWidth) / w);
        w = maxWidth;
      }
      if (h > maxHeight) {
        w = Math.round((w * maxHeight) / h);
        h = maxHeight;
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl); // Return original on error
    img.src = dataUrl;
  });
}

/* ─── Carnet Template Types ─── */
export interface CarnetTemplate {
  id?: string;
  tenantId: string;
  name: string;
  isDefault: boolean;
  side: 'front' | 'back';
  orientation: 'portrait' | 'landscape';
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImage?: string;
  backgroundFit?: 'cover' | 'contain' | 'stretch';
  logo?: TemplateImageElement;
  elements: TemplateElement[];
  createdAt?: any;
  updatedAt?: any;
}

export type TemplateElement =
  | TextTemplateElement
  | PhotoTemplateElement
  | QRTemplateElement
  | ShapeTemplateElement
  | ImageTemplateElement;

export interface BaseTemplateElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  zIndex?: number;
  visible: boolean;
  locked: boolean;
}

export interface TextTemplateElement extends BaseTemplateElement {
  type: 'text';
  field?: string;
  text?: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontColor: string;
  textAlign: 'left' | 'center' | 'right';
  letterSpacing: number;
  textTransform: 'none' | 'uppercase' | 'lowercase';
  fontStyle: 'normal' | 'italic';
  lineHeight: number;
}

export interface PhotoTemplateElement extends BaseTemplateElement {
  type: 'photo';
  shape: 'rect' | 'circle';
  borderColor: string;
  borderWidth: number;
  objectFit: 'cover' | 'contain';
  placeholder?: string;
}

export interface QRTemplateElement extends BaseTemplateElement {
  type: 'qr';
  borderColor: string;
  borderWidth: number;
  fgColor: string;
  bgColor: string;
  labelText?: string;
  labelFontSize?: number;
  labelColor?: string;
}

export interface ShapeTemplateElement extends BaseTemplateElement {
  type: 'shape';
  shapeType: 'rect' | 'line' | 'circle';
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
}

export interface ImageTemplateElement extends BaseTemplateElement {
  type: 'image';
  image: string;
  objectFit: 'cover' | 'contain';
  borderRadius: number;
}

export interface TemplateImageElement {
  x: number;
  y: number;
  width: number;
  height: number;
  image: string;
  visible: boolean;
  opacity: number;
}

export const FONT_FAMILIES = [
  'Montserrat',
  'Poppins',
  'Roboto',
  'Open Sans',
  'Lato',
  'Playfair Display',
  'DM Serif Display',
  'Raleway',
  'Oswald',
  'Nunito',
] as const;

export const CARD_FIELDS = [
  { value: 'fullName', label: 'Nombre completo' },
  { value: 'employeeCode', label: 'Código empleado' },
  { value: 'position', label: 'Cargo' },
  { value: 'area', label: 'Área' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'email', label: 'Email' },
  { value: 'city', label: 'Ciudad' },
  { value: 'bloodType', label: 'Tipo de sangre' },
  { value: 'eps', label: 'EPS' },
  { value: 'emergencyContact', label: 'Contacto emergencia' },
  { value: 'emergencyPhone', label: 'Teléfono emergencia' },
  { value: 'startDate', label: 'Fecha inicio' },
  { value: 'validUntil', label: 'Válido hasta' },
  { value: 'tenantName', label: 'Nombre empresa' },
  { value: 'statusText', label: 'Estado (VIGENTE/VENCIDO)' },
  { value: 'custom', label: 'Texto personalizado' },
] as const;

/* ─── Default front template ─── */
export function createDefaultPortraitTemplate(tenantId: string): CarnetTemplate {
  return {
    tenantId,
    name: 'Carnet Frente (Default)',
    isDefault: true,
    side: 'front',
    orientation: 'portrait',
    width: 319,
    height: 502,
    backgroundColor: '#F8F5F0',
    elements: [
      { id: 'stripe', type: 'shape', shapeType: 'rect', x: 0, y: 0, width: 5, height: 502, fillColor: '#C9A96E', borderColor: 'transparent', borderWidth: 0, borderRadius: 0, rotation: 0, opacity: 1, zIndex: 0, visible: true, locked: true },
      { id: 'tenantName', type: 'text', field: 'tenantName', x: 20, y: 18, width: 280, height: 20, fontFamily: 'Montserrat', fontSize: 14, fontWeight: 700, fontColor: '#2D2A26', textAlign: 'center', letterSpacing: 3, textTransform: 'uppercase', fontStyle: 'normal', lineHeight: 1.2, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'goldLine', type: 'shape', shapeType: 'line', x: 140, y: 42, width: 40, height: 2, fillColor: '#C9A96E', borderColor: 'transparent', borderWidth: 0, borderRadius: 0, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'photo', type: 'photo', x: 112, y: 52, width: 96, height: 96, shape: 'circle', borderColor: '#C9A96E', borderWidth: 2.5, objectFit: 'cover', rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false, placeholder: '' },
      { id: 'fullName', type: 'text', field: 'fullName', x: 30, y: 158, width: 260, height: 18, fontFamily: 'Montserrat', fontSize: 11, fontWeight: 700, fontColor: '#2D2A26', textAlign: 'center', letterSpacing: 0.8, textTransform: 'uppercase', fontStyle: 'normal', lineHeight: 1.3, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'position', type: 'text', field: 'position', x: 30, y: 180, width: 260, height: 14, fontFamily: 'Montserrat', fontSize: 8, fontWeight: 500, fontColor: '#A88B52', textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase', fontStyle: 'normal', lineHeight: 1.2, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'idBox', type: 'shape', shapeType: 'rect', x: 95, y: 200, width: 130, height: 20, fillColor: 'rgba(201,169,110,0.06)', borderColor: '#C9A96E', borderWidth: 1.5, borderRadius: 4, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'employeeCode', type: 'text', field: 'employeeCode', x: 95, y: 204, width: 130, height: 14, fontFamily: 'Montserrat', fontSize: 9, fontWeight: 600, fontColor: '#2D2A26', textAlign: 'center', letterSpacing: 1.5, textTransform: 'none', fontStyle: 'normal', lineHeight: 1.2, rotation: 0, opacity: 1, zIndex: 3, visible: true, locked: false },
      { id: 'phone', type: 'text', field: 'phone', x: 50, y: 235, width: 230, height: 12, fontFamily: 'Montserrat', fontSize: 7.5, fontWeight: 400, fontColor: '#5C564E', textAlign: 'left', letterSpacing: 0, textTransform: 'none', fontStyle: 'normal', lineHeight: 1.3, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'email', type: 'text', field: 'email', x: 50, y: 250, width: 230, height: 12, fontFamily: 'Montserrat', fontSize: 7.5, fontWeight: 400, fontColor: '#5C564E', textAlign: 'left', letterSpacing: 0, textTransform: 'none', fontStyle: 'normal', lineHeight: 1.3, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'city', type: 'text', field: 'city', x: 50, y: 265, width: 230, height: 12, fontFamily: 'Montserrat', fontSize: 7.5, fontWeight: 400, fontColor: '#5C564E', textAlign: 'left', letterSpacing: 0, textTransform: 'none', fontStyle: 'normal', lineHeight: 1.3, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'footerLine', type: 'shape', shapeType: 'line', x: 20, y: 475, width: 280, height: 1, fillColor: 'rgba(201,169,110,0.2)', borderColor: 'transparent', borderWidth: 0, borderRadius: 0, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false },
      { id: 'statusText', type: 'text', field: 'statusText', x: 200, y: 478, width: 100, height: 10, fontFamily: 'Montserrat', fontSize: 6, fontWeight: 700, fontColor: '#3D8B5E', textAlign: 'right', letterSpacing: 1, textTransform: 'none', fontStyle: 'normal', lineHeight: 1.2, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
    ],
  };
}

/* ─── Default back template ─── */
export function createDefaultBackTemplate(tenantId: string): CarnetTemplate {
  return {
    tenantId,
    name: 'Carnet Reverso (Default)',
    isDefault: true,
    side: 'back',
    orientation: 'portrait',
    width: 319,
    height: 502,
    backgroundColor: '#F8F5F0',
    elements: [
      { id: 'b-stripe', type: 'shape', shapeType: 'rect', x: 0, y: 0, width: 5, height: 502, fillColor: '#C9A96E', borderColor: 'transparent', borderWidth: 0, borderRadius: 0, rotation: 0, opacity: 1, zIndex: 0, visible: true, locked: true },
      { id: 'b-tenantName', type: 'text', field: 'tenantName', x: 20, y: 16, width: 260, height: 16, fontFamily: 'Montserrat', fontSize: 10, fontWeight: 700, fontColor: '#2D2A26', textAlign: 'left', letterSpacing: 2, textTransform: 'uppercase', fontStyle: 'normal', lineHeight: 1.2, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'b-goldLine', type: 'shape', shapeType: 'line', x: 20, y: 36, width: 30, height: 1, fillColor: '#C9A96E', borderColor: 'transparent', borderWidth: 0, borderRadius: 0, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'b-position', type: 'text', field: 'position', x: 26, y: 44, width: 200, height: 14, fontFamily: 'Montserrat', fontSize: 8.5, fontWeight: 500, fontColor: '#2D2A26', textAlign: 'left', letterSpacing: 0, textTransform: 'none', fontStyle: 'normal', lineHeight: 1.3, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'b-area', type: 'text', field: 'area', x: 26, y: 62, width: 200, height: 14, fontFamily: 'Montserrat', fontSize: 8.5, fontWeight: 500, fontColor: '#2D2A26', textAlign: 'left', letterSpacing: 0, textTransform: 'none', fontStyle: 'normal', lineHeight: 1.3, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'b-bloodType', type: 'text', field: 'bloodType', x: 26, y: 80, width: 200, height: 14, fontFamily: 'Montserrat', fontSize: 8.5, fontWeight: 500, fontColor: '#2D2A26', textAlign: 'left', letterSpacing: 0, textTransform: 'none', fontStyle: 'normal', lineHeight: 1.3, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'b-eps', type: 'text', field: 'eps', x: 26, y: 98, width: 200, height: 14, fontFamily: 'Montserrat', fontSize: 8.5, fontWeight: 500, fontColor: '#2D2A26', textAlign: 'left', letterSpacing: 0, textTransform: 'none', fontStyle: 'normal', lineHeight: 1.3, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'b-validUntil', type: 'text', field: 'validUntil', x: 26, y: 116, width: 200, height: 14, fontFamily: 'Montserrat', fontSize: 8.5, fontWeight: 500, fontColor: '#A88B52', textAlign: 'left', letterSpacing: 0, textTransform: 'none', fontStyle: 'normal', lineHeight: 1.3, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'b-qr', type: 'qr', x: 112, y: 160, width: 80, height: 80, borderColor: '#C9A96E', borderWidth: 1.5, fgColor: '#2D2A26', bgColor: '#ffffff', labelText: 'Escanea para verificar', labelFontSize: 5, labelColor: '#8A8279', rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'b-emergencyBox', type: 'shape', shapeType: 'rect', x: 20, y: 280, width: 280, height: 56, fillColor: 'rgba(201,169,110,0.06)', borderColor: 'rgba(201,169,110,0.12)', borderWidth: 1, borderRadius: 6, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false },
      { id: 'b-emergencyTitle', type: 'text', text: 'CONTACTO DE EMERGENCIA', x: 30, y: 288, width: 260, height: 10, fontFamily: 'Montserrat', fontSize: 6, fontWeight: 700, fontColor: '#A88B52', textAlign: 'left', letterSpacing: 1.5, textTransform: 'none', fontStyle: 'normal', lineHeight: 1.2, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false, field: 'custom' },
      { id: 'b-emergencyContact', type: 'text', field: 'emergencyContact', x: 30, y: 302, width: 260, height: 12, fontFamily: 'Montserrat', fontSize: 8, fontWeight: 500, fontColor: '#2D2A26', textAlign: 'left', letterSpacing: 0, textTransform: 'none', fontStyle: 'normal', lineHeight: 1.2, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
      { id: 'b-emergencyPhone', type: 'text', field: 'emergencyPhone', x: 30, y: 316, width: 260, height: 12, fontFamily: 'Montserrat', fontSize: 7.5, fontWeight: 400, fontColor: '#5C564E', textAlign: 'left', letterSpacing: 0, textTransform: 'none', fontStyle: 'normal', lineHeight: 1.2, rotation: 0, opacity: 1, zIndex: 2, visible: true, locked: false },
    ],
  };
}
