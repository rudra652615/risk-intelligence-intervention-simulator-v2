const assert = require("assert");

const { getWeatherByCoordinates } = require("../services/weatherService");

function createWeatherResponse() {
    return {
        ok: true,
        status: 200,
        json: async () => ({
            current: {
                temperature_2m: 25,
                relative_humidity_2m: 60,
                precipitation: 0,
                rain: 0,
                wind_speed_10m: 10,
                wind_gusts_10m: 15,
                weather_code: 1,
                time: "2026-10-12T12:00"
            },
            daily: {
                time: ["2026-10-12"],
                precipitation_sum: [2],
                temperature_2m_max: [27],
                wind_speed_10m_max: [12],
                wind_gusts_10m_max: [18],
                weather_code: [1]
            },
            timezone: "Asia/Kolkata",
            latitude: 28.5,
            longitude: 77.1
        })
    };
}

async function run() {
    const originalFetch = global.fetch;

    try {
        let requestCount = 0;
        global.fetch = async () => {
            requestCount += 1;
            return createWeatherResponse();
        };

        const first = await getWeatherByCoordinates(12.34561, 45.67891);
        const second = await getWeatherByCoordinates(12.34561, 45.67891);

        assert.strictEqual(first.cacheStatus, "miss");
        assert.strictEqual(second.cacheStatus, "hit");
        assert.strictEqual(requestCount, 1, "repeated coordinates should use the short-lived cache");

        let concurrentRequestCount = 0;
        global.fetch = async () => {
            concurrentRequestCount += 1;
            await new Promise((resolve) => setTimeout(resolve, 10));
            return createWeatherResponse();
        };

        const concurrentResults = await Promise.all([
            getWeatherByCoordinates(13.57912, 46.89123),
            getWeatherByCoordinates(13.57912, 46.89123)
        ]);
        assert.strictEqual(concurrentRequestCount, 1, "concurrent requests for one location should be coalesced");
        assert(concurrentResults.every((result) => result.temperature === 25));

        global.fetch = async () => ({
            ok: false,
            status: 429,
            headers: { get: (name) => name === "retry-after" ? "60" : null }
        });

        await assert.rejects(
            getWeatherByCoordinates(14.68023, 47.90234),
            (error) => error.statusCode === 429
                && error.retryAfterSeconds === 60
                && error.message.includes("rate limit")
                && error.message.includes("60 seconds")
        );
    } finally {
        global.fetch = originalFetch;
    }

    console.log("weatherService.test.js passed");
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
