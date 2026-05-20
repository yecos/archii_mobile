/**
 * offline-queue.ts
 * Offline-first support for Archii.
 *
 * Cuando el usuario está sin conexión, las operaciones de escritura
 * se encolan en IndexedDB y se sincronizan automáticamente al
 * reconectar.
 *
 * Usa la librería `idb` (wrapper promisificado de IndexedDB).
 */

import { openDB, type IDBPDatabase } from 'idb';

/* ---- Types ---- */

interface OfflineQueueItem {
  id?: number;
  /** Colección de Firestore (ej: 'tasks', 'projects') */
  collection: string;
  /** ID del documento (para update/delete), vacío para add */
  docId?: string;
  /** Tipo de operación */
  action: 'add' | 'set' | 'update' | 'delete';
  /** Datos a escribir */
  data: Record<string, any>;
  /** tenantId para validar aislamiento */
  tenantId: string;
  /** UID del usuario que originó la operación */
  userId: string;
  /** Timestamp de cuando se encoló */
  enqueuedAt: number;
  /** Número de reintentos fallidos */
  retryCount: number;
}

interface OfflineDBSchema {
  queue: {
    key: number;
    value: OfflineQueueItem;
    indexes: {
      'by-collection': string;
      'by-tenant': string;
    };
  };
  meta: {
    key: string;
    value: {
      id: string;
      value: any;
    };
  };
}

/* ---- DB Singleton ---- */

let dbPromise: Promise<IDBPDatabase<OfflineDBSchema>> | null = null;

function getDB(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>('archii-offline', 1, {
      upgrade(db) {
        const store = db.createObjectStore('queue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('by-collection', 'collection');
        store.createIndex('by-tenant', 'tenantId');
      },
    });
  }
  return dbPromise;
}

/* ---- Queue Operations ---- */

/**
 * Encola una operación para sincronizar después.
 * Se usa cuando navigator.onLine === false.
 */
export async function enqueueOfflineWrite(params: {
  collection: string;
  docId?: string;
  action: OfflineQueueItem['action'];
  data: Record<string, any>;
  tenantId: string;
  userId: string;
}): Promise<number> {
  const db = await getDB();
  const id = await db.add('queue', {
    collection: params.collection,
    docId: params.docId,
    action: params.action,
    data: params.data,
    tenantId: params.tenantId,
    userId: params.userId,
    enqueuedAt: Date.now(),
    retryCount: 0,
  });
  return id as number;
}

/**
 * Lee todos los items pendientes de la cola, ordenados por fecha.
 */
export async function getPendingQueue(): Promise<OfflineQueueItem[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex('queue', 'by-tenant', IDBKeyRange.only('__all__'));
  // getAllFromIndex with that range won't work, use getAll instead
  const all = await db.getAll('queue');
  return all.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
}

/**
 * Obtiene el conteo de items pendientes.
 */
export async function getQueueCount(): Promise<number> {
  const db = await getDB();
  return db.count('queue');
}

/**
 * Elimina un item de la cola (después de sincronizar exitosamente).
 */
export async function dequeueItem(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('queue', id);
}

/**
 * Incrementa el retryCount de un item fallido.
 * Si supera MAX_RETRIES, lo elimina.
 */
export async function markItemFailed(id: number): Promise<void> {
  const db = await getDB();
  const item = await db.get('queue', id);
  if (!item) return;
  item.retryCount++;
  if (item.retryCount >= 5) {
    console.warn(`[Offline] Item ${id} descartado después de 5 reintentos`);
    await db.delete('queue', id);
  } else {
    await db.put('queue', item);
  }
}

/* ---- Sync Engine ---- */

const MAX_RETRIES = 5;

/**
 * Procesa toda la cola pendiente contra Firestore.
 * Se ejecuta automáticamente cuando el navegador reconecta.
 */
export async function syncOfflineQueue(): Promise<{
  synced: number;
  failed: number;
  skipped: number;
}> {
  const result = { synced: 0, failed: 0, skipped: 0 };

  if (typeof window === 'undefined') return result;

  const { getFirebase } = await import('./firebase-service');
  let fb: any;
  try {
    fb = getFirebase();
  } catch {
    console.warn('[Offline] Firebase no disponible para sync');
    return result;
  }

  const db = fb.firestore();
  const auth = fb.auth();
  const user = auth.currentUser;
  const serverTimestamp = fb.firestore.FieldValue.serverTimestamp;

  if (!user) {
    console.warn('[Offline] No hay usuario autenticado para sync');
    return result;
  }

  const queue = await getPendingQueue();
  if (queue.length === 0) return result;

  for (const item of queue) {
    try {
      // Validar que el usuario y tenant coincidan
      if (item.userId !== user.uid) {
        result.skipped++;
        await dequeueItem(item.id!);
        continue;
      }

      // Validar que tenantId exista (segregación)
      if (!item.tenantId) {
        result.skipped++;
        await dequeueItem(item.id!);
        continue;
      }

      // Use top-level collection paths (tasks, projects, etc.)
      // NOT nested under tenants/ — the data model uses tenantId field, not nested paths
      const collectionPath = item.collection.startsWith('tenants/')
        ? item.collection
        : item.collection;

      switch (item.action) {
        case 'add':
          await db.collection(collectionPath).add({
            ...item.data,
            _syncedFrom: 'offline',
            _syncedAt: serverTimestamp(),
          });
          break;
        case 'set':
          await db.collection(collectionPath).doc(item.docId).set({
            ...item.data,
            _syncedFrom: 'offline',
            _syncedAt: serverTimestamp(),
          });
          break;
        case 'update':
          await db.collection(collectionPath).doc(item.docId).update({
            ...item.data,
            _syncedFrom: 'offline',
            _syncedAt: serverTimestamp(),
          });
          break;
        case 'delete':
          await db.collection(collectionPath).doc(item.docId).delete();
          break;
      }

      result.synced++;
      await dequeueItem(item.id!);
    } catch (err) {
      console.error(`[Offline] Error sincronizando item ${item.id}:`, err);
      result.failed++;
      await markItemFailed(item.id!);
    }
  }

  return result;
}

/**
 * Limpia toda la cola (para debugging o cuando el usuario lo solicita).
 */
export async function clearOfflineQueue(): Promise<void> {
  const db = await getDB();
  await db.clear('queue');
}

/* ---- Online/Offline Detection Hook ---- */

type StatusListener = (online: boolean) => void;
const listeners = new Set<StatusListener>();

/**
 * Registra un listener para cambios de conectividad.
 * Retorna una función de cleanup.
 */
export function onConnectivityChange(listener: StatusListener): () => void {
  listeners.add(listener);
  // Emitir estado actual inmediatamente
  if (typeof window !== 'undefined') {
    listener(navigator.onLine);
  }
  return () => listeners.delete(listener);
}

/**
 * Inicializa los listeners de online/offline.
 * Llama a syncOfflineQueue() automáticamente al reconectar.
 */
export function initOfflineSync(): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = async () => {
    listeners.forEach((fn) => fn(true));
    try {
      const result = await syncOfflineQueue();
      if (result.synced > 0) {
        // Dispatch custom event para que la UI pueda reaccionar
        window.dispatchEvent(
          new CustomEvent('archii:offline-sync', {
            detail: result,
          })
        );
      }
    } catch (err) {
      console.error('[Offline] Error en sync automático:', err);
    }
  };

  const handleOffline = () => {
    listeners.forEach((fn) => fn(false));
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Limpiar listeners al desmontar
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Devuelve true si el navegador está offline.
 */
export function isOffline(): boolean {
  if (typeof window === 'undefined') return false;
  return !navigator.onLine;
}
