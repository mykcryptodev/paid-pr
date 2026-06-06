import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import * as schema from "./schema";

function createDb() {
  const sql = neon(env.databaseUrl());
  return drizzle(sql, { schema });
}

let db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!db) {
    db = createDb();
  }

  return db;
}

export type Db = ReturnType<typeof getDb>;
