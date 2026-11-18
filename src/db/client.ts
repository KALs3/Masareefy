import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;
const isLocalDb =
  connectionString?.includes("localhost") ||
  connectionString?.includes("127.0.0.1");

// prepare: false is required for Supabase Transaction Pooler (port 6543)
// ssl: "require" enforces TLS encryption in transit for remote databases
const client = postgres(connectionString, {
  prepare: false,
  max: 10, // Keep pool small for serverless / free tier
  ssl: isLocalDb ? false : "require",
});

export const db = drizzle(client, { schema });
