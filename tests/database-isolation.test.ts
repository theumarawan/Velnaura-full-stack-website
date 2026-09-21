import assert from "node:assert/strict";
import { test } from "node:test";
import { testDatabase } from "./test-database";

test("test databases use distinct isolated storage", { timeout: 120000 }, async () => {
  const first = await testDatabase();
  const second = await testDatabase();
  try {
    if (process.env.TEST_DATABASE_BACKEND === "postgres") {
      assert.ok(first.schema);
      assert.ok(second.schema);
      assert.notEqual(first.schema, second.schema);
    }
    await first.db.user.create({
      data: { email: "isolation@velnaura.test", passwordHash: "test-only-not-an-authenticated-account" },
    });
    assert.equal(await first.db.user.count(), 1);
    assert.equal(await second.db.user.count(), 0);
  } finally {
    await Promise.allSettled([first.close(), second.close()]);
  }
});
