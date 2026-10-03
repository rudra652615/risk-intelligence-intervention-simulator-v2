const assert = require("assert");

const { analyzeRisk } = require("../services/riskEngine");
const { generateRecommendations } = require("../services/recommendationEngine");
const { simulateIntervention } = require("../services/interventionSimulator");
const { validateCoordinates } = require("../utils/validation");

const sharedWeather = {
    temperature: 43,
    humidity: 24,
    precipitation: 0,
    rain: 0,
    windSpeed: 34,
    windGusts: 62,
    weatherCode: 1,
    forecast: {
        dailyPrecipitation: 0,
        maxTemperature: 45,
        maxWindSpeed: 36,
        maxWindGusts: 70,
        evapotranspiration: 7
    }
};

const sharedLocalInputs = {
    fieldReports: {
        cracks: true,
        slopeMovement: true,
        flooding: true,
        roadBlockage: true,
        buildingDamage: true,
        powerOutage: true,
        fireSmoke: true,
        medicalStress: true,
        waterShortage: true
    },
    terrain: {
        slopeRisk: "HIGH"
    },
    operations: {
        roadBlockage: "BLOCKED",
        infrastructureStatus: "DEGRADED",
        populationExposure: "HIGH",
        drainageCapacity: "POOR",
        riverLevel: "HIGH"
    },
    sensor: {
        soilMoisture: 82
    },
    historical: {
        eventCount: 4
    },
    hazardContext: {
        earthquakes: {
            status: "ok",
            eventCount: 4,
            maxMagnitude: 5.4,
            nearestDistanceKm: 32
        },
        fireHotspots: {
            status: "ok",
            hotspotCount: 8,
            highConfidenceCount: 3,
            maxFrp: 44
        },
        floodForecast: {
            status: "ok",
            pressureIndex: 58,
            trendRatio: 1.8,
            currentDischarge: 760,
            peakDischarge: 1370
        }
    }
};

["flood", "landslide", "storm", "heatwave", "wildfire", "earthquake", "drought"].forEach((disasterType) => {
    const risk = analyzeRisk({
        ...sharedLocalInputs,
        disasterType,
        weather: sharedWeather
    });
    const recommendations = generateRecommendations(risk);
    const simulation = simulateIntervention(risk);

    assert.strictEqual(risk.disasterType, disasterType);
    assert(risk.score >= 0 && risk.score <= 100, `${disasterType} score must be bounded.`);
    assert(risk.factors.length >= 6, `${disasterType} should include multiple weighted factors.`);
    assert(recommendations.length >= 2, `${disasterType} should return recommendations.`);
    assert(simulation.simulatedScore <= risk.score, `${disasterType} simulation should not increase risk.`);
    assert(simulation.confidence.score >= 20, `${disasterType} simulation should include confidence scoring.`);
    assert(simulation.simulatedScoreRange.low <= simulation.simulatedScore, `${disasterType} simulation should include a lower range.`);
    assert(simulation.simulatedScoreRange.high >= simulation.simulatedScore, `${disasterType} simulation should include an upper range.`);
    assert(simulation.disclaimer.includes("do not change real weather"));
});

const floodRisk = analyzeRisk({
    ...sharedLocalInputs,
    disasterType: "flood",
    weather: sharedWeather
});

assert(floodRisk.factors.some((factor) => factor.key === "riverDischargeForecast"));

const earthquakeRisk = analyzeRisk({
    ...sharedLocalInputs,
    disasterType: "earthquake",
    weather: sharedWeather
});

assert(earthquakeRisk.factors.some((factor) => factor.key === "earthquakeMagnitude"));
assert(earthquakeRisk.score >= 50, "Earthquake test input should produce high enough risk to show simulator value.");

const delhiCoordinates = validateCoordinates("28.6139 N", "77.2090 E");
assert.strictEqual(delhiCoordinates.valid, true);
assert.strictEqual(delhiCoordinates.latitude, 28.6139);
assert.strictEqual(delhiCoordinates.longitude, 77.209);

const westernCoordinates = validateCoordinates("40.7128 N", "74.0060 W");
assert.strictEqual(westernCoordinates.valid, true);
assert.strictEqual(westernCoordinates.latitude, 40.7128);
assert.strictEqual(westernCoordinates.longitude, -74.006);

const decimalCoordinates = validateCoordinates("-33.8688", "151.2093");
assert.strictEqual(decimalCoordinates.valid, true);
assert.strictEqual(decimalCoordinates.latitude, -33.8688);
assert.strictEqual(decimalCoordinates.longitude, 151.2093);

const invalidLatitudeDirection = validateCoordinates("28.6139 E", "77.2090 E");
assert.strictEqual(invalidLatitudeDirection.valid, false);

console.log("riskEngine.test.js passed");
