const { getRiskLevel } = require("./riskEngine");
const { clamp } = require("../utils/validation");

const GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const FALLBACK_GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
    "gemini-flash-lite-latest"
];
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const aiCache = new Map();

async function getAiRiskAssessment({ input, weather, hazardContext, newsContext, risk, recommendations }) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY;
    const requestedModel = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

    if (!apiKey) {
        return {
            status: "not_configured",
            source: "Gemini API",
            model: requestedModel,
            message: "Set GEMINI_API_KEY in .env to enable AI risk scoring, explanations, and user tips.",
            baselineScore: risk.score,
            baselineLevel: risk.level,
            aiScore: null,
            aiLevel: null,
            confidence: 0,
            topDrivers: [],
            tips: [],
            actionPlan: [],
            newsFindings: []
        };
    }

    try {
        const prompt = buildAiRiskPrompt({ input, weather, hazardContext, newsContext, risk, recommendations });
        const cacheKey = getAiCacheKey(requestedModel, prompt);
        const cached = getCachedValue(aiCache, cacheKey, getAiCacheTtlMs());

        if (cached) {
            return {
                ...cached,
                cacheStatus: "hit"
            };
        }

        const result = await requestGeminiWithFallback({
            apiKey,
            requestedModel,
            prompt,
            timeoutMs: getTimeoutMs()
        });

        const assessment = normalizeAiAssessment(result.parsed, { risk, model: result.model, usageMetadata: result.data.usageMetadata });

        setCachedValue(aiCache, cacheKey, assessment);
        return assessment;
    } catch (error) {
        return {
            status: "error",
            source: "Gemini API",
            model: requestedModel,
            message: error.message,
            baselineScore: risk.score,
            baselineLevel: risk.level,
            aiScore: null,
            aiLevel: null,
            confidence: 0,
            topDrivers: [],
            tips: [],
            actionPlan: [],
            newsFindings: []
        };
    }
}

