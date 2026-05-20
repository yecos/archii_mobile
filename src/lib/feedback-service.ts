/**
 * feedback-service.ts
 * Servicio de feedback para usuarios beta.
 * Guarda feedback en la colección `beta_feedback` de Firestore.
 * Sin datos personales — solo categoría, rating y texto.
 */

import { getFirebase } from '@/lib/firebase-service';

export type FeedbackCategory = 'bug' | 'feature' | 'ux' | 'performance' | 'other';

export interface FeedbackEntry {
  category: FeedbackCategory;
  rating: number;        // 1-5 estrellas
  text: string;
  screen?: string;       // pantalla donde se reportó
  userAgent?: string;
  timestamp?: any;
}

const COLLECTION = 'beta_feedback';

export async function submitFeedback(entry: FeedbackEntry): Promise<string> {
  const app = getFirebase();
  if (!app) throw new Error('Firebase not initialized');

  const db = app.firestore();
  const doc = await db.collection(COLLECTION).add({
    ...entry,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
    timestamp: new Date(),
  });

  return doc.id;
}

export const FEEDBACK_CATEGORIES: { value: FeedbackCategory; label: string; icon: string }[] = [
  { value: 'bug', label: 'Error / Bug', icon: '🐛' },
  { value: 'feature', label: 'Sugerencia', icon: '💡' },
  { value: 'ux', label: 'UX / Diseño', icon: '🎨' },
  { value: 'performance', label: 'Rendimiento', icon: '⚡' },
  { value: 'other', label: 'Otro', icon: '💬' },
];
