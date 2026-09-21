import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readdir, readFile } from "node:fs/promises";
import { createDatabase } from "../server/database";

export async function testDatabase() {
  const engine = await PGlite.create();
  const root = new URL("../prisma/migrations/", import.meta.url);
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) await engine.exec(await readFile(new URL(`${entry.name}/migration.sql`, root), "utf8"));
  }
  const socket = new PGLiteSocketServer({ db: engine, host: "127.0.0.1", port: 0, maxConnections: 10 });
  await socket.start();
  const url = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`;
  const db = createDatabase(url);
  return { db, url, async close() { await db.$disconnect(); await socket.stop(); await engine.close(); } };
}
