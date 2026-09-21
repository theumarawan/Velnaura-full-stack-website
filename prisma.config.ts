import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // Migrations use a direct connection when deployment uses a pooled runtime URL.
  datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL },
});
