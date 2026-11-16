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
      description: "Whether the message contains expense information",
    },
    expenses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          amount: { type: Type.NUMBER, description: "The expense amount" },
          currency: {
            type: Type.STRING,
            description: "Currency code (e.g., EGP, USD)",
          },
          description: {
            type: Type.STRING,
            description: "Short description of the expense",
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
        "A friendly reply to the user (used when is_expense is false)",
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

/**
 * Extract expense details from a natural language text message using Gemini.
 * Uses structured output to guarantee a well-typed JSON response.
 */
export async function extractExpenseFromText(
  text: string,
  userCurrency: string,
  categoryNames: string[],
  currentDate: string
): Promise<ExtractionResult> {
  const systemPrompt = `You are a precise expense extraction assistant.
The user's default currency is ${userCurrency}.
Today's date is ${currentDate}.
Available categories: ${categoryNames.join(", ")}.

Rules:
- Extract expense details from the user's message.
- If the message contains multiple expenses, return each as a separate object in the expenses array.
- Use the user's default currency unless they explicitly specify a different one.
- Resolve relative dates ("yesterday", "last Friday") relative to today's date.
- If the message is NOT about an expense (e.g., greetings, questions), set is_expense to false and provide a helpful reply_message.
- Always pick the most appropriate category from the available list.
- Keep descriptions concise but descriptive (e.g., "coffee and croissant" not just "food").`;

  const genai = getGenAI();
  const response = await genai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: text,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: expenseExtractionSchema,
    },
  });

  const parsed: ExtractionResult = JSON.parse(response.text!);
  return parsed;
}
