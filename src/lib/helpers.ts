/**
 * helpers.ts
 * Funciones puras de formateo, colores y utilidades generales.
 * Extraídas de page.tsx para modularización.
 */

/**
 * Formatea un número como moneda COP (pesos colombianos).
 */
export const fmtCOP = (n: number): string => {
  if (!n || n === 0) return '$0';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return '$' + Number(n).toLocaleString('es-CO');
};

/**
 * Formatea un timestamp de Firebase o Date a fecha legible en español.
 */
export const fmtDate = (ts: any): string => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * Formatea un timestamp a fecha y hora completas.
 */
export const fmtDateTime = (ts: any): string => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/**
 * Formatea bytes a unidad legible (B, KB, MB).
 */
export const fmtSize = (b: number): string => {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
};

/**
 * Obtiene las iniciales de un nombre (máx 2 caracteres).
 */
export const getInitials = (n: string): string =>
  n ? n.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase() : '?';

/**
 * Clases CSS para el badge de estado de proyecto.
 */
export const statusColor = (s: string): string =>
  ({
    Concepto: 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]',
    Diseno: 'bg-blue-500/10 text-blue-400',
    Ejecucion: 'bg-amber-500/10 text-amber-400',
    Terminado: 'bg-emerald-500/10 text-emerald-400',
  }[s] || 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]');

/**
 * Clases CSS para el badge de prioridad de tarea.
 */
export const prioColor = (p: string): string =>
  ({
    Alta: 'bg-red-500/10 text-red-400',
    Media: 'bg-amber-500/10 text-amber-400',
    Baja: 'bg-emerald-500/10 text-emerald-400',
  }[p] || 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]');

/**
 * Clases CSS para el badge de estado de tarea.
 */
export const taskStColor = (s: string): string =>
  ({
    'Por hacer': 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]',
    'En progreso': 'bg-blue-500/10 text-blue-400',
    Revision: 'bg-amber-500/10 text-amber-400',
    Completado: 'bg-emerald-500/10 text-emerald-400',
  }[s] || 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]');

/** Paleta de colores para avatares */
const AVATAR_COLORS = [
  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'bg-purple-500/15 text-purple-400 border-purple-500/30',
  'bg-amber-500/15 text-amber-400 border-amber-500/30',
];

/**
 * Asigna un color de avatar consistente basado en un ID.
 */
export const avatarColor = (id: string): string => {
  let h = 0;
  for (let i = 0; i < (id || '').length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

/**
 * Formatea segundos a mm:ss (para grabación de voz).
 */
export const fmtRecTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

/**
 * Formatea minutos a representación legible: "Xh Ym" o "Ym".
 */
export const fmtDuration = (minutes: number): string => {
  if (!minutes || minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

/**
 * Formatea milisegundos a "HH:MM:SS" para cronómetro en vivo.
 */
export const fmtTimer = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

/**
 * Obtiene la fecha de inicio de la semana (lunes).
 */
export const getWeekStart = (date: Date = new Date()): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Convierte un archivo a Base64 (para subir imágenes/documentos).
 */
export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });

/**
 * Detecta la plataforma actual para guías de instalación PWA.
 */
export const getPlatform = (): string => {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
};

/**
 * Genera un ID único corto para notificaciones.
 */
export const uniqueId = (prefix = 'id'): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Elimina recursivamente todos los valores undefined de un objeto antes de enviar a Firestore.
 * Centralizado para evitar duplicación (antes estaba en 4 archivos).
 */
export const scrubUndefined = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => scrubUndefined(item));
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = scrubUndefined(value);
    }
  }
  return cleaned;
};
