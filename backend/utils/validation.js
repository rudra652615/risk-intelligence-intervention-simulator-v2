const { DISASTER_PROFILES } = require("../config/riskRules");

function toNumber(value, fallback = 0) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeEnum(value, allowedValues, fallback) {
    const normalized = String(value || fallback).trim().toUpperCase();
    return allowedValues.includes(normalized) ? normalized : fallback;
}

function validateCoordinates(latitude, longitude) {
    const latResult = parseCoordinate(latitude, "latitude");
    const lonResult = parseCoordinate(longitude, "longitude");

    if (!latResult.valid || !lonResult.valid) {
        return {
            valid: false,
            message: latResult.message || lonResult.message
        };
    }

    if (latResult.value < -90 || latResult.value > 90) {
        return {
            valid: false,
            message: "Latitude must be between -90 and 90."
        };
    }

    if (lonResult.value < -180 || lonResult.value > 180) {
        return {
            valid: false,
            message: "Longitude must be between -180 and 180."
        };
    }

    return {
        valid: true,
        latitude: latResult.value,
        longitude: lonResult.value
    };
}

function parseCoordinate(value, coordinateType) {
    if (typeof value === "number") {
        return Number.isFinite(value)
            ? { valid: true, value }
            : { valid: false, message: `${getCoordinateLabel(coordinateType)} must be a valid number.` };
    }

    const rawValue = String(value || "").trim().toUpperCase();

    if (!rawValue) {
        return {
            valid: false,
            message: "Enter both latitude and longitude before analyzing."
        };
    }

    const match = rawValue.match(/^([NSEW])?\s*([+-]?\d+(?:\.\d+)?)\s*([NSEW])?$/);

    if (!match) {
        return {
            valid: false,
            message: `${getCoordinateLabel(coordinateType)} must be decimal degrees, optionally with N/S/E/W. Example: 28.6139 N.`
        };
    }

    const direction = match[1] || match[3] || null;
    const numberValue = Number(match[2]);

    if (!Number.isFinite(numberValue)) {
        return {
            valid: false,
            message: `${getCoordinateLabel(coordinateType)} must be a valid number.`
        };
    }

    const directionValidation = validateDirection(direction, coordinateType);

    if (!directionValidation.valid) {
        return directionValidation;
    }

    return {
        valid: true,
        value: applyDirection(numberValue, direction)
    };
}

function validateDirection(direction, coordinateType) {
    if (!direction) {
        return { valid: true };
    }

    const validDirections = coordinateType === "latitude" ? ["N", "S"] : ["E", "W"];

    if (!validDirections.includes(direction)) {
        return {
            valid: false,
            message: `${getCoordinateLabel(coordinateType)} can only use ${validDirections.join(" or ")} direction.`
        };
    }

    return { valid: true };
}

function applyDirection(value, direction) {
    if (direction === "S" || direction === "W") {
        return -Math.abs(value);
    }

    if (direction === "N" || direction === "E") {
        return Math.abs(value);
    }

    return value;
}

function getCoordinateLabel(coordinateType) {
    return coordinateType === "latitude" ? "Latitude" : "Longitude";
}

function normalizeRiskInput(body = {}) {
    const disasterType = String(body.disasterType || "flood").trim().toLowerCase();
    const location = normalizeLocation(body.location);
    const newsQuery = cleanString(body.newsQuery || (location && location.name) || body.locationName, 100);

    return {
        disasterType: DISASTER_PROFILES[disasterType] ? disasterType : "flood",
        location,
        newsQuery,
        weather: body.weather || null,
        hazardContext: body.hazardContext || null,
        fieldReports: {
            cracks: Boolean(body.fieldReports && body.fieldReports.cracks),
            slopeMovement: Boolean(body.fieldReports && body.fieldReports.slopeMovement),
            flooding: Boolean(body.fieldReports && body.fieldReports.flooding),
            roadBlockage: Boolean(body.fieldReports && body.fieldReports.roadBlockage),
            buildingDamage: Boolean(body.fieldReports && body.fieldReports.buildingDamage),
            powerOutage: Boolean(body.fieldReports && body.fieldReports.powerOutage),
            fireSmoke: Boolean(body.fieldReports && body.fieldReports.fireSmoke),
            medicalStress: Boolean(body.fieldReports && body.fieldReports.medicalStress),
            waterShortage: Boolean(body.fieldReports && body.fieldReports.waterShortage)
        },
        terrain: {
            slopeRisk: normalizeEnum(body.terrain && body.terrain.slopeRisk, ["LOW", "MODERATE", "HIGH", "CRITICAL"], "LOW")
        },
        operations: {
            roadBlockage: normalizeEnum(body.operations && body.operations.roadBlockage, ["NONE", "PARTIAL", "BLOCKED", "UNKNOWN"], "NONE"),
            infrastructureStatus: normalizeEnum(body.operations && body.operations.infrastructureStatus, ["NORMAL", "WATCH", "DEGRADED", "FAILED"], "NORMAL"),
            populationExposure: normalizeEnum(body.operations && body.operations.populationExposure, ["LOW", "MODERATE", "HIGH", "CRITICAL"], "MODERATE"),
            drainageCapacity: normalizeEnum(body.operations && body.operations.drainageCapacity, ["GOOD", "FAIR", "POOR", "FAILED"], "FAIR"),
            riverLevel: normalizeEnum(body.operations && body.operations.riverLevel, ["NORMAL", "WATCH", "HIGH", "OVERFLOW"], "NORMAL")
        },
        sensor: {
            soilMoisture: clamp(toNumber(body.sensor && body.sensor.soilMoisture, 0), 0, 100)
        },
        historical: {
            eventCount: Math.max(0, Math.round(toNumber(body.historical && (body.historical.eventCount ?? body.historical.landslideCount), 0)))
        }
    };
}

function normalizeLocation(location) {
    if (!location || typeof location !== "object") {
        return null;
    }

    return {
        ...location,
        name: cleanString(location.name || location.label || "", 100)
    };
}

function cleanString(value, maxLength) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

module.exports = {
    clamp,
    normalizeEnum,
    normalizeRiskInput,
    parseCoordinate,
    toNumber,
    validateCoordinates
};
