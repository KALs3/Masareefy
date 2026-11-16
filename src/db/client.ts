import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// prepare: false is required for Supabase Transaction Pooler (port 6543)
// Supavisor (Supabase's connection pooler) doesn't support prepared statements
const client = postgres(connectionString, {
  prepare: false,
  max: 10, // Keep pool small for serverless / free tier
});

export const db = drizzle(client, { schema });
