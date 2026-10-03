const { validateCoordinates } = require("../utils/validation");

const USGS_EARTHQUAKE_QUERY = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const FIRMS_AREA_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const OPEN_METEO_FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood";
const EARTHQUAKE_RADIUS_KM = 300;
const EARTHQUAKE_LOOKBACK_DAYS = 7;
const FIRE_SEARCH_BOX_DEGREES = 0.5;
const FLOOD_FORECAST_DAYS = 7;

async function getHazardContext(latitude, longitude, disasterType) {
    const validation = validateCoordinates(latitude, longitude);

    if (!validation.valid) {
        const error = new Error(validation.message);
        error.statusCode = 400;
        throw error;
    }

    const [earthquakes, fireHotspots, floodForecast] = await Promise.all([
        getEarthquakeContext(validation.latitude, validation.longitude),
        disasterType === "wildfire"
            ? getFireHotspotContext(validation.latitude, validation.longitude)
            : Promise.resolve(notChecked("NASA FIRMS is checked only for wildfire analysis.")),
        disasterType === "flood"
            ? getFloodForecastContext(validation.latitude, validation.longitude)
            : Promise.resolve(notChecked("Open-Meteo Flood API is checked only for flood analysis."))
    ]);

    return {
        earthquakes,
        fireHotspots,
        floodForecast,
        generatedAt: new Date().toISOString()
    };
}

async function getFloodForecastContext(latitude, longitude) {
    try {
        const params = new URLSearchParams({
            latitude,
            longitude,
            daily: [
                "river_discharge",
                "river_discharge_mean",
                "river_discharge_max",
                "river_discharge_p25",
                "river_discharge_p75"
            ].join(","),
            forecast_days: String(FLOOD_FORECAST_DAYS),
            cell_selection: "nearest"
        });
        const sourceUrl = `${OPEN_METEO_FLOOD_URL}?${params.toString()}`;
        const response = await fetch(sourceUrl);

        if (!response.ok) {
            throw new Error(`Open-Meteo Flood API returned status ${response.status}.`);
        }

        const data = await response.json();
        const daily = data.daily || {};
        const currentDischarge = getNumberAt(daily.river_discharge, 0);
        const peakDischarge = getMaxNumber(daily.river_discharge_max || daily.river_discharge);
        const meanPeakDischarge = getMaxNumber(daily.river_discharge_mean || daily.river_discharge);
        const p75PeakDischarge = getMaxNumber(daily.river_discharge_p75 || daily.river_discharge);
        const trendRatio = currentDischarge > 0 ? peakDischarge / currentDischarge : 0;
        const ensembleSpreadRatio = meanPeakDischarge > 0 ? Math.max(0, peakDischarge - p75PeakDischarge) / meanPeakDischarge : 0;
        const pressureIndex = clamp((trendRatio - 1) * 75 + ensembleSpreadRatio * 35, 0, 100);

        return {
            status: "ok",
            source: "Open-Meteo Global Flood API",
            sourceUrl,
            forecastDays: FLOOD_FORECAST_DAYS,
            currentDischarge,
            peakDischarge,
            meanPeakDischarge,
            p75PeakDischarge,
            trendRatio: round(trendRatio, 2),
            ensembleSpreadRatio: round(ensembleSpreadRatio, 2),
            pressureIndex: round(pressureIndex, 1),
            coordinates: {
                latitude: data.latitude,
                longitude: data.longitude
            },
            days: buildFloodDays(daily)
        };
    } catch (error) {
        return {
            status: "error",
            source: "Open-Meteo Global Flood API",
            sourceUrl: OPEN_METEO_FLOOD_URL,
            message: error.message,
            forecastDays: FLOOD_FORECAST_DAYS,
            currentDischarge: 0,
            peakDischarge: 0,
            trendRatio: 0,
            ensembleSpreadRatio: 0,
            pressureIndex: 0,
            days: []
        };
    }
}

