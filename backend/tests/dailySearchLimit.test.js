const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createDailySearchLimit } = require("../utils/dailySearchLimit");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "daily-search-limit-"));

try {
    const storagePath = path.join(temporaryDirectory, "limits.json");
    const firstServer = createDailySearchLimit({ filePath: storagePath, limit: 15 });
    const monday = new Date("2026-10-12T12:00:00.000Z");

    assert.deepStrictEqual(firstServer.getStatus("203.0.113.10", monday), {
        limit: 15,
        used: 0,
        remaining: 15,
        resetAt: "2026-10-13T00:00:00.000Z"
    });

    for (let search = 1; search <= 15; search += 1) {
        const status = firstServer.consume("203.0.113.10", monday);
        assert.strictEqual(status.allowed, true, `search ${search} should be allowed`);
        assert.strictEqual(status.used, search);
        assert.strictEqual(status.remaining, 15 - search);
    }

    const blocked = firstServer.consume("203.0.113.10", monday);
    assert.strictEqual(blocked.allowed, false);
    assert.strictEqual(blocked.used, 15);
    assert.strictEqual(blocked.remaining, 0);

    const persistedData = fs.readFileSync(storagePath, "utf8");
    assert(!persistedData.includes("203.0.113.10"), "client IP should not be stored in plaintext");
    const restartedServer = createDailySearchLimit({ filePath: storagePath, limit: 15 });
    assert.strictEqual(restartedServer.getStatus("203.0.113.10", monday).used, 15);
    assert.strictEqual(restartedServer.consume("203.0.113.11", monday).allowed, true);

    const nextUtcDay = new Date("2026-10-13T00:00:00.000Z");
    const resetStatus = restartedServer.getStatus("203.0.113.10", nextUtcDay);
    assert.strictEqual(resetStatus.used, 0);
    assert.strictEqual(resetStatus.remaining, 15);
    assert.strictEqual(resetStatus.resetAt, "2026-10-14T00:00:00.000Z");

    const invalidStoragePath = path.join(temporaryDirectory, "invalid.json");
    fs.writeFileSync(invalidStoragePath, "not-json");
    const invalidStorageLimiter = createDailySearchLimit({ filePath: invalidStoragePath });
    assert.throws(() => invalidStorageLimiter.getStatus("203.0.113.10", monday), /invalid JSON/);
    assert.throws(() => createDailySearchLimit({ filePath: storagePath, limit: 0 }), /positive integer/);

    console.log("dailySearchLimit.test.js passed");
} finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