async function requestGeminiWithFallback({ apiKey, requestedModel, prompt, timeoutMs }) {
    const models = getGeminiModelCandidates(requestedModel);
    let lastError = null;

    for (const model of models) {
        try {
            const endpoint = `${GEMINI_GENERATE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
            const response = await fetchWithTimeout(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [{ text: prompt }]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.2,
                        maxOutputTokens: 1200,
                        responseMimeType: "application/json",
                        responseSchema: getGeminiResponseSchema()
                    }
                })
            }, timeoutMs);

            if (!response.ok) {
                const message = await getGeminiErrorMessage(response);
                const error = new Error(message);
                error.status = response.status;
                throw error;
            }

            const data = await response.json();
            const text = extractGeminiText(data);
            const parsed = parseGeminiJson(text);

            return { model, data, parsed };
        } catch (error) {
            lastError = error;

            if (error.status && !isRetryableGeminiStatus(error.status)) {
                break;
            }
        }
    }

    throw lastError || new Error("Gemini API request failed.");
}

function buildAiRiskPrompt({ input, weather, hazardContext, newsContext, risk, recommendations }) {
    const compactPayload = {
        task: "Estimate disaster risk for a decision-support prototype. Use the rule-based score as the baseline, then adjust only if the provided weather, hazard context, operator inputs, or news context justify it.",
        requiredOutput: {
            aiScore: "integer 0-100",
            confidence: "integer 0-100",
            scoreRationale: "short plain-language explanation",
            topDrivers: "array of 3-5 short strings",
            tips: "array of 4-6 practical user tips",
            actionPlan: "array of 3-5 objects with priority, action, and reason strings",
            newsFindings: "array of 0-5 short strings based only on supplied news articles"
        },
        guardrails: [
            "Return only valid JSON. Do not use markdown.",
            "Do not invent articles, official alerts, measurements, or location facts.",
            "Keep advice practical and non-alarmist.",
            "Say when news is unavailable or not configured.",
            "This is not an official emergency warning."
        ],
        baselineRisk: {
            disasterType: risk.disasterType,
            disasterLabel: risk.disasterLabel,
            score: risk.score,
            level: risk.level,
            explanation: risk.explanation,
            majorContributors: risk.majorContributors.map((factor) => ({
                key: factor.key,
                label: factor.label,
                level: factor.level,
                contribution: factor.contribution,
                reason: factor.reason
            })),
            dataQuality: risk.dataQuality
        },
        weather: compactWeather(weather),
        hazardContext: compactHazardContext(hazardContext),
        operatorInputs: {
            disasterType: input.disasterType,
            location: input.location,
            newsQuery: input.newsQuery,
            fieldReports: input.fieldReports,
            terrain: input.terrain,
            operations: input.operations,
            sensor: input.sensor,
            historical: input.historical
        },
        newsContext: compactNewsContext(newsContext),
        existingRecommendations: recommendations
    };

    return `Return a JSON object with keys aiScore, confidence, scoreRationale, topDrivers, tips, actionPlan, and newsFindings.\n\n${JSON.stringify(compactPayload, null, 2)}`;
}

function compactWeather(weather = {}) {
    weather = weather || {};

    return {
        temperature: weather.temperature,
        humidity: weather.humidity,
        rain: weather.rain,
        windSpeed: weather.windSpeed,
        windGusts: weather.windGusts,
        weatherCode: weather.weatherCode,
        updateTime: weather.updateTime,
        timezone: weather.timezone,
        forecast: weather.forecast
            ? {
                dailyPrecipitation: weather.forecast.dailyPrecipitation,
                maxTemperature: weather.forecast.maxTemperature,
                maxWindSpeed: weather.forecast.maxWindSpeed,
                maxWindGusts: weather.forecast.maxWindGusts,
                evapotranspiration: weather.forecast.evapotranspiration
            }
            : null
    };
}

function compactHazardContext(hazardContext = {}) {
    hazardContext = hazardContext || {};

    return {
        earthquakes: hazardContext.earthquakes
            ? {
                status: hazardContext.earthquakes.status,
                eventCount: hazardContext.earthquakes.eventCount,
                maxMagnitude: hazardContext.earthquakes.maxMagnitude,
                nearestDistanceKm: hazardContext.earthquakes.nearestDistanceKm
            }
            : null,
        fireHotspots: hazardContext.fireHotspots
            ? {
                status: hazardContext.fireHotspots.status,
                hotspotCount: hazardContext.fireHotspots.hotspotCount,
                highConfidenceCount: hazardContext.fireHotspots.highConfidenceCount,
                maxFrp: hazardContext.fireHotspots.maxFrp
            }
            : null,
        floodForecast: hazardContext.floodForecast
            ? {
                status: hazardContext.floodForecast.status,
                pressureIndex: hazardContext.floodForecast.pressureIndex,
                trendRatio: hazardContext.floodForecast.trendRatio,
                currentDischarge: hazardContext.floodForecast.currentDischarge,
                peakDischarge: hazardContext.floodForecast.peakDischarge
            }
            : null
    };
}

function compactNewsContext(newsContext = {}) {
    newsContext = newsContext || {};

    return {
        status: newsContext.status,
        query: newsContext.query,
        articleCount: newsContext.articleCount,
        riskSignals: newsContext.riskSignals,
        articles: Array.isArray(newsContext.articles)
            ? newsContext.articles.slice(0, 6).map((article) => ({
                title: article.title,
                description: article.description,
                publishedAt: article.publishedAt,
                source: article.source && article.source.name,
                url: article.url
            }))
            : []
    };
}

function getGeminiResponseSchema() {
    return {
        type: "object",
        properties: {
            aiScore: { type: "integer" },
            confidence: { type: "integer" },
            scoreRationale: { type: "string" },
            topDrivers: {
                type: "array",
                items: { type: "string" }
            },
            tips: {
                type: "array",
                items: { type: "string" }
            },
            actionPlan: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        priority: { type: "string" },
                        action: { type: "string" },
                        reason: { type: "string" }
                    },
                    required: ["priority", "action", "reason"]
                }
            },
            newsFindings: {
                type: "array",
                items: { type: "string" }
            }
        },
        required: ["aiScore", "confidence", "scoreRationale", "topDrivers", "tips", "actionPlan", "newsFindings"]
    };
}

function normalizeAiAssessment(parsed, { risk, model, usageMetadata }) {
    const aiScore = clamp(Math.round(Number(parsed.aiScore)), 0, 100);
    const confidence = clamp(Math.round(Number(parsed.confidence)), 0, 100);

    if (!Number.isFinite(aiScore)) {
        throw new Error("Gemini response did not include a valid aiScore.");
    }

    return {
        status: "ok",
        source: "Gemini API",
        model,
        cacheStatus: "miss",
        baselineScore: risk.score,
        baselineLevel: risk.level,
        aiScore,
        aiLevel: getRiskLevel(aiScore),
        confidence: Number.isFinite(confidence) ? confidence : 50,
        scoreDelta: aiScore - risk.score,
        scoreRationale: cleanText(parsed.scoreRationale, 700) || "Gemini returned an AI risk score from the supplied evidence.",
        topDrivers: cleanStringArray(parsed.topDrivers, 5, 160),
        tips: cleanStringArray(parsed.tips, 6, 180),
        actionPlan: cleanActionPlan(parsed.actionPlan),
        newsFindings: cleanStringArray(parsed.newsFindings, 5, 180),
        usageMetadata: usageMetadata || null,
        generatedAt: new Date().toISOString(),
        disclaimer: "AI assessment is decision support only and is not an official disaster warning."
    };
}

function parseGeminiJson(text) {
    const trimmed = String(text || "").trim();
    const withoutFence = trimmed
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
        throw new Error("Gemini response was not valid JSON.");
    }

    return JSON.parse(withoutFence.slice(start, end + 1));
}

function extractGeminiText(data) {
    const parts = data && data.candidates && data.candidates[0]
        && data.candidates[0].content && data.candidates[0].content.parts;

    if (!Array.isArray(parts)) {
        throw new Error("Gemini response did not include text.");
    }

    return parts.map((part) => part.text || "").join("").trim();
}

function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeout));
}

function getTimeoutMs() {
    const configured = Number(process.env.AI_TIMEOUT_MS);
    return Number.isFinite(configured) ? Math.max(1000, Math.min(30000, Math.round(configured))) : DEFAULT_TIMEOUT_MS;
}

function getAiCacheTtlMs() {
    const configured = Number(process.env.AI_CACHE_TTL_MS);
    return Number.isFinite(configured) ? Math.max(0, Math.min(30 * 60 * 1000, Math.round(configured))) : DEFAULT_CACHE_TTL_MS;
}

function getAiCacheKey(requestedModel, prompt) {
    return `${normalizeGeminiModelName(requestedModel)}:${hashText(prompt)}`;
}

function normalizeGeminiModelName(model) {
    return String(model || DEFAULT_GEMINI_MODEL).replace(/^models\//, "").trim() || DEFAULT_GEMINI_MODEL;
}

function getGeminiModelCandidates(requestedModel) {
    const normalized = normalizeGeminiModelName(requestedModel);
    return [...new Set([normalized, ...FALLBACK_GEMINI_MODELS.map(normalizeGeminiModelName)])];
}

function isRetryableGeminiStatus(status) {
    return [404, 429, 500, 502, 503, 504].includes(Number(status));
}

async function getGeminiErrorMessage(response) {
    const fallback = `Gemini API returned status ${response.status}.`;

    try {
        const data = await response.json();
        const message = data && data.error && data.error.message;
        return message ? `Gemini API returned status ${response.status}: ${message}` : fallback;
    } catch (error) {
        return fallback;
    }
}

function hashText(text) {
    let hash = 0;
    const value = String(text || "");

    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }

    return Math.abs(hash).toString(36);
}

function getCachedValue(cache, key, ttlMs) {
    if (ttlMs <= 0) {
        return null;
    }

    const cached = cache.get(key);

    if (!cached) {
        return null;
    }

    if (Date.now() - cached.createdAt > ttlMs) {
        cache.delete(key);
        return null;
    }

    return cached.value;
}

function setCachedValue(cache, key, value) {
    cache.set(key, {
        createdAt: Date.now(),
        value
    });
}

function cleanStringArray(value, maxItems, maxLength) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => cleanText(item, maxLength))
        .filter(Boolean)
        .slice(0, maxItems);
}

function cleanActionPlan(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item, index) => ({
            priority: cleanText(item && item.priority, 40) || `P${index + 1}`,
            action: cleanText(item && item.action, 180),
            reason: cleanText(item && item.reason, 180)
        }))
        .filter((item) => item.action)
        .slice(0, 5);
}

function cleanText(value, maxLength) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

module.exports = {
    buildAiRiskPrompt,
    getGeminiModelCandidates,
    getGeminiResponseSchema,
    getAiRiskAssessment,
    getAiCacheKey,
    isRetryableGeminiStatus,
    normalizeGeminiModelName,
    normalizeAiAssessment,
    parseGeminiJson
};
