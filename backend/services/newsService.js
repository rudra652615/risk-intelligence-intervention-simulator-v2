const { DISASTER_TYPES } = require("../config/riskRules");

const GNEWS_SEARCH_URL = "https://gnews.io/api/v4/search";
const DEFAULT_NEWS_LANGUAGE = "en";
const DEFAULT_MAX_ARTICLES = 6;
const DEFAULT_TIMEOUT_MS = 9000;
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const newsCache = new Map();

const DISASTER_NEWS_TERMS = {
    flood: ["flood", "waterlogging", "heavy rain", "river overflow"],
    landslide: ["landslide", "slope failure", "rockfall", "mudslide"],
    storm: ["storm", "cyclone", "high wind", "severe weather"],
    heatwave: ["heatwave", "extreme heat", "heat alert", "heat illness"],
    wildfire: ["wildfire", "forest fire", "fire smoke", "fire evacuation"],
    earthquake: ["earthquake", "tremor", "seismic", "aftershock"],
    drought: ["drought", "water shortage", "rainfall deficit", "crop stress"]
};

async function getNewsContext({ latitude, longitude, disasterType, locationName }) {
    const apiKey = process.env.GNEWS_API_KEY || process.env.GNEWS_KEY;
    const query = buildNewsQuery({ disasterType, locationName, latitude, longitude });

    if (!apiKey) {
        return {
            status: "not_configured",
            source: "GNews API",
            sourceUrl: "https://gnews.io/",
            message: "Set GNEWS_API_KEY in .env to add recent news context to AI risk scoring.",
            query,
            articleCount: 0,
            riskSignals: buildRiskSignals([]),
            articles: []
        };
    }

    try {
        const cacheKey = getNewsCacheKey(query);
        const cached = getCachedValue(newsCache, cacheKey, getNewsCacheTtlMs());

        if (cached) {
            return {
                ...cached,
                cacheStatus: "hit"
            };
        }

        const params = new URLSearchParams({
            q: query,
            lang: process.env.GNEWS_LANGUAGE || DEFAULT_NEWS_LANGUAGE,
            max: String(getMaxArticles()),
            sortby: "publishedAt",
            apikey: apiKey
        });
        const country = String(process.env.GNEWS_COUNTRY || "").trim().toLowerCase();

        if (country) {
            params.set("country", country);
        }

        const requestUrl = `${GNEWS_SEARCH_URL}?${params.toString()}`;
        const response = await fetchWithTimeout(requestUrl, getTimeoutMs());

        if (!response.ok) {
            throw new Error(`GNews API returned status ${response.status}.`);
        }

        const data = await response.json();
        const articles = normalizeNewsArticles(data.articles);

        const newsContext = {
            status: "ok",
            source: "GNews API",
            sourceUrl: sanitizeSourceUrl(requestUrl),
            cacheStatus: "miss",
            query,
            language: params.get("lang"),
            country: country || "any",
            totalArticles: Number(data.totalArticles || articles.length),
            articleCount: articles.length,
            riskSignals: buildRiskSignals(articles),
            articles
        };

        setCachedValue(newsCache, cacheKey, newsContext);
        return newsContext;
    } catch (error) {
        return {
            status: "error",
            source: "GNews API",
            sourceUrl: GNEWS_SEARCH_URL,
            message: error.message,
            query,
            articleCount: 0,
            riskSignals: buildRiskSignals([]),
            articles: []
        };
    }
}

function buildNewsQuery({ disasterType, locationName, latitude, longitude }) {
    const normalizedType = String(disasterType || "flood").toLowerCase();
    const label = DISASTER_TYPES[normalizedType] || DISASTER_TYPES.flood;
    const terms = DISASTER_NEWS_TERMS[normalizedType] || DISASTER_NEWS_TERMS.flood;
    const place = sanitizeQueryText(locationName || process.env.DEFAULT_NEWS_LOCATION || "");
    const hazardTerms = terms.slice(0, 3).map((term) => `"${term}"`).join(" OR ");

    if (place) {
        return limitQueryLength(`"${place}" (${hazardTerms})`);
    }

    const coordinateHint = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
        ? `"${Number(latitude).toFixed(3)}, ${Number(longitude).toFixed(3)}"`
        : "";

    return limitQueryLength([coordinateHint, `"${label}"`, hazardTerms, "risk"].filter(Boolean).join(" OR "));
}

