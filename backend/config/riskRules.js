const RISK_LEVELS = [
    { min: 75, level: "CRITICAL" },
    { min: 50, level: "HIGH" },
    { min: 25, level: "MODERATE" },
    { min: 0, level: "LOW" }
];

const DISASTER_TYPES = {
    flood: "Flood / Urban Waterlogging",
    landslide: "Landslide",
    storm: "Storm / Cyclone",
    heatwave: "Heatwave",
    wildfire: "Wildfire",
    earthquake: "Earthquake",
    drought: "Drought"
};

// Explainable prototype rules for Rudra's module. These are not official warning standards.
const FACTOR_RULES = {
    rain: {
        label: "Current Rainfall",
        unit: "mm",
        thresholds: [
            { max: 0.5, level: "LOW", score: 5, reason: "Little or no current rainfall." },
            { max: 8, level: "MODERATE", score: 40, reason: "Rain can start waterlogging in vulnerable places." },
            { max: 20, level: "HIGH", score: 72, reason: "Heavy current rain increases flood and slope risk." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Very intense rain can rapidly worsen local conditions." }
        ]
    },
    dailyPrecipitation: {
        label: "Forecast Daily Precipitation",
        unit: "mm",
        thresholds: [
            { max: 2, level: "LOW", score: 8, reason: "Daily precipitation forecast is low." },
            { max: 25, level: "MODERATE", score: 42, reason: "Forecast rain may affect drainage and exposed routes." },
            { max: 65, level: "HIGH", score: 75, reason: "Heavy forecast rain can stress drainage, roads, and slopes." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Extreme forecast rain needs high-priority monitoring." }
        ]
    },
    precipitationDeficit: {
        label: "Rainfall Deficit",
        unit: "0-100",
        thresholds: [
            { max: 20, level: "LOW", score: 8, reason: "Rainfall deficit signal is low." },
            { max: 45, level: "MODERATE", score: 42, reason: "Rainfall deficit is noticeable." },
            { max: 70, level: "HIGH", score: 74, reason: "Rainfall deficit can stress water supply and crops." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Severe rainfall deficit indicates major drought concern." }
        ]
    },
    windSpeed: {
        label: "Wind Speed",
        unit: "km/h",
        thresholds: [
            { max: 20, level: "LOW", score: 8, reason: "Wind is not a major current stress factor." },
            { max: 40, level: "MODERATE", score: 36, reason: "Moderate wind can affect field operations." },
            { max: 65, level: "HIGH", score: 70, reason: "High wind can disrupt response and exposed infrastructure." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Severe wind can create unsafe operating conditions." }
        ]
    },
    windGusts: {
        label: "Wind Gusts",
        unit: "km/h",
        thresholds: [
            { max: 30, level: "LOW", score: 8, reason: "Wind gusts are low." },
            { max: 55, level: "MODERATE", score: 42, reason: "Gusts may affect trees, signage, and temporary structures." },
            { max: 85, level: "HIGH", score: 76, reason: "Strong gusts can damage exposed infrastructure." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Extreme gusts can make field response unsafe." }
        ]
    },
    weatherCode: {
        label: "Weather Severity Code",
        unit: "WMO",
        thresholds: [
            { max: 3, level: "LOW", score: 8, reason: "Weather code indicates clear or cloudy conditions." },
            { max: 65, level: "MODERATE", score: 42, reason: "Weather code indicates precipitation conditions." },
            { max: 82, level: "HIGH", score: 72, reason: "Weather code indicates heavy showers or severe precipitation." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Weather code indicates storm, hail, or extreme conditions." }
        ]
    },
    temperature: {
        label: "Temperature",
        unit: "C",
        thresholds: [
            { max: 32, level: "LOW", score: 10, reason: "Temperature is below heat-stress range." },
            { max: 38, level: "MODERATE", score: 44, reason: "Heat stress is possible for exposed populations." },
            { max: 45, level: "HIGH", score: 78, reason: "High heat can affect public health and response teams." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Extreme heat needs urgent public-health readiness." }
        ]
    },
    humidity: {
        label: "Relative Humidity",
        unit: "%",
        thresholds: [
            { max: 30, level: "LOW", score: 20, reason: "Low humidity can raise dry-fire risk." },
            { max: 60, level: "MODERATE", score: 35, reason: "Humidity is in a moderate range." },
            { max: 80, level: "HIGH", score: 62, reason: "High humidity increases heat stress and rainfall persistence concern." },
            { max: Infinity, level: "CRITICAL", score: 80, reason: "Very high humidity can worsen heat stress and saturation concerns." }
        ]
    },
    dryness: {
        label: "Dryness Index",
        unit: "0-100",
        thresholds: [
            { max: 20, level: "LOW", score: 8, reason: "Dryness signal is low." },
            { max: 45, level: "MODERATE", score: 42, reason: "Dryness is building and should be monitored." },
            { max: 70, level: "HIGH", score: 74, reason: "Dry conditions can increase drought and wildfire exposure." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Severe dryness indicates high drought or wildfire concern." }
        ]
    },
    soilMoisture: {
        label: "Soil Moisture",
        unit: "%",
        thresholds: [
            { max: 35, level: "LOW", score: 10, reason: "Soil moisture is low." },
            { max: 60, level: "MODERATE", score: 44, reason: "Soil moisture is elevated." },
            { max: 80, level: "HIGH", score: 78, reason: "High soil moisture can reduce slope stability." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Very high soil moisture indicates saturation risk." }
        ]
    },
    soilDryness: {
        label: "Low Soil Moisture",
        unit: "dryness %",
        thresholds: [
            { max: 20, level: "LOW", score: 8, reason: "Soil moisture is not showing drought stress." },
            { max: 45, level: "MODERATE", score: 42, reason: "Soil moisture is reduced and should be monitored." },
            { max: 70, level: "HIGH", score: 74, reason: "Low soil moisture can worsen drought impacts." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Very low soil moisture indicates severe drought stress." }
        ]
    },
    slopeRisk: {
        label: "Terrain / Slope Risk",
        unit: "level",
        scoreMap: {
            LOW: { level: "LOW", score: 12, reason: "Terrain is marked as low slope risk." },
            MODERATE: { level: "MODERATE", score: 45, reason: "Terrain has moderate slope concern." },
            HIGH: { level: "HIGH", score: 76, reason: "Terrain has high slope vulnerability." },
            CRITICAL: { level: "CRITICAL", score: 100, reason: "Terrain is marked as critically vulnerable." }
        }
    },
    roadBlockage: {
        label: "Road Blockage Status",
        unit: "status",
        scoreMap: {
            NONE: { level: "LOW", score: 8, reason: "No known road blockage." },
            PARTIAL: { level: "MODERATE", score: 48, reason: "Partial blockage can slow evacuation and response." },
            BLOCKED: { level: "HIGH", score: 82, reason: "Blocked roads can isolate affected locations." },
            UNKNOWN: { level: "MODERATE", score: 45, reason: "Road status is unknown and needs verification." }
        }
    },
    infrastructureStatus: {
        label: "Infrastructure / Operations",
        unit: "status",
        scoreMap: {
            NORMAL: { level: "LOW", score: 10, reason: "Infrastructure status is normal." },
            WATCH: { level: "MODERATE", score: 42, reason: "Minor infrastructure concern is present." },
            DEGRADED: { level: "HIGH", score: 75, reason: "Degraded infrastructure increases operational risk." },
            FAILED: { level: "CRITICAL", score: 100, reason: "Failed infrastructure requires urgent response planning." }
        }
    },
    populationExposure: {
        label: "Population Exposure",
        unit: "level",
        scoreMap: {
            LOW: { level: "LOW", score: 15, reason: "Low exposed population or assets." },
            MODERATE: { level: "MODERATE", score: 45, reason: "Moderate exposure raises response priority." },
            HIGH: { level: "HIGH", score: 78, reason: "High exposure increases potential impact." },
            CRITICAL: { level: "CRITICAL", score: 100, reason: "Critical exposure needs urgent readiness." }
        }
    },
    drainageCapacity: {
        label: "Drainage Capacity",
        unit: "level",
        scoreMap: {
            GOOD: { level: "LOW", score: 10, reason: "Drainage capacity is good." },
            FAIR: { level: "MODERATE", score: 38, reason: "Drainage capacity is fair." },
            POOR: { level: "HIGH", score: 76, reason: "Poor drainage increases waterlogging risk." },
            FAILED: { level: "CRITICAL", score: 100, reason: "Failed drainage can rapidly worsen flooding." }
        }
    },
    riverLevel: {
        label: "River / Water Level",
        unit: "level",
        scoreMap: {
            NORMAL: { level: "LOW", score: 10, reason: "Water level is normal." },
            WATCH: { level: "MODERATE", score: 45, reason: "Water level is under watch." },
            HIGH: { level: "HIGH", score: 78, reason: "High water level increases flood exposure." },
            OVERFLOW: { level: "CRITICAL", score: 100, reason: "Overflow condition needs urgent attention." }
        }
    },
    riverDischargeForecast: {
        label: "API River Discharge Forecast",
        unit: "pressure index",
        thresholds: [
            { max: 15, level: "LOW", score: 10, reason: "Open-Meteo flood forecast shows low discharge pressure." },
            { max: 40, level: "MODERATE", score: 45, reason: "Open-Meteo flood forecast shows rising river-discharge pressure." },
            { max: 70, level: "HIGH", score: 78, reason: "Open-Meteo flood forecast shows high river-discharge pressure." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Open-Meteo flood forecast shows severe river-discharge pressure." }
        ]
    },
    fieldReports: {
        label: "Field Reports",
        unit: "signals",
        thresholds: [
            { max: 0, level: "LOW", score: 5, reason: "No critical field observations submitted." },
            { max: 1, level: "MODERATE", score: 40, reason: "One field warning sign was reported." },
            { max: 2, level: "HIGH", score: 72, reason: "Multiple field warning signs were reported." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Several field warning signs indicate urgent monitoring." }
        ]
    },
    historicalEvents: {
        label: "Historical / Known Local Events",
        unit: "count",
        thresholds: [
            { max: 0, level: "LOW", score: 8, reason: "No known historical events in the provided local input." },
            { max: 2, level: "MODERATE", score: 42, reason: "Some historical disaster activity is known." },
            { max: 5, level: "HIGH", score: 74, reason: "Repeated history increases local vulnerability." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Frequent historical events indicate critical vulnerability." }
        ]
    },
    earthquakeMagnitude: {
        label: "Recent Earthquake Magnitude",
        unit: "Mw",
        thresholds: [
            { max: 2.9, level: "LOW", score: 10, reason: "No damaging recent magnitude was found nearby." },
            { max: 4.4, level: "MODERATE", score: 42, reason: "Nearby light earthquake activity was detected." },
            { max: 5.9, level: "HIGH", score: 76, reason: "Nearby moderate earthquake activity can affect vulnerable structures." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Nearby strong earthquake activity needs urgent checks." }
        ]
    },
    earthquakeDistance: {
        label: "Nearest Earthquake Distance",
        unit: "km",
        inverseThresholds: [
            { max: 25, level: "CRITICAL", score: 100, reason: "Earthquake activity is very close to the selected location." },
            { max: 75, level: "HIGH", score: 76, reason: "Earthquake activity is close enough for inspection priority." },
            { max: 150, level: "MODERATE", score: 42, reason: "Earthquake activity is regional and should be tracked." },
            { max: Infinity, level: "LOW", score: 8, reason: "Recent earthquake activity is distant or absent." }
        ]
    },
    earthquakeCount: {
        label: "Recent Earthquake Density",
        unit: "events",
        thresholds: [
            { max: 0, level: "LOW", score: 5, reason: "No recent earthquakes found in the search radius." },
            { max: 2, level: "MODERATE", score: 40, reason: "A few recent earthquakes were found nearby." },
            { max: 5, level: "HIGH", score: 70, reason: "Multiple recent earthquakes indicate elevated regional activity." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Dense recent earthquake activity requires priority review." }
        ]
    },
    fireHotspots: {
        label: "Satellite Fire Hotspots",
        unit: "hotspots",
        thresholds: [
            { max: 0, level: "LOW", score: 8, reason: "No satellite fire hotspots were found in the checked area." },
            { max: 3, level: "MODERATE", score: 46, reason: "Some nearby fire hotspots were detected." },
            { max: 10, level: "HIGH", score: 76, reason: "Several nearby hotspots indicate active fire concern." },
            { max: Infinity, level: "CRITICAL", score: 100, reason: "Dense fire hotspots indicate urgent wildfire attention." }
        ]
    }
};

const DISASTER_PROFILES = {
    flood: {
        label: DISASTER_TYPES.flood,
        factors: {
            rain: 0.14,
            dailyPrecipitation: 0.14,
            weatherCode: 0.06,
            riverDischargeForecast: 0.18,
            drainageCapacity: 0.14,
            riverLevel: 0.12,
            roadBlockage: 0.10,
            fieldReports: 0.06,
            populationExposure: 0.06
        }
    },
    landslide: {
        label: DISASTER_TYPES.landslide,
        factors: {
            rain: 0.14,
            dailyPrecipitation: 0.14,
            soilMoisture: 0.14,
            slopeRisk: 0.22,
            fieldReports: 0.14,
            roadBlockage: 0.08,
            historicalEvents: 0.08,
            populationExposure: 0.06
        }
    },
    storm: {
        label: DISASTER_TYPES.storm,
        factors: {
            windSpeed: 0.20,
            windGusts: 0.22,
            weatherCode: 0.14,
            dailyPrecipitation: 0.12,
            infrastructureStatus: 0.12,
            roadBlockage: 0.08,
            fieldReports: 0.06,
            populationExposure: 0.06
        }
    },
    heatwave: {
        label: DISASTER_TYPES.heatwave,
        factors: {
            temperature: 0.32,
            humidity: 0.14,
            infrastructureStatus: 0.14,
            populationExposure: 0.22,
            fieldReports: 0.08,
            historicalEvents: 0.10
        }
    },
    wildfire: {
        label: DISASTER_TYPES.wildfire,
        factors: {
            temperature: 0.16,
            dryness: 0.18,
            windSpeed: 0.14,
            windGusts: 0.10,
            fireHotspots: 0.22,
            infrastructureStatus: 0.08,
            fieldReports: 0.06,
            populationExposure: 0.06
        }
    },
    earthquake: {
        label: DISASTER_TYPES.earthquake,
        factors: {
            earthquakeMagnitude: 0.30,
            earthquakeDistance: 0.16,
            earthquakeCount: 0.12,
            infrastructureStatus: 0.16,
            roadBlockage: 0.08,
            fieldReports: 0.08,
            historicalEvents: 0.04,
            populationExposure: 0.06
        }
    },
    drought: {
        label: DISASTER_TYPES.drought,
        factors: {
            temperature: 0.16,
            dryness: 0.24,
            precipitationDeficit: 0.10,
            soilDryness: 0.14,
            infrastructureStatus: 0.12,
            historicalEvents: 0.12,
            populationExposure: 0.12
        }
    }
};

module.exports = {
    DISASTER_PROFILES,
    DISASTER_TYPES,
    FACTOR_RULES,
    RISK_LEVELS
};
