const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function createDailySearchLimit({ filePath, limit = 15 }) {
    if (!filePath || !Number.isInteger(limit) || limit < 1) {
        throw new Error("A storage file path and positive integer daily limit are required.");
    }

    const storagePath = path.resolve(filePath);

    return {
        consume,
        getStatus
    };

    function consume(clientId, now = new Date()) {
        const state = loadState();
        const day = getUtcDay(now);
        const pruned = pruneOldDays(state, day);
        const clientKey = hashClientId(state.secret, clientId);
        const used = state.days[day][clientKey] || 0;

        if (used >= limit) {
            if (pruned) {
                persistState(state);
            }
            return { ...buildStatus(used, now), allowed: false };
        }

        const nextUsed = used + 1;
        state.days[day][clientKey] = nextUsed;
        persistState(state);
        return { ...buildStatus(nextUsed, now), allowed: true };
    }

    function getStatus(clientId, now = new Date()) {
        const state = loadState();
        const day = getUtcDay(now);
        const changed = pruneOldDays(state, day);

        if (changed) {
            persistState(state);
        }

        const clientKey = hashClientId(state.secret, clientId);
        return buildStatus(state.days[day][clientKey] || 0, now);
    }

    function loadState() {
        let contents;

        try {
            contents = fs.readFileSync(storagePath, "utf8");
        } catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }

            const state = {
                version: 1,
                secret: crypto.randomBytes(32).toString("hex"),
                days: {}
            };
            persistState(state);
            return state;
        }

        let state;
        try {
            state = JSON.parse(contents);
        } catch (error) {
            throw new Error(`Daily search limit storage is invalid JSON: ${error.message}`);
        }

        if (!state || state.version !== 1 || typeof state.secret !== "string"
            || !/^[a-f0-9]{64}$/.test(state.secret) || !state.days || typeof state.days !== "object"
            || Array.isArray(state.days)) {
            throw new Error("Daily search limit storage has an unsupported or invalid format.");
        }

        return state;
    }

    function persistState(state) {
        fs.mkdirSync(path.dirname(storagePath), { recursive: true });
        const temporaryPath = `${storagePath}.${process.pid}.tmp`;

        try {
            fs.writeFileSync(temporaryPath, JSON.stringify(state), { mode: 0o600 });
            fs.renameSync(temporaryPath, storagePath);
        } finally {
            if (fs.existsSync(temporaryPath)) {
                fs.unlinkSync(temporaryPath);
            }
        }
    }

    function pruneOldDays(state, currentDay) {
        const oldDays = Object.keys(state.days).filter((day) => day !== currentDay);

        if (oldDays.length === 0) {
            if (!state.days[currentDay]) {
                state.days[currentDay] = {};
                return true;
            }
            return false;
        }

        oldDays.forEach((day) => {
            delete state.days[day];
        });
        if (!state.days[currentDay]) {
            state.days[currentDay] = {};
        }
        return true;
    }

    function hashClientId(secret, clientId) {
        if (typeof clientId !== "string" || !clientId.trim()) {
            throw new Error("Could not determine the client IP for daily search limits.");
        }

        return crypto.createHmac("sha256", secret).update(clientId.trim()).digest("hex");
    }

    function buildStatus(used, now) {
        const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
        return {
            limit,
            used,
            remaining: Math.max(0, limit - used),
            resetAt: nextReset.toISOString()
        };
    }
}

function getUtcDay(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        throw new Error("A valid date is required to track daily searches.");
    }

    return date.toISOString().slice(0, 10);
}

module.exports = {
    createDailySearchLimit
};
