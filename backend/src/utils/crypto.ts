import crypto from 'crypto';
import { config } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

function getEncryptionKey(): Buffer {
  const secret = config.jwtSecret || 'bluecollar-default-secret-key-32-chars-long!';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts sensitive text (e.g. residential gate/lockbox codes) using AES-256-GCM.
 * Formatted as: enc:v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>
 */
export function encryptField(plainText?: string | null): string {
  if (!plainText) return plainText ?? '';
  // Avoid re-encrypting already encrypted values
  if (plainText.startsWith('enc:v1:')) return plainText;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `enc:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts text encrypted with encryptField.
 * Backwards compatible: if text is not prefixed with 'enc:v1:', returns as-is.
 */
export function decryptField(cipherText?: string | null): string {
  if (!cipherText || !cipherText.startsWith('enc:v1:')) {
    return cipherText ?? '';
  }

  try {
    const parts = cipherText.split(':');
    if (parts.length !== 5) return cipherText;

    const [, , ivHex, tagHex, dataHex] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(dataHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // If decryption fails, safely fallback
    return cipherText;
  }
}
