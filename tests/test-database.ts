import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createDatabase } from "../server/database";

type TestDatabase = {
  db: ReturnType<typeof createDatabase>;
  url: string;
  schema?: string;
  close(): Promise<void>;
};

const migrationsRoot = new URL("../prisma/migrations/", import.meta.url);

async function migrationSql() {
  const entries = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  return Promise.all(entries.map((entry) => readFile(new URL(`${entry.name}/migration.sql`, migrationsRoot), "utf8")));
}

function schemaUrl(connectionString: string, schema: string) {
  const url = new URL(connectionString);
  url.searchParams.delete("schema");
  url.searchParams.delete("pgbouncer");
  url.searchParams.delete("options");
  url.searchParams.set("schema", schema);
  url.searchParams.set("uselibpqcompat", "true");
  return url.toString();
}

function postgresTestAdminUrl(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("uselibpqcompat", "true");
  return url.toString();
}

async function postgresTestDatabase(): Promise<TestDatabase> {
  const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL || process.env.DIRECT_URL;
  if (!adminUrl) throw new Error("TEST_POSTGRES_ADMIN_URL or DIRECT_URL is required for PostgreSQL tests.");
  const schema = `velnaura_test_${randomBytes(10).toString("hex")}`;
  const admin = new Client({ connectionString: postgresTestAdminUrl(adminUrl), connectionTimeoutMillis: 10000 });
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const scoped = new Client({
      connectionString: postgresTestAdminUrl(adminUrl),
      connectionTimeoutMillis: 10000,
      options: `-c search_path=${schema}`,
    });
    await scoped.connect();
    try {
      for (const sql of await migrationSql()) await scoped.query(sql);
    } finally {
      await scoped.end();
    }
  } catch (error) {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    throw error;
  }
  const url = schemaUrl(adminUrl, schema);
  const db = createDatabase(url);
  const [selection] = await db.$queryRawUnsafe<Array<{ schema: string }>>("SELECT current_schema() AS schema");
  if (selection?.schema !== schema) {
    await db.$disconnect();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    throw new Error(`PostgreSQL test schema isolation failed for ${schema}.`);
  }
  return {
    db,
    url,
    schema,
    async close() {
      await db.$disconnect();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    },
  };
}

async function pgliteTestDatabase(): Promise<TestDatabase> {
  const engine = await PGlite.create();
  for (const sql of await migrationSql()) await engine.exec(sql);
  const socket = new PGLiteSocketServer({ db: engine, host: "127.0.0.1", port: 0, maxConnections: 10 });
  await socket.start();
  const url = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`;
  const db = createDatabase(url);
  return {
    db,
    url,
    async close() {
      await db.$disconnect();
      await socket.stop();
      await engine.close();
    },
  };
}

export async function testDatabase() {
  return process.env.TEST_DATABASE_BACKEND === "postgres"
    ? postgresTestDatabase()
    : pgliteTestDatabase();
}