async function getEarthquakeContext(latitude, longitude) {
    try {
        const params = new URLSearchParams({
            format: "geojson",
            latitude,
            longitude,
            maxradiuskm: EARTHQUAKE_RADIUS_KM,
            starttime: getPastDate(EARTHQUAKE_LOOKBACK_DAYS),
            minmagnitude: "1",
            orderby: "magnitude"
        });
        const sourceUrl = `${USGS_EARTHQUAKE_QUERY}?${params.toString()}`;
        const response = await fetch(sourceUrl);

        if (!response.ok) {
            throw new Error(`USGS returned status ${response.status}.`);
        }

        const data = await response.json();
        const events = Array.isArray(data.features) ? data.features : [];
        const nearby = events
            .map((event) => normalizeEarthquakeEvent(event, latitude, longitude))
            .filter((event) => event && event.distanceKm <= EARTHQUAKE_RADIUS_KM)
            .sort((a, b) => b.magnitude - a.magnitude);

        const nearest = nearby.slice().sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;

        return {
            status: "ok",
            source: "USGS Earthquake Query API",
            sourceUrl,
            lookbackDays: EARTHQUAKE_LOOKBACK_DAYS,
            searchRadiusKm: EARTHQUAKE_RADIUS_KM,
            eventCount: nearby.length,
            maxMagnitude: nearby[0] ? nearby[0].magnitude : 0,
            nearestDistanceKm: nearest ? nearest.distanceKm : 999,
            nearestEvent: nearest,
            strongestEvents: nearby.slice(0, 5)
        };
    } catch (error) {
        return {
            status: "error",
            source: "USGS Earthquake Query API",
            sourceUrl: USGS_EARTHQUAKE_QUERY,
            message: error.message,
            lookbackDays: EARTHQUAKE_LOOKBACK_DAYS,
            searchRadiusKm: EARTHQUAKE_RADIUS_KM,
            eventCount: 0,
            maxMagnitude: 0,
            nearestDistanceKm: 999,
            strongestEvents: []
        };
    }
}

async function getFireHotspotContext(latitude, longitude) {
    const mapKey = process.env.FIRMS_MAP_KEY || process.env.NASA_FIRMS_MAP_KEY;

    if (!mapKey) {
        return {
            status: "not_configured",
            source: "NASA FIRMS Area API",
            sourceUrl: "https://firms.modaps.eosdis.nasa.gov/api/",
            message: "Set FIRMS_MAP_KEY in .env to use free NASA FIRMS satellite fire hotspot data.",
            searchBoxDegrees: FIRE_SEARCH_BOX_DEGREES,
            hotspotCount: 0,
            highConfidenceCount: 0,
            maxFrp: 0,
            hotspots: []
        };
    }

    try {
        const box = buildBoundingBox(latitude, longitude, FIRE_SEARCH_BOX_DEGREES);
        const url = `${FIRMS_AREA_URL}/${encodeURIComponent(mapKey)}/VIIRS_SNPP_NRT/${box}/1`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`NASA FIRMS returned status ${response.status}.`);
        }

        const csv = await response.text();
        const rows = parseCsv(csv);
        const hotspots = rows
            .filter((row) => row.latitude && row.longitude)
            .map((row) => ({
                latitude: Number(row.latitude),
                longitude: Number(row.longitude),
                confidence: row.confidence || "unknown",
                frp: Number(row.frp || 0),
                date: row.acq_date,
                time: row.acq_time,
                distanceKm: round(distanceKm(latitude, longitude, Number(row.latitude), Number(row.longitude)), 1)
            }))
            .sort((a, b) => a.distanceKm - b.distanceKm);

        return {
            status: "ok",
            source: "NASA FIRMS Area API",
            sourceUrl: "https://firms.modaps.eosdis.nasa.gov/api/",
            searchBoxDegrees: FIRE_SEARCH_BOX_DEGREES,
            hotspotCount: hotspots.length,
            highConfidenceCount: hotspots.filter((item) => ["h", "high"].includes(String(item.confidence).toLowerCase())).length,
            maxFrp: Math.max(0, ...hotspots.map((item) => item.frp || 0)),
            hotspots: hotspots.slice(0, 10)
        };
    } catch (error) {
        return {
            status: "error",
            source: "NASA FIRMS Area API",
            sourceUrl: "https://firms.modaps.eosdis.nasa.gov/api/",
            message: error.message,
            searchBoxDegrees: FIRE_SEARCH_BOX_DEGREES,
            hotspotCount: 0,
            highConfidenceCount: 0,
            maxFrp: 0,
            hotspots: []
        };
    }
}

