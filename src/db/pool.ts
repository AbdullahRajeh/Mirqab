import { Pool } from "pg";
import { config } from "../config";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
    });
  }

  return pool;
}
