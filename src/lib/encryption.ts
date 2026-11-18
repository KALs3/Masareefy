import crypto from "node:crypto";
import { getEnv } from "./env";

/**
 * Per-User Envelope Encryption (AES-256-GCM)
 *
 * Security Model:
 * 1. Master Secret: Derived from ENCRYPTION_KEY (or TELEGRAM_BOT_TOKEN).
 * 2. Key Derivation: Each user gets a mathematically distinct 256-bit encryption key
 *    derived via HKDF-SHA256 using their unique Telegram User ID as the salt.
 * 3. Confidentiality & Tamper Proofing: AES-256-GCM with a fresh random 12-byte IV
 *    and a 16-byte authentication tag per record.
 * 4. Stored Format at Rest: `enc:v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`
 * 5. Backward Compatibility: Plaintext records without `enc:v1:` prefix pass through cleanly.
 */

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";
const IV_LENGTH = 12; // 96 bits recommended for AES-GCM

/**
 * Derives a user-specific 256-bit AES key using HKDF-SHA256.
 */
function deriveUserKey(userId: number): Buffer {
  const env = getEnv();
  // Use dedicated ENCRYPTION_KEY if provided, otherwise fallback to bot token as master secret
  const masterSecret = process.env.ENCRYPTION_KEY || env.TELEGRAM_BOT_TOKEN;

  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      Buffer.from(masterSecret, "utf-8"),
      Buffer.from(`user-salt-${userId}`, "utf-8"),
      Buffer.from("masareefy-user-expenses-encryption-v1", "utf-8"),
      32 // 256-bit key
    )
  );
}

/**
 * Encrypts sensitive expense text (like description, merchant, notes) before saving to PostgreSQL.
 *
 * @param plaintext - The raw description string
 * @param userId - The Telegram User ID
 * @returns Scrambled ciphertext string formatted as `enc:v1:<iv>:<tag>:<ciphertext>`
 */
export function encryptText(plaintext: string, userId: number): string {
  if (!plaintext) return "";

  try {
    const key = deriveUserKey(userId);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let ciphertext = cipher.update(plaintext, "utf8", "hex");
    ciphertext += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return `${PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext}`;
  } catch (error) {
    console.error("[Encryption] Failed to encrypt:", error);
    // Return original if crypto fails to avoid data loss
    return plaintext;
  }
}

/**
 * Decrypts sensitive expense text when reading from PostgreSQL for the authorized user.
 *
 * @param storedValue - The encrypted string from the database
 * @param userId - The Telegram User ID
 * @returns Plaintext string
 */
export function decryptText(storedValue: string | null | undefined, userId: number): string {
  if (!storedValue) return "";

  // Backward compatibility: If not encrypted with enc:v1:, return raw value
  if (!storedValue.startsWith(PREFIX)) {
    return storedValue;
  }

  try {
    const parts = storedValue.slice(PREFIX.length).split(":");
    if (parts.length !== 3) {
      console.warn("[Encryption] Invalid ciphertext format:", storedValue);
      return storedValue;
    }

    const [ivHex, tagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");

    const key = deriveUserKey(userId);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error(`[Encryption] Failed to decrypt record for user ${userId}:`, error);
    return "🔒 [Protected Expense]";
  }
}
