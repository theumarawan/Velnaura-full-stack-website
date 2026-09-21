import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createDatabase } from "../server/database";

const run = promisify(execFile);

test("committed migrations, seed and commerce invariants", { timeout: 120000 }, async (t) => {
  const engine = await PGlite.create();
  const migrations = new URL("../prisma/migrations/", import.meta.url);
  for (const entry of (await readdir(migrations, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) await engine.exec(await readFile(new URL(`${entry.name}/migration.sql`, migrations), "utf8"));
  }
  const server = new PGLiteSocketServer({ db: engine, port: 0, host: "127.0.0.1", maxConnections: 5 });
  await server.start();
  const url = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
  const db = createDatabase(url);
  const seedEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", DATABASE_URL: url, DIRECT_URL: url,
    ALLOW_DEV_SEED: "true", SEED_CUSTOMER_PASSWORD: randomBytes(20).toString("hex"),
    SEED_ADMIN_PASSWORD: randomBytes(20).toString("hex"),
  };
  const seed = (env = seedEnv) => run(process.execPath, ["--import", "tsx", "prisma/seed.ts"], { env, timeout: 45000 });
  try {
    await t.test("seed runs and reruns without overwriting content, stock or password hashes", async () => {
      await seed();
      assert.equal(await db.user.count(), 2);
      assert.equal(await db.product.count(), 3);
      assert.equal(await db.productVariant.count(), 6);
      assert.equal(await db.contentBlock.count(), 3);
      assert.equal(await db.address.count({ where: { isDefault: true } }), 1);
      const customer = await db.user.findUniqueOrThrow({ where: { email: "customer@velnaura.test" } });
      assert.match(customer.passwordHash, /^\$2[aby]\$12\$/);
      assert.ok(!customer.passwordHash.includes(seedEnv.SEED_CUSTOMER_PASSWORD!));
      await db.contentBlock.update({ where: { page_key: { page: "science", key: "introduction" } }, data: { content: { edited: true } } });
      await db.productVariant.update({ where: { sku: "VEL-MUG-150" }, data: { stockQuantity: 123 } });
      await db.$disconnect();
      await seed();
      assert.equal(await db.user.count(), 2);
      assert.equal(await db.productVariant.count(), 6);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: customer.id } })).passwordHash, customer.passwordHash);
      assert.equal((await db.productVariant.findUniqueOrThrow({ where: { sku: "VEL-MUG-150" } })).stockQuantity, 123);
      assert.deepEqual((await db.contentBlock.findUniqueOrThrow({ where: { page_key: { page: "science", key: "introduction" } } })).content, { edited: true });
    });
    await t.test("seed refuses production", async () => {
      await assert.rejects(seed({ ...seedEnv, NODE_ENV: "production" }), /non-production/);
    });
    const customer = await db.user.findUniqueOrThrow({ where: { email: "customer@velnaura.test" } });
    await t.test("default address is unique and cannot disappear while other addresses remain", async () => {
      await assert.rejects(db.address.update({ where: { id: "seed-address-work" }, data: { isDefault: true } }));
      await assert.rejects(db.address.update({ where: { id: "seed-address-home" }, data: { isDefault: false } }));
      await db.$transaction([
        db.address.update({ where: { id: "seed-address-home" }, data: { isDefault: false } }),
        db.address.update({ where: { id: "seed-address-work" }, data: { isDefault: true } }),
      ]);
      assert.equal(await db.address.count({ where: { userId: customer.id, isDefault: true } }), 1);
      await assert.rejects(db.address.delete({ where: { id: "seed-address-work" } }));
    });
    const variant = await db.productVariant.findUniqueOrThrow({ where: { sku: "VEL-MUG-150" }, include: { product: true } });
    const orderData = {
      email: "guest@example.test", phone: "+920000000001", paymentMethod: "COD" as const,
      paymentProvider: "MANUAL" as const, subtotal: "2450.00", totalAmount: "2650.00", shippingAmount: "200.00",
      shippingRecipient: "Guest Customer", shippingPhone: "+920000000001", shippingLine1: "12 Example Lane",
      shippingCity: "Lahore", shippingProvince: "Punjab",
    };
    const itemData = { productId: variant.productId, variantId: variant.id, productName: variant.product.name,
      variantSize: variant.size, sku: variant.sku, quantity: 1, unitPrice: "2450.00" };
    const order = await db.order.create({ data: { ...orderData, items: { create: itemData } }, include: { items: true } });
    await t.test("guest order retains price/address snapshots after catalog and address changes", async () => {
      assert.equal(order.userId, null);
      await db.product.update({ where: { id: variant.productId }, data: { basePrice: "2999.00", name: "Renamed Mugtea" } });
      await db.address.update({ where: { id: "seed-address-home" }, data: { line1: "Changed address" } });
      const receipt = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
      assert.equal(receipt.items[0].unitPrice.toFixed(2), "2450.00");
      assert.equal(receipt.items[0].productName, "Mugtea Cleanser");
      assert.equal(receipt.shippingLine1, "12 Example Lane");
      await assert.rejects(db.orderItem.update({ where: { id: order.items[0].id }, data: { unitPrice: "0.00" } }));
      await assert.rejects(db.order.update({ where: { id: order.id }, data: { shippingLine1: "Rewritten" } }));
    });
    await t.test("invalid quantities, stock, totals and empty orders are rejected", async () => {
      await assert.rejects(db.productVariant.update({ where: { id: variant.id }, data: { stockQuantity: -1 } }));
      await assert.rejects(db.order.create({ data: { ...orderData, items: { create: { ...itemData, quantity: 0 } } } }));
      await assert.rejects(db.order.create({ data: { ...orderData, totalAmount: "1.00", items: { create: itemData } } }));
      await assert.rejects(db.order.create({ data: { ...orderData, subtotal: "2400.00", totalAmount: "2600.00", items: { create: itemData } } }));
      await assert.rejects(db.order.create({ data: orderData }));
      assert.equal(await db.order.count(), 1);
    });
    await t.test("product/variant mismatch and purchased catalog deletion are rejected", async () => {
      const other = await db.product.findUniqueOrThrow({ where: { slug: "dewdrop-serum" } });
      await assert.rejects(db.order.create({ data: { ...orderData, items: { create: { ...itemData, productId: other.id } } } }));
      await assert.rejects(db.productVariant.delete({ where: { id: variant.id } }));
      await assert.rejects(db.product.delete({ where: { id: variant.productId } }));
    });
    await t.test("duplicate payment references cannot be assigned to different orders", async () => {
      await db.order.update({ where: { id: order.id }, data: { paymentProvider: "SAFEPAY", paymentMethod: "CARD", paymentReference: "test-tracker-1" } });
      await assert.rejects(db.order.create({ data: { ...orderData, paymentProvider: "SAFEPAY", paymentMethod: "CARD", paymentReference: "test-tracker-1", items: { create: itemData } } }));
    });
    await t.test("user deletion clears attribution and addresses while preserving order history", async () => {
      await db.order.update({ where: { id: order.id }, data: { userId: customer.id } });
      const event = await db.analyticsEvent.create({ data: { type: "PURCHASE", userId: customer.id, sessionId: "anonymous-test-session" } });
      await db.user.delete({ where: { id: customer.id } });
      assert.equal(await db.address.count({ where: { userId: customer.id } }), 0);
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).userId, null);
      assert.equal((await db.analyticsEvent.findUniqueOrThrow({ where: { id: event.id } })).userId, null);
      assert.equal(await db.orderItem.count({ where: { orderId: order.id } }), 1);
    });
  } finally {
    await db.$disconnect();
    await server.stop();
    await engine.close();
  }
});