function notChecked(message) {
    return {
        status: "not_checked",
        message,
        pressureIndex: 0,
        hotspotCount: 0,
        highConfidenceCount: 0,
        maxFrp: 0,
        hotspots: []
    };
}

function buildFloodDays(daily) {
    if (!Array.isArray(daily.time)) {
        return [];
    }

    return daily.time.map((date, index) => ({
        date,
        riverDischarge: getNumberAt(daily.river_discharge, index),
        riverDischargeMean: getNumberAt(daily.river_discharge_mean, index),
        riverDischargeMax: getNumberAt(daily.river_discharge_max, index),
        riverDischargeP25: getNumberAt(daily.river_discharge_p25, index),
        riverDischargeP75: getNumberAt(daily.river_discharge_p75, index)
    }));
}

function getNumberAt(values, index) {
    if (!Array.isArray(values)) {
        return 0;
    }

    const numberValue = Number(values[index]);
    return Number.isFinite(numberValue) ? numberValue : 0;
}

function getMaxNumber(values) {
    if (!Array.isArray(values)) {
        return 0;
    }

    const numbers = values.map(Number).filter(Number.isFinite);
    return numbers.length > 0 ? Math.max(...numbers) : 0;
}

function normalizeEarthquakeEvent(event, latitude, longitude) {
    if (!event || !event.geometry || !Array.isArray(event.geometry.coordinates)) {
        return null;
    }

    const [eventLongitude, eventLatitude, depthKm] = event.geometry.coordinates;
    const magnitude = Number(event.properties && event.properties.mag);

    if (!Number.isFinite(eventLatitude) || !Number.isFinite(eventLongitude) || !Number.isFinite(magnitude)) {
        return null;
    }

    return {
        title: event.properties.title || "USGS earthquake event",
        magnitude,
        place: event.properties.place || "Unknown place",
        time: event.properties.time ? new Date(event.properties.time).toISOString() : null,
        url: event.properties.url || null,
        latitude: eventLatitude,
        longitude: eventLongitude,
        depthKm: Number(depthKm || 0),
        distanceKm: round(distanceKm(latitude, longitude, eventLatitude, eventLongitude), 1)
    };
}

function buildBoundingBox(latitude, longitude, delta) {
    const west = clampLongitude(longitude - delta);
    const south = Math.max(-90, latitude - delta);
    const east = clampLongitude(longitude + delta);
    const north = Math.min(90, latitude + delta);
    return [west, south, east, north].map((value) => round(value, 4)).join(",");
}

function clampLongitude(value) {
    return Math.max(-180, Math.min(180, value));
}

function parseCsv(csv) {
    const trimmed = String(csv || "").trim();

    if (!trimmed) {
        return [];
    }

    const lines = trimmed.split(/\r?\n/);

    if (lines.length < 2 || /^(Invalid|No )/i.test(lines[0])) {
        return [];
    }

    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
        const values = splitCsvLine(line);
        return headers.reduce((row, header, index) => {
            row[header] = values[index] || "";
            return row;
        }, {});
    });
}

function splitCsvLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];

        if (char === "\"") {
            inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
            values.push(current);
            current = "";
        } else {
            current += char;
        }
    }

    values.push(current);
    return values;
}

function distanceKm(lat1, lon1, lat2, lon2) {
    const radiusKm = 6371;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
    return value * Math.PI / 180;
}

function getPastDate(days) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
}

function round(value, digits) {
    const multiplier = 10 ** digits;
    return Math.round(value * multiplier) / multiplier;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

module.exports = {
    getEarthquakeContext,
    getFireHotspotContext,
    getFloodForecastContext,
    getHazardContext
};
