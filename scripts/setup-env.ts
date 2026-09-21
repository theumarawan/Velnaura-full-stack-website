import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

// Exclusive creation prevents overwriting an existing developer's configuration.
const template = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const env = template
  .replace('ALLOW_DEV_SEED="false"', 'ALLOW_DEV_SEED="true"')
  .replace('SEED_CUSTOMER_PASSWORD=""', `SEED_CUSTOMER_PASSWORD="Aa1!${randomBytes(24).toString("base64url")}"`)
  .replace('SEED_ADMIN_PASSWORD=""', `SEED_ADMIN_PASSWORD="Aa1!${randomBytes(24).toString("base64url")}"`)
  .replace('AUTH_SECRET=""', `AUTH_SECRET="${randomBytes(32).toString("base64")}"`);
try {
  await writeFile(new URL("../.env", import.meta.url), env, { flag: "wx", mode: 0o600 });
  console.log("Created .env with local database settings and random development credentials. Keep it private.");
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "EEXIST") {
    console.log(".env already exists; left unchanged.");
  } else {
    throw error;
  }
}

