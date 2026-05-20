/**
 * error-reporting-service.ts
 * Reporta errores de UI capturados por ErrorBoundary a Firestore.
 * Se almacena en la colección `error_reports`.
 */

import { getFirebase } from '@/lib/firebase-service';
import { isFlagEnabled } from '@/lib/feature-flags';

export interface ErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  screen?: string;
  userAgent?: string;
  userId?: string;
  timestamp?: any;
}

const COLLECTION = 'error_reports';

export async function reportError(report: ErrorReport): Promise<void> {
  if (!isFlagEnabled('error_reporting')) return;

  try {
    const app = getFirebase();
    if (!app) return;

    const db = app.firestore();
    await db.collection(COLLECTION).add({
      ...report,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      timestamp: new Date(),
    });
  } catch {
    // Error reporting must never crash the app
    console.error('[ErrorReporting] Failed to report error to Firestore');
  }
}
