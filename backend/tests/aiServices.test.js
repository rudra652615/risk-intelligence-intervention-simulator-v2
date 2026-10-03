const assert = require("assert");

const { getApiKeyStatus, isTrustedLocalRequest, updateApiKeys } = require("../utils/apiKeySettings");
const { buildNewsQuery, buildRiskSignals, normalizeNewsArticles } = require("../services/newsService");
const { buildAiRiskPrompt, getGeminiModelCandidates, getGeminiResponseSchema, isRetryableGeminiStatus, normalizeAiAssessment, parseGeminiJson } = require("../services/aiRiskService");

const query = buildNewsQuery({
    disasterType: "flood",
    locationName: "Delhi Yamuna",
    latitude: 28.6139,
    longitude: 77.209
});

assert(query.includes("Delhi Yamuna"), "news query should include the operator location name.");
assert(query.includes("flood"), "news query should include disaster keywords.");

const candidates = getGeminiModelCandidates("models/gemini-2.0-flash");
assert.strictEqual(candidates[0], "gemini-2.0-flash");
assert(candidates.includes("gemini-2.5-flash"), "Gemini fallback list should include a current flash model.");
assert.strictEqual(isRetryableGeminiStatus(503), true);
assert.strictEqual(isRetryableGeminiStatus(403), false);
assert(getGeminiResponseSchema().required.includes("actionPlan"));

const articles = normalizeNewsArticles([
    {
        title: "Flood warning issued after heavy rain",
        description: "Emergency teams monitor overflow-prone areas.",
        content: "Residents are asked to avoid flooded roads.",
        url: "https://example.com/flood",
        publishedAt: new Date().toISOString(),
        source: { name: "Example News", url: "https://example.com" }
    }
]);
const signals = buildRiskSignals(articles);

assert.strictEqual(articles.length, 1);
assert.strictEqual(signals.relevantArticleCount, 1);
assert(signals.recentArticleCount >= 1, "recent article should be counted.");
assert(signals.highSeverityMentionCount >= 1, "severity terms should be counted.");

const parsed = parseGeminiJson("```json\n{\"aiScore\":64,\"confidence\":73,\"scoreRationale\":\"Rain and road impacts are elevated.\",\"topDrivers\":[\"Heavy rain\"],\"tips\":[\"Avoid low roads\"],\"actionPlan\":[{\"priority\":\"P1\",\"action\":\"Check low roads\",\"reason\":\"Flooding was reported\"}],\"newsFindings\":[\"Local warning reported\"]}\n```");
const assessment = normalizeAiAssessment(parsed, {
    risk: {
        score: 58,
        level: "HIGH"
    },
    model: "test-model",
    usageMetadata: null
});

assert.strictEqual(assessment.status, "ok");
assert.strictEqual(assessment.aiScore, 64);
assert.strictEqual(assessment.aiLevel, "HIGH");
assert.strictEqual(assessment.scoreDelta, 6);
assert.deepStrictEqual(assessment.topDrivers, ["Heavy rain"]);
assert.strictEqual(assessment.actionPlan.length, 1);
assert.strictEqual(assessment.actionPlan[0].action, "Check low roads");

assert.doesNotThrow(() => buildAiRiskPrompt({
    input: { disasterType: "flood", location: null, newsQuery: "Delhi", fieldReports: {}, terrain: {}, operations: {}, sensor: {}, historical: {} },
    weather: null,
    hazardContext: null,
    newsContext: null,
    risk: { disasterType: "flood", disasterLabel: "Flood", score: 35, level: "MODERATE", explanation: "test", majorContributors: [], dataQuality: [] },
    recommendations: []
}), "AI prompt builder should tolerate missing optional context.");

const environment = {
    FIRMS_MAP_KEY: "",
    NASA_FIRMS_MAP_KEY: "",
    GNEWS_API_KEY: "",
    GNEWS_KEY: "",
    GEMINI_API_KEY: "",
    GOOGLE_AI_API_KEY: "",
    GOOGLE_API_KEY: ""
};
assert.deepStrictEqual(getApiKeyStatus(environment), {
    firmsMapKey: false,
    gnewsApiKey: false,
    geminiApiKey: false
});
environment.NASA_FIRMS_MAP_KEY = "configured";
assert.strictEqual(getApiKeyStatus(environment).firmsMapKey, true);

const originalApiKeyEnvironment = Object.fromEntries(
    ["FIRMS_MAP_KEY", "NASA_FIRMS_MAP_KEY", "GNEWS_API_KEY", "GNEWS_KEY", "GEMINI_API_KEY", "GOOGLE_AI_API_KEY", "GOOGLE_API_KEY"]
        .map((key) => [key, process.env[key]])
);
try {
    updateApiKeys({
        firmsMapKey: " firms-test-key ",
        gnewsApiKey: "gnews-test-key",
        geminiApiKey: "gemini-test-key"
    });
    assert.deepStrictEqual(getApiKeyStatus(), {
        firmsMapKey: true,
        gnewsApiKey: true,
        geminiApiKey: true
    });
    assert.strictEqual(process.env.NASA_FIRMS_MAP_KEY, "firms-test-key");
    assert.strictEqual(process.env.GOOGLE_API_KEY, "gemini-test-key");
    updateApiKeys({ clear: ["firmsMapKey", "gnewsApiKey", "geminiApiKey"] });
    assert.deepStrictEqual(getApiKeyStatus(), {
        firmsMapKey: false,
        gnewsApiKey: false,
        geminiApiKey: false
    });
    assert.throws(() => updateApiKeys({ apiKey: "unexpected" }), /Unsupported API key setting/);
    assert.throws(() => updateApiKeys({ geminiApiKey: 42 }), /must be a non-empty string/);
} finally {
    Object.entries(originalApiKeyEnvironment).forEach(([key, value]) => {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    });
}

const localRequest = {
    socket: { remoteAddress: "::ffff:127.0.0.1" },
    get: (header) => ({
        origin: "http://localhost:3000",
        host: "localhost:3000"
    })[header]
};
assert.strictEqual(isTrustedLocalRequest(localRequest), true);
assert.strictEqual(isTrustedLocalRequest({
    ...localRequest,
    get: (header) => ({
        origin: "https://attacker.example",
        host: "localhost:3000"
    })[header]
}), false);
assert.strictEqual(isTrustedLocalRequest({
    ...localRequest,
    socket: { remoteAddress: "192.168.1.20" }
}), false);

console.log("aiServices.test.js passed");
