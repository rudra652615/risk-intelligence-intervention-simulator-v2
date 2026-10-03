const { validateCoordinates } = require("../utils/validation");

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

async function getWeatherByCoordinates(latitude, longitude) {
    const validation = validateCoordinates(latitude, longitude);

    if (!validation.valid) {
        const error = new Error(validation.message);
        error.statusCode = 400;
        throw error;
    }

    const params = new URLSearchParams({
        latitude: validation.latitude,
        longitude: validation.longitude,
        current: [
            "temperature_2m",
            "relative_humidity_2m",
            "precipitation",
            "rain",
            "wind_speed_10m",
            "wind_gusts_10m",
            "weather_code"
        ].join(","),
        daily: [
            "temperature_2m_max",
            "precipitation_sum",
            "wind_speed_10m_max",
            "wind_gusts_10m_max",
            "weather_code",
            "uv_index_max",
            "et0_fao_evapotranspiration"
        ].join(","),
        timezone: "auto",
        forecast_days: "3",
        wind_speed_unit: "kmh",
        precipitation_unit: "mm"
    });

    const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`);

    if (!response.ok) {
        const error = new Error(`Open-Meteo returned status ${response.status}.`);
        error.statusCode = 502;
        throw error;
    }

    const apiData = await response.json();
    validateWeatherResponse(apiData);

    const current = apiData.current;
    const daily = apiData.daily || {};
    const days = buildDailyForecast(daily);

    return {
        temperature: current.temperature_2m,
        humidity: current.relative_humidity_2m,
        precipitation: current.precipitation,
        rain: current.rain,
        windSpeed: current.wind_speed_10m,
        windGusts: current.wind_gusts_10m,
        weatherCode: current.weather_code,
        updateTime: current.time,
        timezone: apiData.timezone,
        forecast: {
            todayPrecipitation: getDailyValue(daily.precipitation_sum, 0),
            dailyPrecipitation: getMaxDailyValue(daily.precipitation_sum),
            maxTemperature: getMaxDailyValue(daily.temperature_2m_max),
            maxWindSpeed: getMaxDailyValue(daily.wind_speed_10m_max),
            maxWindGusts: getMaxDailyValue(daily.wind_gusts_10m_max),
            maxUvIndex: getMaxDailyValue(daily.uv_index_max),
            evapotranspiration: getMaxDailyValue(daily.et0_fao_evapotranspiration),
            weatherCode: getMaxDailyValue(daily.weather_code),
            days
        },
        coordinates: {
            latitude: apiData.latitude,
            longitude: apiData.longitude
        },
        source: "Open-Meteo Forecast API",
        sourceUrl: "https://open-meteo.com/"
    };
}

function getDailyValue(values, index) {
    return Array.isArray(values) && values[index] !== undefined ? values[index] : null;
}

function getMaxDailyValue(values) {
    if (!Array.isArray(values) || values.length === 0) {
        return null;
    }

    const numericValues = values.map(Number).filter(Number.isFinite);
    return numericValues.length > 0 ? Math.max(...numericValues) : null;
}

function buildDailyForecast(daily) {
    if (!Array.isArray(daily.time)) {
        return [];
    }

    return daily.time.map((date, index) => ({
        date,
        precipitation: getDailyValue(daily.precipitation_sum, index),
        maxTemperature: getDailyValue(daily.temperature_2m_max, index),
        maxWindSpeed: getDailyValue(daily.wind_speed_10m_max, index),
        maxWindGusts: getDailyValue(daily.wind_gusts_10m_max, index),
        weatherCode: getDailyValue(daily.weather_code, index)
    }));
}

function validateWeatherResponse(data) {
    if (!data || !data.current) {
        const error = new Error("Open-Meteo returned an invalid weather response.");
        error.statusCode = 502;
        throw error;
    }

    const requiredFields = [
        "temperature_2m",
        "relative_humidity_2m",
        "precipitation",
        "rain",
        "wind_speed_10m",
        "wind_gusts_10m",
        "weather_code",
        "time"
    ];

    const missingField = requiredFields.find((field) => {
        return data.current[field] === undefined || data.current[field] === null;
    });

    if (missingField) {
        const error = new Error(`Open-Meteo response is missing ${missingField}.`);
        error.statusCode = 502;
        throw error;
    }
}

module.exports = {
    getWeatherByCoordinates
};
