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

  const response = await genai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: text,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: expenseExtractionSchema,
    },
  });

  return JSON.parse(response.text!) as ExtractionResult;
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

  const response = await genai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: mimeType || "audio/ogg",
              data: audioBuffer.toString("base64"),
            },
          },
          {
            text: "Extract all expense information from this spoken voice message.",
          },
        ],
      },
    ],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: expenseExtractionSchema,
    },
  });

  return JSON.parse(response.text!) as ExtractionResult;
}

/**
 * Extract expense details from an image buffer (e.g., paper receipt, bill, InstaPay transfer screenshot).
 */
export async function extractExpenseFromImage(
  imageBuffer: Buffer,
  mimeType: string,
  userCurrency: string,
  categoryNames: string[],
  currentDate: string
): Promise<ExtractionResult> {
  const genai = getGenAI();
  const systemPrompt = buildSystemPrompt(userCurrency, categoryNames, currentDate, "receipt/image");

  const response = await genai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: mimeType || "image/jpeg",
              data: imageBuffer.toString("base64"),
            },
          },
          {
            text: "Extract the expense details (merchant/payee, total amount, currency, date, category) from this receipt, invoice, or payment screenshot.",
          },
        ],
      },
    ],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: expenseExtractionSchema,
    },
  });

  return JSON.parse(response.text!) as ExtractionResult;
}
