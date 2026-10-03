const API_KEYS = {
    firmsMapKey: ["FIRMS_MAP_KEY", "NASA_FIRMS_MAP_KEY"],
    gnewsApiKey: ["GNEWS_API_KEY", "GNEWS_KEY"],
    geminiApiKey: ["GEMINI_API_KEY", "GOOGLE_AI_API_KEY", "GOOGLE_API_KEY"]
};

function getApiKeyStatus(environment = process.env) {
    return Object.fromEntries(
        Object.entries(API_KEYS).map(([key, aliases]) => [
            key,
            aliases.some((alias) => Boolean(environment[alias]))
        ])
    );
}

function updateApiKeys(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("Provide an API key settings object.");
    }

    const allowedFields = new Set([...Object.keys(API_KEYS), "clear"]);
    const unexpectedField = Object.keys(body).find((field) => !allowedFields.has(field));

    if (unexpectedField) {
        throw new Error("Unsupported API key setting.");
    }

    const clear = body.clear === undefined ? [] : body.clear;

    if (!Array.isArray(clear) || clear.some((key) => !Object.hasOwn(API_KEYS, key))) {
        throw new Error("The clear field must contain supported API key names.");
    }

    for (const [key, aliases] of Object.entries(API_KEYS)) {
        const shouldClear = clear.includes(key);
        const value = body[key];

        if (shouldClear && value !== undefined && String(value).trim()) {
            throw new Error(`Provide a new ${key} value or clear it, not both.`);
        }

        if (shouldClear) {
            aliases.forEach((alias) => {
                process.env[alias] = "";
            });
            continue;
        }

        if (value === undefined || value === "") {
            continue;
        }

        if (typeof value !== "string" || value.length > 4096 || !value.trim()) {
            throw new Error(`${key} must be a non-empty string of at most 4096 characters.`);
        }

        aliases.forEach((alias) => {
            process.env[alias] = value.trim();
        });
    }
}

function isTrustedLocalRequest(req) {
    const address = String(req.socket && req.socket.remoteAddress || "").toLowerCase();
    const isLoopbackAddress = address === "::1"
        || address === "127.0.0.1"
        || address.startsWith("::ffff:127.");

    if (!isLoopbackAddress || !req.get("origin") || !req.get("host")) {
        return false;
    }

    try {
        const origin = new URL(req.get("origin"));
        const hostname = origin.hostname.toLowerCase().replace(/^\[|\]$/g, "");
        const isLoopbackHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

        return origin.protocol === "http:"
            && isLoopbackHost
            && origin.host.toLowerCase() === req.get("host").toLowerCase();
    } catch (error) {
        return false;
    }
}

module.exports = {
    getApiKeyStatus,
    isTrustedLocalRequest,
    updateApiKeys
};
