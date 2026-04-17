import fs from "node:fs/promises";
import path from "node:path";
import { getPool } from "./pool";

async function runMigrations(): Promise<void> {
  const pool = getPool();
  const migrationsDir = path.join(process.cwd(), "sql", "migrations");
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    await pool.query(sql);
    console.log(`Applied migration: ${file}`);
  }
}

runMigrations()
  .then(async () => {
    await getPool().end();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    try {
      await getPool().end();
    } catch {
      // Ignore shutdown errors after a failed setup.
    }
    process.exitCode = 1;
  });
