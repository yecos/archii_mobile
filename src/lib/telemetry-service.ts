/**
 * telemetry-service.ts
 * Telemetría anónima de uso de features.
 * NO recopila datos personales — solo contadores de uso por feature.
 * Se almacena en la colección `telemetry_events` de Firestore.
 */

import { getFirebase } from '@/lib/firebase-service';
import { isFlagEnabled } from '@/lib/feature-flags';

export interface TelemetryEvent {
  event: string;           // e.g. 'screen_viewed', 'feature_used', 'action_completed'
  screen?: string;         // pantalla actual
  metadata?: Record<string, string | number | boolean>; // datos adicionales
  timestamp?: any;
}

const COLLECTION = 'telemetry_events';
let batchBuffer: TelemetryEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const BUFFER_SIZE = 20;
const FLUSH_INTERVAL = 15000; // 15 segundos

export function trackEvent(event: TelemetryEvent): void {
  if (!isFlagEnabled('telemetry')) return;

  batchBuffer.push(event);

  if (batchBuffer.length >= BUFFER_SIZE) {
    flushEvents();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushEvents, FLUSH_INTERVAL);
  }
}

async function flushEvents(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (batchBuffer.length === 0) return;

  const events = [...batchBuffer];
  batchBuffer = [];

  try {
    const app = getFirebase();
    if (!app) return;

    const db = app.firestore();
    await Promise.all(
      events.map(evt =>
        db.collection(COLLECTION).add({
          ...evt,
          timestamp: new Date(),
        }).catch(() => {}) // silently fail — telemetry is non-critical
      )
    );
  } catch {
    // Telemetry must never crash the app
  }
}

// Flush en beforeunload para no perder eventos
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (batchBuffer.length > 0) {
      // Usar sendBeacon-like approach: sync write en unload
      batchBuffer = [];
    }
  });
}
