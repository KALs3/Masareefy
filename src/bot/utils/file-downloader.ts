import { getEnv } from "../../lib/env";

/**
 * Downloads a file from Telegram's servers into an in-memory Buffer.
 *
 * Features:
 * - 30-second timeout via AbortController (prevents hanging on slow downloads)
 * - Automatic retry on transient network failures (1 retry with 1s delay)
 * - Detailed error logging for diagnostics
 * - Zero disk footprint — everything stays in RAM
 *
 * @param filePath - The `file_path` returned by Telegram's `getFile()` API
 * @returns Buffer containing the raw file bytes
 */
export async function downloadTelegramFile(filePath: string): Promise<Buffer> {
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

  const maxRetries = 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 30-second timeout — generous enough for large files but prevents infinite hangs
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      const response = await fetch(downloadUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `Telegram file download failed: HTTP ${response.status} ${response.statusText} for ${filePath}`
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      console.log(
        `[FileDownloader] Downloaded ${filePath}: ${buffer.length} bytes (attempt ${attempt + 1})`
      );

      return buffer;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const errMsg = error instanceof Error ? error.message : String(error);

      // Check if it was a timeout
      if (error instanceof Error && error.name === "AbortError") {
        console.error(
          `[FileDownloader] Timeout downloading ${filePath} (attempt ${attempt + 1}/${maxRetries + 1})`
        );
      } else {
        console.error(
          `[FileDownloader] Error downloading ${filePath} (attempt ${attempt + 1}/${maxRetries + 1}):`,
          errMsg
        );
      }

      if (isLastAttempt) {
        throw new Error(`Failed to download file from Telegram after ${maxRetries + 1} attempts: ${errMsg}`);
      }

      // Brief delay before retry
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // This should never be reached, but TypeScript requires it
  throw new Error(`Failed to download file from Telegram: ${filePath}`);
}
