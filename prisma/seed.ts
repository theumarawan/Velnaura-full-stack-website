import "dotenv/config";
import { hashPassword as seedPasswordHash } from "../server/auth/password";
import { createDatabase } from "../server/database";
import { CURRENCY } from "../lib/currency";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEV_SEED !== "true") {
    throw new Error("Seeding requires ALLOW_DEV_SEED=true and a non-production environment.");
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
    throw new Error("Development seed only accepts a loopback database host.");
  }
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD ?? "";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (customerPassword.length < 12 || adminPassword.length < 12 || Buffer.byteLength(customerPassword) > 72 || Buffer.byteLength(adminPassword) > 72 || customerPassword === adminPassword) {
    throw new Error("Choose distinct SEED_CUSTOMER_PASSWORD and SEED_ADMIN_PASSWORD values, each at least 12 characters.");
  }
  const [customerHash, adminHash] = await Promise.all([
    seedPasswordHash(customerPassword), seedPasswordHash(adminPassword),
  ]);
  const db = createDatabase(url);
  try {
    await db.$transaction(async (tx) => {
      // Create-only upserts intentionally preserve later edits, stock, passwords and roles on rerun.
      const customer = await tx.user.upsert({
        where: { email: "customer@velnaura.test" }, update: {},
        create: { email: "customer@velnaura.test", name: "Ayesha Khan", role: "CUSTOMER", passwordHash: customerHash },
      });
      await tx.user.upsert({
        where: { email: "admin@velnaura.test" }, update: {},
        create: { email: "admin@velnaura.test", name: "Velnaura Studio", role: "ADMIN", passwordHash: adminHash },
      });
      if (await tx.address.count({ where: { userId: customer.id } }) === 0) {
        await tx.address.createMany({ data: [
          { id: "seed-address-home", userId: customer.id, label: "Home", recipient: "Ayesha Khan", phone: "+920000000001", line1: "12 Example Lane", city: "Lahore", province: "Punjab", postalCode: "54000", isDefault: true },
          { id: "seed-address-work", userId: customer.id, label: "Work", recipient: "Ayesha Khan", phone: "+920000000001", line1: "8 Sample Avenue", line2: "Studio 2", city: "Lahore", province: "Punjab", postalCode: "54000", isDefault: false },
        ] });
      }
      // Mugtea is the supplied flagship. The other two names, all sizes and prices are development fixtures.
      // Draft status keeps unapproved merchandise/copy out of any future active catalog query.
      const products = [
        { name: "Mugtea Cleanser", slug: "mugtea-cleanser", description: "Meet Mugtea, Velnaura’s flagship cleanser. A fresh start for your daily ritual, guided by Serious Science, Delightful Delivery.", basePrice: "2450.00", variants: [
          { sku: "VEL-MUG-050", size: "50 ml", priceOverride: "1250.00", stockQuantity: 80 },
          { sku: "VEL-MUG-150", size: "150 ml", priceOverride: null, stockQuantity: 150 },
        ] },
        { name: "Cloudveil Moisturiser", slug: "cloudveil-moisturiser", description: "A development concept for the comfort step in the Velnaura ritual. Product name and formulation are subject to brand approval.", basePrice: "3200.00", variants: [
          { sku: "VEL-CLD-030", size: "30 ml", priceOverride: "1950.00", stockQuantity: 45 },
          { sku: "VEL-CLD-050", size: "50 ml", priceOverride: null, stockQuantity: 90 },
        ] },
        { name: "Dewdrop Serum", slug: "dewdrop-serum", description: "A development concept for a considered daily skincare step. Product name and formulation are subject to brand approval.", basePrice: "3850.00", variants: [
          { sku: "VEL-DEW-015", size: "15 ml", priceOverride: "2200.00", stockQuantity: 35 },
          { sku: "VEL-DEW-030", size: "30 ml", priceOverride: null, stockQuantity: 75 },
        ] },
      ];
      for (const { variants, ...product } of products) {
        await tx.product.upsert({ where: { slug: product.slug }, update: {},
          create: { ...product, currency: CURRENCY, status: "DRAFT", variants: { create: variants } },
        });
      }
      const pages = [
        { page: "our-story", heading: "Serious Science, Delightful Delivery", paragraphs: [
          "Velnaura begins with a simple belief: thoughtful skincare can feel like a small daily delight. We bring a curious, considered approach to the moments you spend with your skin.",
          "Mugtea is our starting point. Our flagship cleanser introduces a ritual built around clarity, care, and a little joy. Serious Science, Delightful Delivery is the standard we set for everything that follows.",
        ] },
        { page: "science", heading: "Curiosity belongs in your routine", paragraphs: [
          "Serious Science means asking clear questions about what belongs in a formula and why. We aim to explain ingredients in language you can understand, with evidence that supports the claims we make.",
          "Delightful Delivery means making that understanding approachable. Explore each product’s approved ingredient list and directions as they become available; we will never ask a catchy promise to stand in for evidence.",
        ] },
        { page: "ritual", heading: "Make room for a little delight", paragraphs: [
          "Start with a moment for yourself. Let Mugtea introduce the cleansing step in your Velnaura ritual, and follow the product’s approved directions for use.",
          "Build your routine around your skin’s needs and keep it considered. Serious Science, Delightful Delivery brings intention to the everyday, one small ritual at a time.",
        ] },
      ];
      for (const { page, heading, paragraphs } of pages) {
        await tx.contentBlock.upsert({ where: { page_key: { page, key: "introduction" } }, update: {},
          create: { page, key: "introduction", content: {
            type: "doc", content: [
              { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: heading }] },
              ...paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
            ],
          } },
        });
      }
    }, { timeout: 30000 });
    console.log("Seed complete: 3 draft products, 6 variants, 2 test users and 3 content blocks (existing records preserved).");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Seed failed.");
  process.exitCode = 1;
});


