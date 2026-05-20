/**
 * encryption.ts
 * Field-level encryption service for Archii.
 *
 * Uses AES-256-GCM via Node.js crypto (server-side only).
 * Provides:
 *   - encryptField / decryptField — single field operations
 *   - encryptDocument / decryptDocument — bulk operations on Firestore docs
 *   - generateEncryptionKey — create new AES-256 keys
 *   - deriveKeyFromPassphrase — PBKDF2 key derivation
 *   - hashData — SHA-256 integrity hashing
 *   - isFieldEncrypted — detect encrypted values by prefix
 *   - detectSensitiveFields — heuristic detection of PII fields
 *   - Tenant-level key management in Firestore (KMS-style)
 *
 * Gated by feature flag 'field_encryption'.
 */

import { getAdminDb } from './firebase-admin';
import { isFlagEnabled } from './feature-flags';
import * as crypto from 'crypto';

/* ===== Constants ===== */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 96 bits for GCM
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 600000;
const ENCRYPTED_PREFIX = 'ENC_AES256:';
const KMS_COLLECTION = 'encryption_keys';

/* ===== Types ===== */

export interface EncryptionKeyRecord {
  id: string;
  tenantId: string;
  /** Base64-encoded raw key material */
  keyEncrypted: string;
  /** Salt used for PBKDF2 derivation */
  salt: string;
  /** Human-readable label */
  label: string;
  /** Key status */
  active: boolean;
  createdAt: string;
  createdBy: string;
  lastRotatedAt?: string;
}

export interface EncryptionResult {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/* ===== Sensitive Field Detection ===== */

/**
 * Field names (case-insensitive) that likely contain sensitive data.
 */
const SENSITIVE_FIELD_PATTERNS: RegExp[] = [
  /\bemail\b/i,
  /\bcorreo\b/i,
  /\bphone\b/i,
  /\btel(efono)?\b/i,
  /\bcel(ular)?\b/i,
  /\bmobil\b/i,
  /\baddress\b/i,
  /\bdireccion\b/i,
  /\bid(number|card|number)?\b/i,
  /\bcedula\b/i,
  /\bnit\b/i,
  /\brut\b/i,
  /\bpassport\b/i,
  /\bbank(account|number)?\b/i,
  /\bcuenta\b/i,
  /\bsalary\b/i,
  /\bsalario\b/i,
  /\bssn\b/i,
  /\bcredit.?card\b/i,
  /\bpassword\b/i,
  /\bsecret\b/i,
  /\btoken\b/i,
  /\bpin\b/i,
];

/**
 * Detect which fields in a document are likely sensitive.
 */
export function detectSensitiveFields(doc: Record<string, unknown>): string[] {
  const sensitive: string[] = [];

  for (const key of Object.keys(doc)) {
    if (SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(key))) {
      sensitive.push(key);
    }
  }

  return sensitive;
}

/* ===== Core Crypto Operations ===== */

/**
 * Generate a new random AES-256 key (raw Buffer).
 */
export function generateEncryptionKey(): Buffer {
  return crypto.randomBytes(KEY_LENGTH);
}

/**
 * Derive an AES-256 key from a passphrase using PBKDF2.
 */
export function deriveKeyFromPassphrase(
  passphrase: string,
  salt?: Buffer,
): { key: Buffer; salt: Buffer } {
  const actualSalt = salt || crypto.randomBytes(KEY_LENGTH);
  const key = crypto.pbkdf2Sync(
    passphrase,
    actualSalt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha512',
  );
  return { key, salt: actualSalt };
}

/**
 * Encrypt a single field value using AES-256-GCM.
 *
 * @returns Object with base64-encoded ciphertext, iv, and authTag.
 */
