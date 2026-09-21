import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

/** Shared by the Next server and seed CLI; no connection opens until a query runs. */
export function createDatabase(connectionString: string) {
  const parsed = new URL(connectionString);
  const schema = parsed.searchParams.get("schema") || undefined;
  parsed.searchParams.delete("schema");
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: parsed.toString(),
      connectionTimeoutMillis: 5000,
      max: process.env.NODE_ENV === "test" ? 2 : 5,
      ...(schema ? { options: `-c search_path=${schema}` } : {}),
    }, schema ? { schema } : undefined),
  });
}
