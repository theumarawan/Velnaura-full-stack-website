import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

/** Shared by the Next server and seed CLI; no connection opens until a query runs. */
export function createDatabase(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5000, max: 5 }),
  });
}
