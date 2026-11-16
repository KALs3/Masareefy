import { handle } from "@hono/vercel";
import app from "@/server/app";

// Delegate all HTTP methods to the Hono app
export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);

// Allow up to 60s for Gemini AI processing
export const maxDuration = 60;
