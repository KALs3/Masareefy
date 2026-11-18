import { GoogleGenAI, Type } from "@google/genai";
import { getEnv } from "../lib/env";

let _genai: GoogleGenAI | null = null;

function getGenAI() {
  if (!_genai) {
    _genai = new GoogleGenAI({ apiKey: getEnv().GEMINI_API_KEY });
  }
  return _genai;
}

// Structured output schema — Gemini will be forced to return this exact shape
const expenseExtractionSchema = {
  type: Type.OBJECT,
  properties: {
    is_expense: {
      type: Type.BOOLEAN,
      description: "Whether the input contains expense information",
    },
    expenses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          amount: { type: Type.NUMBER, description: "The expense amount" },
          currency: {
            type: Type.STRING,
            description: "Currency code (e.g., EGP, USD, EUR, SAR, AED)",
          },
          description: {
            type: Type.STRING,
            description: "Short description or merchant/store name",
          },
          category: {
            type: Type.STRING,
            description: "Best matching category name from the available list",
          },
          expense_date: {
            type: Type.STRING,
            description: "Date in YYYY-MM-DD format",
          },
        },
        required: [
          "amount",
          "currency",
          "description",
          "category",
          "expense_date",
        ],
      },
    },
    reply_message: {
      type: Type.STRING,
      description:
        "A friendly reply to the user (used when is_expense is false or to summarize)",
    },
  },
  required: ["is_expense", "expenses", "reply_message"],
};

export interface ExtractedExpense {
  amount: number;
  currency: string;
  description: string;
  category: string;
  expense_date: string;
}

export interface ExtractionResult {
  is_expense: boolean;
  expenses: ExtractedExpense[];
  reply_message: string;
}

function buildSystemPrompt(
  userCurrency: string,
  categoryNames: string[],
  currentDate: string,
  medium: "text" | "voice" | "receipt/image"
): string {
  return `You are a precise expense extraction assistant for a Telegram bot called Masareefy.
The user's default currency is ${userCurrency}.
Today's date is ${currentDate}.
Available categories: ${categoryNames.join(", ")}.
Input medium: ${medium}.

Rules:
- Extract expense details accurately from the input.
- If the input contains multiple distinct expenses, return each as a separate item in the expenses array.
- Use the user's default currency (${userCurrency}) unless another currency is explicitly mentioned or visible.
- Resolve relative dates ("yesterday", "last Friday", "today", "2 days ago") relative to today's date (${currentDate}).
- If the input is in Arabic, Egyptian dialect, Franco-Arab, or English, understand and parse it accurately.
- For descriptions, use clear, clean descriptions (e.g., "coffee and croissant", "Uber ride", "Spinneys groceries", "Electricity bill").
- For receipts or transaction screenshots (e.g., InstaPay, bank SMS/app, paper receipt), extract the merchant/payee name as the description, the total paid as the amount, the transaction date, and choose the most suitable category.
- If the input does NOT represent an expense (e.g., general chatter, greeting, random photo), set is_expense to false and set reply_message to a polite and helpful response.
- Always pick the most appropriate category from the available category list.`;
}

/**
 * Safely parse the Gemini response text into an ExtractionResult.
 * Handles null/undefined responses, malformed JSON, and missing fields.
 */
function parseGeminiResponse(responseText: string | null | undefined): ExtractionResult {
  if (!responseText || responseText.trim().length === 0) {
    console.error("[AI] Gemini returned empty/null response text");
    return {
      is_expense: false,
      expenses: [],
      reply_message: "I couldn't process that. Could you try again or type the expense manually?",
    };
  }

  try {
    const parsed = JSON.parse(responseText);

    // Validate essential fields exist
    return {
      is_expense: Boolean(parsed.is_expense),
      expenses: Array.isArray(parsed.expenses)
        ? parsed.expenses.filter(
            (e: Record<string, unknown>) =>
              typeof e.amount === "number" && e.amount > 0
          )
        : [],
      reply_message:
        parsed.reply_message ||
        (parsed.is_expense
          ? "Expense logged!"
          : "I couldn't find expense details in that."),
    };
  } catch (parseError) {
    console.error("[AI] Failed to parse Gemini JSON response:", parseError, "Raw:", responseText);
    return {
      is_expense: false,
      expenses: [],
      reply_message: "I had trouble understanding the response. Please try sending the expense as text.",
    };
  }
}

/**
 * Call Gemini with retry logic for transient failures.
 * Retries once on network/server errors with a brief delay.
 */
