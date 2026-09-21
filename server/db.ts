import "server-only";
import { createDatabase } from "./database";

const globalDatabase = globalThis as unknown as {
  velnauraDatabase?: ReturnType<typeof createDatabase>;
};

/** Lazy initialization keeps builds independent of a running database. */
export function getDatabase() {
  if (!globalDatabase.velnauraDatabase) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required for database operations.");
    globalDatabase.velnauraDatabase = createDatabase(url);
  }
  return globalDatabase.velnauraDatabase;
}
