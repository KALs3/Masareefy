import crypto from "node:crypto";
import { getEnv } from "./env";

/**
 * Hardened Per-User Authenticated Encryption (AES-256-GCM + HKDF-SHA256 + AAD)
 *
 * Format v2 (Current):
 *   `enc:v2:<keyVersion>:<iv_hex>:<tag_hex>:<ciphertext_hex>`
 *
 * Security Properties:
 * 1. Dedicated Master Key: Loaded strictly from `ENCRYPTION_KEY` (or versioned
 *    `ENCRYPTION_KEY_K1`, `ENCRYPTION_KEY_K2`, ...), completely separate from
 *    `TELEGRAM_BOT_TOKEN`. Fails closed if missing — never silently stores plaintext.
 * 2. RFC 5869 HKDF-SHA256: Uses a fixed application salt and places `telegram_id`
 *    and key version inside `info` for clean domain separation.
 * 3. Fresh Random 12-byte IV per encryption from CSPRNG (`crypto.randomBytes`).
 * 4. AAD (Additional Authenticated Data): Cryptographically binds `keyVersion`,
 *    `userId`, `recordId`, and `field` name to the ciphertext so rows/fields
 *    cannot be swapped or replayed across records or users.
 * 5. Safe Failure Handling: Never logs plaintext, ciphertext, or keys.
 */

const ALGORITHM = "aes-256-gcm";
const PREFIX_V2 = "enc:v2:";
const PREFIX_V1 = "enc:v1:";
const IV_LENGTH = 12; // 96 bits (recommended for AES-GCM)
const TAG_LENGTH = 16; // 128 bits auth tag
const FIXED_HKDF_SALT = Buffer.from("masareefy-hkdf-salt-v2", "utf8");

export interface EncryptionContext {
  userId: number;
  recordId: string;
  field: string;
}

/**
 * Resolves the 32-byte master key for a given key version (e.g., "k1", "k2").
 * Supports seamless key rotation via versioned env vars:
 *   - ENCRYPTION_KEY_K1, ENCRYPTION_KEY_K2, ...
 *   - Falls back to ENCRYPTION_KEY when version matches active ENCRYPTION_KEY_VERSION.
 */
function getMasterKeyForVersion(keyVersion: string): Buffer {
  const env = getEnv();
  const versionedEnvName = `ENCRYPTION_KEY_${keyVersion.toUpperCase()}`;
  const rawHex =
    process.env[versionedEnvName] ||
    (keyVersion === env.ENCRYPTION_KEY_VERSION ? env.ENCRYPTION_KEY : undefined);

  if (!rawHex || !/^[0-9a-fA-F]{64}$/.test(rawHex)) {
    throw new Error(
      `[Encryption] Missing or invalid 64-char hex master key for version "${keyVersion}". ` +
        `Set ENCRYPTION_KEY (or ${versionedEnvName}) in environment variables.`
    );
  }

  return Buffer.from(rawHex, "hex");
}

/**
 * Derives a user-specific 256-bit key using HKDF-SHA256.
 * Per RFC 5869: fixed salt in `salt`, identity & context in `info`.
 */
function deriveUserKeyV2(userId: number, keyVersion: string): Buffer {
  const masterKey = getMasterKeyForVersion(keyVersion);
  const info = Buffer.from(
    `masareefy:expenses:v2:key=${keyVersion}:user=${userId}`,
    "utf8"
  );

  return Buffer.from(
    crypto.hkdfSync("sha256", masterKey, FIXED_HKDF_SALT, info, 32)
  );
}

/**
 * Builds canonical Additional Authenticated Data (AAD) binding the ciphertext
 * to the exact user, record UUID, field name, and key version.
 */
function buildAAD(ctx: EncryptionContext, keyVersion: string): Buffer {
  return Buffer.from(
    `v2|${keyVersion}|u:${ctx.userId}|r:${ctx.recordId}|f:${ctx.field}`,
    "utf8"
  );
}