function normalizeNewsArticles(articles) {
    if (!Array.isArray(articles)) {
        return [];
    }

    return articles.slice(0, getMaxArticles()).map((article) => ({
        title: cleanText(article.title, 180),
        description: cleanText(article.description, 320),
        content: cleanText(article.content, 500),
        url: typeof article.url === "string" ? article.url : null,
        image: typeof article.image === "string" ? article.image : null,
        publishedAt: article.publishedAt || null,
        source: {
            name: cleanText(article.source && article.source.name, 120),
            url: article.source && typeof article.source.url === "string" ? article.source.url : null
        }
    }));
}

function buildRiskSignals(articles) {
    const joinedText = articles
        .map((article) => [article.title, article.description, article.content].filter(Boolean).join(" "))
        .join(" ")
        .toLowerCase();
    const highSeverityTerms = [
        "evacuation",
        "dead",
        "death",
        "injured",
        "warning",
        "alert",
        "red alert",
        "emergency",
        "collapsed",
        "overflow",
        "record",
        "severe"
    ];
    const matchedSeverityTerms = highSeverityTerms.filter((term) => joinedText.includes(term));
    const recentArticleCount = articles.filter((article) => isRecent(article.publishedAt)).length;

    return {
        relevantArticleCount: articles.length,
        recentArticleCount,
        highSeverityMentionCount: matchedSeverityTerms.length,
        matchedSeverityTerms: matchedSeverityTerms.slice(0, 8)
    };
}

function isRecent(publishedAt) {
    const date = new Date(publishedAt);

    if (Number.isNaN(date.getTime())) {
        return false;
    }

    const ageMs = Date.now() - date.getTime();
    return ageMs >= 0 && ageMs <= 72 * 60 * 60 * 1000;
}

function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, { signal: controller.signal })
        .finally(() => clearTimeout(timeout));
}

function getMaxArticles() {
    const configured = Number(process.env.GNEWS_MAX_ARTICLES);
    return Number.isFinite(configured) ? Math.max(1, Math.min(10, Math.round(configured))) : DEFAULT_MAX_ARTICLES;
}

function getTimeoutMs() {
    const configured = Number(process.env.NEWS_TIMEOUT_MS);
    return Number.isFinite(configured) ? Math.max(1000, Math.min(20000, Math.round(configured))) : DEFAULT_TIMEOUT_MS;
}

function getNewsCacheTtlMs() {
    const configured = Number(process.env.NEWS_CACHE_TTL_MS);
    return Number.isFinite(configured) ? Math.max(0, Math.min(60 * 60 * 1000, Math.round(configured))) : DEFAULT_CACHE_TTL_MS;
}

function getNewsCacheKey(query) {
    return JSON.stringify({
        query,
        language: process.env.GNEWS_LANGUAGE || DEFAULT_NEWS_LANGUAGE,
        country: String(process.env.GNEWS_COUNTRY || "").trim().toLowerCase(),
        max: getMaxArticles()
    });
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

function sanitizeQueryText(value) {
    return cleanText(value, 80).replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
}

function limitQueryLength(query) {
    return query.length > 190 ? `${query.slice(0, 187)}...` : query;
}

function cleanText(value, maxLength) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function sanitizeSourceUrl(url) {
    const parsed = new URL(url);
    parsed.searchParams.delete("apikey");
    return parsed.toString();
}

module.exports = {
    buildNewsQuery,
    buildRiskSignals,
    getNewsCacheKey,
    getNewsContext,
    normalizeNewsArticles
};