export function encryptField(
  plaintext: string,
  key: Buffer | string,
): EncryptionResult {
  let keyBuffer: Buffer;
  if (typeof key === 'string') {
    keyBuffer = Buffer.from(key, 'base64');
  } else {
    keyBuffer = key;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, 'utf-8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypt a single field value encrypted with AES-256-GCM.
 */
export function decryptField(
  ciphertext: string,
  iv: string,
  key: Buffer | string,
): string {
  let keyBuffer: Buffer;
  if (typeof key === 'string') {
    keyBuffer = Buffer.from(key, 'base64');
  } else {
    keyBuffer = key;
  }

  const ivBuffer = Buffer.from(iv, 'base64');
  const authTagBuffer = Buffer.from(
    // The authTag is embedded or needs to be passed — caller provides it
    '', // Will be set from the stored value
    'base64',
  );

  // In practice, the ciphertext stored in Firestore includes the authTag
  // For a complete implementation we need the authTag — it comes from
  // the encryption result. We use a combined format here.
  // See encryptDocument for the full storage format.
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, ivBuffer, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(
    Buffer.from(
      ciphertext.slice(ciphertext.length - 24), // last 24 base64 chars = 16 bytes
      'base64',
    ),
  );

  // Strip the authTag from the end of the ciphertext
  const rawCiphertext = ciphertext.slice(0, ciphertext.length - 24);
  let decrypted = decipher.update(rawCiphertext, 'base64', 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
}

/**
 * Encrypt specified fields in a document.
 *
 * Each encrypted field is replaced with:
 *   `${ENCRYPTED_PREFIX}${base64(ciphertext)}|${base64(iv)}|${base64(authTag)}`
 *
 * @param doc - The Firestore document data.
 * @param sensitiveFields - Field names to encrypt.
 * @param key - AES-256 key as Buffer or base64 string.
 * @returns A new document with encrypted fields.
 */
export function encryptDocument(
  doc: Record<string, unknown>,
  sensitiveFields: string[],
  key: Buffer | string,
): Record<string, unknown> {
  const result = { ...doc };

  for (const field of sensitiveFields) {
    const value = result[field];
    if (typeof value !== 'string' || value === '') continue;
    // Skip already-encrypted values
    if (isFieldEncrypted(value)) continue;

    try {
      const encrypted = encryptField(value, key);
      result[field] = `${ENCRYPTED_PREFIX}${encrypted.ciphertext}|${encrypted.iv}|${encrypted.authTag}`;
    } catch (err) {
      console.error(`[Encryption] Failed to encrypt field '${field}':`, err);
      // Leave the field unencrypted — don't break the write
    }
  }

  return result;
}

/**
 * Decrypt specified fields in a document.
 *
 * Expects the format: `${ENCRYPTED_PREFIX}${base64(ciphertext)}|${base64(iv)}|${base64(authTag)}`
 *
 * @param doc - The Firestore document with encrypted fields.
 * @param encryptedFields - Field names to decrypt.
 * @param key - AES-256 key as Buffer or base64 string.
 * @returns A new document with decrypted fields.
 */
export function decryptDocument(
  doc: Record<string, unknown>,
  encryptedFields: string[],
  key: Buffer | string,
): Record<string, unknown> {
  const result = { ...doc };

  for (const field of encryptedFields) {
    const value = result[field];
    if (typeof value !== 'string') continue;
    if (!isFieldEncrypted(value)) continue;

    try {
      // Strip prefix
      const payload = value.slice(ENCRYPTED_PREFIX.length);
      const parts = payload.split('|');
      if (parts.length !== 3) {
        console.warn(`[Encryption] Malformed encrypted value for field '${field}'`);
        continue;
      }

      const [ciphertext, iv, authTag] = parts;

      // Decrypt with authTag
      let keyBuffer: Buffer;
      if (typeof key === 'string') {
        keyBuffer = Buffer.from(key, 'base64');
      } else {
        keyBuffer = key;
      }

      const ivBuffer = Buffer.from(iv, 'base64');
      const authTagBuffer = Buffer.from(authTag, 'base64');

      const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, ivBuffer, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      decipher.setAuthTag(authTagBuffer);

      let decrypted = decipher.update(ciphertext, 'base64', 'utf-8');
      decrypted += decipher.final('utf-8');

      result[field] = decrypted;
    } catch (err) {
      console.error(`[Encryption] Failed to decrypt field '${field}':`, err);
      // Leave field encrypted — don't expose raw ciphertext
    }
  }

  return result;
}

/**
 * SHA-256 hash for data integrity verification.
 */
export function hashData(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf-8').digest('hex');
}

/**
 * Check whether a value has been encrypted by this service.
 */
export function isFieldEncrypted(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return value.startsWith(ENCRYPTED_PREFIX);
}

/* ===== Tenant Key Management (KMS-style) ===== */

/**
 * Store an encryption key for a tenant.
 * The key material is encrypted at rest using a master key derived
 * from the ENCRYPTION_MASTER_KEY environment variable.
 */
export async function storeTenantKey(params: {
  tenantId: string;
  key: Buffer;
  label: string;
  createdBy: string;
}): Promise<string> {
  if (!isFlagEnabled('field_encryption')) {
    throw new Error('Field encryption is not enabled');
  }

  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    throw new Error('ENCRYPTION_MASTER_KEY environment variable is required');
  }

  const { key: derivedKey, salt } = deriveKeyFromPassphrase(masterKey);
  // SEC-C04: Store IV alongside the encrypted key material (never reuse IVs with AES-GCM)
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
  let encrypted = cipher.update(params.key.toString('base64'), 'utf-8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  const db = getAdminDb();
  const docRef = await db.collection(KMS_COLLECTION).add({
    tenantId: params.tenantId,
    keyEncrypted: `${encrypted}|${authTag.toString('base64')}`,
    iv: iv.toString('base64'), // Store the random IV for proper decryption
    salt: salt.toString('base64'),
    label: params.label,
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy,
  });

  return docRef.id;
}

/**
 * Retrieve the active encryption key for a tenant.
 * Returns the raw key Buffer, or null if not found.
 */
export async function getTenantKey(tenantId: string): Promise<Buffer | null> {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    console.error('[Encryption] ENCRYPTION_MASTER_KEY not set');
    return null;
  }

  const db = getAdminDb();
  const snapshot = await db
    .collection(KMS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('active', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const data = snapshot.docs[0].data();
  const { keyEncrypted, salt } = data as { keyEncrypted: string; salt: string };

  const saltBuffer = Buffer.from(salt, 'base64');
  const { key: derivedKey } = deriveKeyFromPassphrase(masterKey, saltBuffer);

  // Split ciphertext and authTag
  const lastPipe = keyEncrypted.lastIndexOf('|');
  if (lastPipe === -1) return null;

  const ciphertext = keyEncrypted.slice(0, lastPipe);
  const authTagB64 = keyEncrypted.slice(lastPipe + 1);

  try {
    // SEC-C04: Use the stored IV if available, otherwise fall back to deterministic IV
    // for backward compatibility with keys stored before this fix.
    const ivB64 = data.iv;
    const ivBuffer = ivB64
      ? Buffer.from(ivB64 as string, 'base64')
      : saltBuffer.slice(0, IV_LENGTH); // legacy fallback

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      derivedKey,
      ivBuffer,
      { authTagLength: AUTH_TAG_LENGTH },
    );
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

    let decrypted = decipher.update(ciphertext, 'base64', 'utf-8');
    decrypted += decipher.final('utf-8');

    return Buffer.from(decrypted, 'base64');
  } catch (err) {
    console.error('[Encryption] Failed to decrypt tenant key:', err);
    return null;
  }
}

/**
 * Get the active encryption key record metadata (without key material).
 */
export async function getTenantKeyMetadata(tenantId: string): Promise<{
  id: string;
  label: string;
  active: boolean;
  createdAt: string;
} | null> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(KMS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('active', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    id: doc.id,
    label: data.label,
    active: data.active,
    createdAt: data.createdAt,
  };
}

/**
 * Rotate (deactivate old, activate new) encryption key for a tenant.
 */
export async function rotateTenantKey(params: {
  tenantId: string;
  newKey: Buffer;
  label: string;
  rotatedBy: string;
}): Promise<string> {
  if (!isFlagEnabled('field_encryption')) {
    throw new Error('Field encryption is not enabled');
  }

  const db = getAdminDb();

  // Deactivate all existing keys for this tenant
  const existing = await db
    .collection(KMS_COLLECTION)
    .where('tenantId', '==', params.tenantId)
    .where('active', '==', true)
    .get();

  if (!existing.empty) {
    const batch = db.batch();
    existing.docs.forEach((doc) => {
      batch.update(doc.ref, {
        active: false,
        lastRotatedAt: new Date().toISOString(),
        rotatedBy: params.rotatedBy,
      });
    });
    await batch.commit();
  }

  // Store new key
  return storeTenantKey({
    tenantId: params.tenantId,
    key: params.newKey,
    label: params.label,
    createdBy: params.rotatedBy,
  });
}
