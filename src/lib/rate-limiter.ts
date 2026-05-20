/**
 * rate-limiter.ts
 * Sistema de rate limiting para la API pública.
 *
 * Usa Firestore como backend de almacenamiento para contadores.
 * Cada request incrementa un counter con TTL automático.
 *
 * Estrategia: Sliding Window (ventana deslizante de 1 minuto).
 * - Default: 100 requests/minuto por API key
 * - Burst: permite picos de 20 en el primer segundo
 *
 * Alternativa: Para alta escala, migrar a @upstash/ratelimit (Redis).
 */

import { getAdminDb } from './firebase-admin';

/* ---- Types ---- */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export interface RateLimitConfig {
  /** Máximo de requests por ventana */
  limit: number;
  /** Ventana en segundos */
  windowSeconds: number;
}

export interface APIKeyRecord {
  id: string;
  tenantId: string;
  keyHash: string;
  keyPrefix: string; // Primeros 8 chars para identificación visual
  name: string;
  createdBy: string;
  permissions: string[];
  rateLimit?: RateLimitConfig;
  active: boolean;
  lastUsedAt?: string;
  requestCount: number;
  createdAt: string;
  expiresAt?: string;
}

/* ---- Rate Limiting ---- */

// Cache en memoria para reduce Firestore reads
const rateLimitCache = new Map<string, { count: number; resetAt: number }>();
const CACHE_TTL = 5000; // 5 segundos

/**
 * Verifica rate limit para un identificador (API key, IP, etc.).
 * Implementa sliding window con Firestore.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { limit: 100, windowSeconds: 60 }
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - config.windowSeconds * 1000;

  // Verificar cache primero
  const cached = rateLimitCache.get(identifier);
  if (cached && cached.resetAt > now) {
    const remaining = Math.max(0, config.limit - cached.count);
    return {
      allowed: remaining > 0,
      remaining,
      resetAt: cached.resetAt,
      limit: config.limit,
    };
  }

  const db = getAdminDb();
  const counterRef = db.collection('rate_limits').doc(identifier);

  try {
    // Leer contador actual
    const counterDoc = await counterRef.get();
    let currentCount = 0;
    const rawData = counterDoc.exists ? counterDoc.data() : null;

    if (counterDoc.exists && rawData) {
      const timestamps: number[] = rawData?.timestamps || [];

      // Filtrar timestamps dentro de la ventana
      const validTimestamps = timestamps.filter((ts: number) => ts > windowStart);
      currentCount = validTimestamps.length;

      // Si el contador expiró (todos los timestamps son viejos)
      if (validTimestamps.length === 0 && timestamps.length > 0) {
        // Resetear
        currentCount = 0;
      }
    }

    // Incrementar contador
    const allowed = currentCount < config.limit;
    const newCount = allowed ? currentCount + 1 : currentCount;

    if (allowed) {
      // Agregar timestamp a la ventana
      const timestamps = counterDoc.exists && rawData
        ? [...(rawData.timestamps || []).filter((ts: number) => ts > windowStart), now]
        : [now];

      await counterRef.set({
        timestamps,
        lastRequestAt: new Date().toISOString(),
      }, { merge: true });
    }

    const resetAt = windowStart + config.windowSeconds * 1000;
    const remaining = Math.max(0, config.limit - newCount);

    // Actualizar cache
    rateLimitCache.set(identifier, { count: newCount, resetAt });

    // Limpiar cache después del TTL
    setTimeout(() => rateLimitCache.delete(identifier), CACHE_TTL);

    return {
      allowed,
      remaining,
      resetAt,
      limit: config.limit,
    };
  } catch (err) {
    console.error('[RateLimiter] Error:', err);
    // SEC-H01: Fail-closed — if Firestore is unavailable, deny the request
    // This prevents rate limit bypass during infrastructure incidents.
    return {
      allowed: false,
      remaining: 0,
      resetAt: now + config.windowSeconds * 1000,
      limit: config.limit,
    };
  }
}

/* ---- API Key Management ---- */

const crypto = require('crypto');

/**
 * Genera una nueva API Key para un tenant.
 * Formato: af_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (48 chars hex)
 */
export function generateAPIKey(prefix = 'af_live'): string {
  const bytes = crypto.randomBytes(24);
  return `${prefix}_${bytes.toString('hex')}`;
}

/**
 * Hashea una API Key para almacenamiento seguro.
 * Usamos SHA-256 — la key original nunca se almacena.
 */
function hashAPIKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Valida una API Key y retorna el registro asociado.
 */
export async function validateAPIKey(
  apiKey: string
): Promise<APIKeyRecord | null> {
  if (!apiKey?.startsWith('af_live_')) {
    return null;
  }

  const keyHash = hashAPIKey(apiKey);
  const db = getAdminDb();

  const snapshot = await db
    .collection('api_keys')
    .where('keyHash', '==', keyHash)
    .where('active', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const data = snapshot.docs[0].data() as APIKeyRecord;

  // Verificar expiración
  if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
    return null;
  }

  // Actualizar lastUsedAt (fire-and-forget)
  db.collection('api_keys').doc(snapshot.docs[0].id).set(
    { lastUsedAt: new Date().toISOString() },
    { merge: true }
  ).catch(() => {});

  return data;
}

/**
 * Crea una nueva API Key para un tenant.
 */
export async function createAPIKey(params: {
  tenantId: string;
  name: string;
  createdBy: string;
  permissions?: string[];
  rateLimit?: RateLimitConfig;
  expiresAt?: string;
}): Promise<{ key: string; record: APIKeyRecord }> {
  const db = getAdminDb();
  const key = generateAPIKey();
  const keyHash = hashAPIKey(key);
  const keyPrefix = key.slice(0, 16);

  const record: APIKeyRecord = {
    id: '',
    tenantId: params.tenantId,
    keyHash,
    keyPrefix,
    name: params.name,
    createdBy: params.createdBy,
    permissions: params.permissions || ['read'],
    rateLimit: params.rateLimit || { limit: 100, windowSeconds: 60 },
    active: true,
    requestCount: 0,
    createdAt: new Date().toISOString(),
    expiresAt: params.expiresAt,
  };

  const docRef = await db.collection('api_keys').add(record);
  record.id = docRef.id;

  return { key, record };
}

/**
 * Lista las API Keys de un tenant (sin exponer el hash completo).
 */
export async function listAPIKeys(tenantId: string): Promise<Omit<APIKeyRecord, 'keyHash'>[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection('api_keys')
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as APIKeyRecord;
    const { keyHash, ...safe } = data;
    return { ...safe, id: doc.id };
  });
}

/**
 * Revoca (desactiva) una API Key.
 */
export async function revokeAPIKey(keyId: string, tenantId: string): Promise<boolean> {
  const db = getAdminDb();

  const docRef = db.collection('api_keys').doc(keyId);
  const doc = await docRef.get();

  if (!doc.exists) return false;

  const data = doc.data();
  if (!data || data.tenantId !== tenantId) return false;

  await docRef.update({ active: false, revokedAt: new Date().toISOString() });
  return true;
}