async function callGeminiWithRetry(
  genai: GoogleGenAI,
  params: Parameters<GoogleGenAI["models"]["generateContent"]>[0],
  label: string,
  maxRetries: number = 1
): Promise<string | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await genai.models.generateContent(params);
      return response.text ?? null;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      console.error(
        `[AI] Gemini ${label} attempt ${attempt + 1}/${maxRetries + 1} failed:`,
        error instanceof Error ? error.message : error
      );

      if (isLastAttempt) throw error;

      // Brief delay before retry (1 second)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return null;
}

/**
 * Extract expense details from a natural language text message using Gemini.
 */
export async function extractExpenseFromText(
  text: string,
  userCurrency: string,
  categoryNames: string[],
  currentDate: string
): Promise<ExtractionResult> {
  const genai = getGenAI();
  const systemPrompt = buildSystemPrompt(userCurrency, categoryNames, currentDate, "text");

  const responseText = await callGeminiWithRetry(
    genai,
    {
      model: "gemini-3.5-flash",
      contents: text,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: expenseExtractionSchema,
      },
    },
    "text"
  );

  return parseGeminiResponse(responseText);
}

/**
 * Extract expense details from an audio buffer (e.g., Telegram voice note in OGG/Opus).
 */
export async function extractExpenseFromAudio(
  audioBuffer: Buffer,
  mimeType: string,
  userCurrency: string,
  categoryNames: string[],
  currentDate: string
): Promise<ExtractionResult> {
  const genai = getGenAI();
  const systemPrompt = buildSystemPrompt(userCurrency, categoryNames, currentDate, "voice");

  // Telegram voice notes are always Opus-in-OGG containers.
  // Normalize the MIME type to what Gemini reliably accepts.
  const normalizedMime = normalizeMimeType(mimeType, "audio/ogg");

  const responseText = await callGeminiWithRetry(
    genai,
    {
      model: "gemini-3.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: normalizedMime,
                data: audioBuffer.toString("base64"),
              },
            },
            {
              text: "Listen to this voice message and extract all expense information mentioned. The user may speak in Arabic, Egyptian dialect, Franco-Arabic, or English.",
            },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: expenseExtractionSchema,
      },
    },
    "audio"
  );

  return parseGeminiResponse(responseText);
}

/**
 * Extract expense details from an image buffer (e.g., paper receipt, bill, InstaPay transfer screenshot).
 * Optionally accepts a user caption for additional context.
 */
export async function extractExpenseFromImage(
  imageBuffer: Buffer,
  mimeType: string,
  userCurrency: string,
  categoryNames: string[],
  currentDate: string,
  caption?: string
): Promise<ExtractionResult> {
  const genai = getGenAI();
  const systemPrompt = buildSystemPrompt(userCurrency, categoryNames, currentDate, "receipt/image");

  const normalizedMime = normalizeMimeType(mimeType, "image/jpeg");

  // Build a contextual prompt — include caption if the user provided one
  const userPrompt = caption
    ? `The user sent this image with the caption: "${caption}". Extract the expense details (merchant/payee, total amount, currency, date, category) from this receipt, invoice, or payment screenshot. Use the caption as extra context.`
    : "Extract the expense details (merchant/payee, total amount, currency, date, category) from this receipt, invoice, or payment screenshot.";

  const responseText = await callGeminiWithRetry(
    genai,
    {
      model: "gemini-3.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: normalizedMime,
                data: imageBuffer.toString("base64"),
              },
            },
            {
              text: userPrompt,
            },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: expenseExtractionSchema,
      },
    },
    "image"
  );

  return parseGeminiResponse(responseText);
}

/**
 * Normalize MIME types to ensure Gemini receives a valid, known type.
 * Handles edge cases like undefined, empty, or non-standard MIME strings from Telegram.
 */
function normalizeMimeType(raw: string | undefined | null, fallback: string): string {
  if (!raw || raw.trim().length === 0) return fallback;

  const cleaned = raw.toLowerCase().trim().split(";")[0].trim(); // Strip codec params like "; codecs=opus"

  // Map known variants to Gemini-accepted types
  const mimeMap: Record<string, string> = {
    "audio/ogg": "audio/ogg",
    "audio/opus": "audio/ogg",
    "audio/oga": "audio/ogg",
    "audio/x-ogg": "audio/ogg",
    "audio/mp3": "audio/mp3",
    "audio/mpeg": "audio/mp3",
    "audio/mp4": "audio/mp3",
    "audio/m4a": "audio/mp3",
    "audio/wav": "audio/wav",
    "audio/x-wav": "audio/wav",
    "audio/webm": "audio/webm",
    "audio/flac": "audio/flac",
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/webp": "image/webp",
    "image/gif": "image/gif",
    "image/heic": "image/heic",
    "image/heif": "image/heif",
  };

  return mimeMap[cleaned] || fallback;
}
