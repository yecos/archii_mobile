/**
 * token-encryption.ts
 *
 * Server-side AES-256-GCM encryption for Microsoft tokens stored in Firestore.
 *
 * Tokens (access_token, refresh_token) are encrypted before storage and
 * decrypted when needed for Graph API calls. This prevents plaintext
 * token exposure in the database.
 *
 * Uses a single master key from env: TOKEN_ENCRYPTION_KEY (32-byte hex).
 * If no key is set, tokens pass through unencrypted (backward compatible).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// ── Key Management ──

let _cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer | null {
  if (_cachedKey) return _cachedKey;

  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) return null;

  // Validate: must be 64 hex chars = 32 bytes = 256 bits
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    console.error('[TokenEncryption] TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Encryption disabled.');
    return null;
  }

  _cachedKey = Buffer.from(keyHex, 'hex');
  return _cachedKey;
}

/**
 * Check if token encryption is available (TOKEN_ENCRYPTION_KEY is set and valid).
 */
export function isEncryptionEnabled(): boolean {
  return getEncryptionKey() !== null;
}

// ── Encryption Format ──
//
// Encrypted value stored in Firestore as a JSON string:
// {
//   "enc": "<hex ciphertext>",
//   "iv": "<hex iv>",
//   "tag": "<hex auth tag>",
//   "v": 1
// }
//
// The version field `v` allows future algorithm migration.

const ALGORITHM = 'aes-256-gcm';
const CURRENT_VERSION = 1;

interface EncryptedToken {
  enc: string;
  iv: string;
  tag: string;
  v: number;
}

// ── Public API ──

/**
 * Encrypt a token string for Firestore storage.
 * Returns a JSON string that should be stored as-is.
 * If encryption is not configured, returns the plaintext token (backward compatible).
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    // SEC-M01: In production, fail loudly if encryption key is not set
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[TokenEncryption] TOKEN_ENCRYPTION_KEY not set in production! Tokens MUST be encrypted.');
    }
    console.warn('[TokenEncryption] TOKEN_ENCRYPTION_KEY not set — tokens stored unencrypted (development only)');
    return plaintext;
  }

  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const tag = cipher.getAuthTag();

  const encrypted: EncryptedToken = {
    enc: ciphertext,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    v: CURRENT_VERSION,
  };

  return JSON.stringify(encrypted);
}

/**
 * Decrypt a token that was stored via encryptToken().
 * Handles both encrypted (JSON) and plaintext (legacy) values.
 */
export function decryptToken(storedValue: string): string {
  if (!storedValue) return '';

  // Try parsing as encrypted JSON
  try {
    const parsed = JSON.parse(storedValue) as EncryptedToken;
    if (parsed.v && parsed.enc && parsed.iv && parsed.tag) {
      const key = getEncryptionKey();
      if (!key) {
        console.error('[TokenEncryption] Found encrypted token but TOKEN_ENCRYPTION_KEY not set!');
        return '';
      }

      const iv = Buffer.from(parsed.iv, 'hex');
      const tag = Buffer.from(parsed.tag, 'hex');
      const ciphertext = Buffer.from(parsed.enc, 'hex');

      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);

      let plaintext = decipher.update(ciphertext, undefined, 'utf8');
      plaintext += decipher.final('utf8');

      return plaintext;
    }
  } catch {
    // Not JSON or not encrypted format — treat as plaintext
  }

  // Legacy: plaintext token stored directly
  return storedValue;
}

/**
 * Re-encrypt a token with the current key.
 * Useful for migrating plaintext tokens to encrypted ones.
 * Returns { encrypted, wasAlreadyEncrypted }.
 */
export function reEncryptToken(storedValue: string): { encrypted: string; wasAlreadyEncrypted: boolean } {
  // Check if already encrypted
  try {
    const parsed = JSON.parse(storedValue);
    if (parsed.v && parsed.enc) {
      return { encrypted: storedValue, wasAlreadyEncrypted: true };
    }
  } catch {
    // Not JSON
  }

  // Plaintext — encrypt it
  return { encrypted: encryptToken(storedValue), wasAlreadyEncrypted: false };
}