/**
 * Encrypts a sensitive field with AES-256-GCM + AAD.
 * Fails closed: throws on missing key or crypto error (never falls back to plaintext).
 */
export function encryptField(plaintext: string, ctx: EncryptionContext): string {
  const env = getEnv();
  const keyVersion = env.ENCRYPTION_KEY_VERSION;

  const key = deriveUserKeyV2(ctx.userId, keyVersion);
  const iv = crypto.randomBytes(IV_LENGTH);
  const aad = buildAAD(ctx, keyVersion);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  cipher.setAAD(aad);

  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${PREFIX_V2}${keyVersion}:${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext}`;
}

/**
 * Read-only legacy v1 decryption (for records written before v2 AAD upgrade).
 */
function decryptLegacyV1(storedValue: string, userId: number): string {
  const env = getEnv();
  const masterSecret = process.env.ENCRYPTION_KEY_V1_LEGACY || env.ENCRYPTION_KEY || env.TELEGRAM_BOT_TOKEN;

  const parts = storedValue.slice(PREFIX_V1.length).split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed v1 payload");
  }

  const [ivHex, tagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");

  const key = Buffer.from(
    crypto.hkdfSync(
      "sha256",
      Buffer.from(masterSecret, "utf8"),
      Buffer.from(`user-salt-${userId}`, "utf8"),
      Buffer.from("masareefy-user-expenses-encryption-v1", "utf8"),
      32
    )
  );

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Decrypts a stored field safely.
 * - Supports `enc:v2:` (current with AAD & key version)
 * - Supports `enc:v1:` (legacy read-only compatibility)
 * - Passes through pre-encryption plaintext rows
 * - On failure: logs only safe metadata (never plaintext or ciphertext) and returns placeholder.
 */
export function decryptField(
  storedValue: string | null | undefined,
  ctx: EncryptionContext
): string {
  if (!storedValue) return "";

  try {
    // 1. Current format: enc:v2:<keyVersion>:<iv>:<tag>:<ciphertext>
    if (storedValue.startsWith(PREFIX_V2)) {
      const parts = storedValue.slice(PREFIX_V2.length).split(":");
      if (parts.length !== 4) {
        console.error(
          `[Encryption] Decryption failed: malformed v2 envelope (record=${ctx.recordId}, field=${ctx.field})`
        );
        return "🔒 [Protected Expense]";
      }

      const [keyVersion, ivHex, tagHex, ciphertextHex] = parts;
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(tagHex, "hex");

      if (iv.length !== IV_LENGTH || authTag.length !== TAG_LENGTH) {
        console.error(
          `[Encryption] Decryption failed: invalid IV/tag length (record=${ctx.recordId}, field=${ctx.field})`
        );
        return "🔒 [Protected Expense]";
      }

      const key = deriveUserKeyV2(ctx.userId, keyVersion);
      const aad = buildAAD(ctx, keyVersion);

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: TAG_LENGTH,
      });
      decipher.setAAD(aad);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    }

    // 2. Legacy v1 format (read-only backward compatibility)
    if (storedValue.startsWith(PREFIX_V1)) {
      return decryptLegacyV1(storedValue, ctx.userId);
    }

    // 3. Pre-encryption legacy plaintext row
    return storedValue;
  } catch (error) {
    // Log strictly non-sensitive metadata — never log storedValue or plaintext
    const reason = error instanceof Error ? error.name : "UnknownError";
    console.error(
      `[Encryption] Decryption failed (${reason}) for user=${ctx.userId}, record=${ctx.recordId}, field=${ctx.field}`
    );
    return "🔒 [Protected Expense]";
  }
}

/**
 * Checks whether a stored value needs migration/re-encryption to the current active key version.
 */
export function needsReencryption(storedValue: string | null | undefined): boolean {
  if (!storedValue) return false;
  const activeVersion = getEnv().ENCRYPTION_KEY_VERSION;
  return !storedValue.startsWith(`${PREFIX_V2}${activeVersion}:`);
}
