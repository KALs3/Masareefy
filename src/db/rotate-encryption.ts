import { db } from "./client";
import { expenses } from "./schema";
import { eq } from "drizzle-orm";
import {
  decryptField,
  encryptField,
  needsReencryption,
} from "../lib/encryption";
import { getEnv } from "../lib/env";

/**
 * Re-encrypts any legacy plaintext, v1, or older key-version expense rows
 * to the currently active `ENCRYPTION_KEY_VERSION` (v2 with HKDF + AAD).
 *
 * Rotation procedure:
 * 1. Keep old key as ENCRYPTION_KEY_K1=<old_hex>
 * 2. Set new key as ENCRYPTION_KEY=<new_hex> (or ENCRYPTION_KEY_K2) and ENCRYPTION_KEY_VERSION=k2
 * 3. Run: npm run db:rotate-keys
 * 4. Verify output shows 0 failures, then remove ENCRYPTION_KEY_K1
 */
async function rotateKeys() {
  const activeVersion = getEnv().ENCRYPTION_KEY_VERSION;
  console.log(`🔄 Starting key rotation/migration to enc:v2:${activeVersion}...`);

  const allExpenses = await db
    .select({
      id: expenses.id,
      userId: expenses.userId,
      description: expenses.description,
    })
    .from(expenses);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of allExpenses) {
    if (!needsReencryption(row.description)) {
      skipped++;
      continue;
    }

    try {
      const ctx = {
        userId: row.userId,
        recordId: row.id,
        field: "description",
      };

      const plaintext = decryptField(row.description, ctx);
      if (plaintext === "🔒 [Protected Expense]") {
        throw new Error("Could not decrypt existing row");
      }

      const reencrypted = encryptField(plaintext, ctx);

      // Verify round-trip BEFORE writing to DB
      const verified = decryptField(reencrypted, ctx);
      if (verified !== plaintext) {
        throw new Error("Round-trip verification mismatch");
      }

      await db
        .update(expenses)
        .set({ description: reencrypted })
        .where(eq(expenses.id, row.id));

      migrated++;
    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message : "UnknownError";
      console.error(`❌ Failed record=${row.id} user=${row.userId}: ${reason}`);
    }
  }

  console.log(
    `✅ Rotation complete! Active version=${activeVersion} | Migrated=${migrated} | Already current=${skipped} | Failed=${failed}`
  );
  process.exit(failed > 0 ? 1 : 0);
}

rotateKeys().catch((err) => {
  console.error("Rotation aborted:", err instanceof Error ? err.message : err);
  process.exit(1);
});
