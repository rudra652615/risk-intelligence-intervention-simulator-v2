const { getRiskLevel, round } = require("./riskEngine");

const INTERVENTIONS = {
    "flood-response": {
        label: "Flood Response",
        disasterTypes: ["flood", "landslide"],
        reductions: {
            rain: 0.00,
            dailyPrecipitation: 0.00,
            riverDischargeForecast: 0.00,
            drainageCapacity: 0.35,
            riverLevel: 0.20,
            roadBlockage: 0.20,
            fieldReports: 0.15,
            populationExposure: 0.12
        },
        responseTimeReduction: 0.20,
        explanation: "Drainage checks, pump staging, route planning, and local response readiness reduce estimated exposure and delay."
    },
    "slope-stabilization": {
        label: "Slope Stabilization",
        disasterTypes: ["landslide"],
        reductions: {
            slopeRisk: 0.35,
            soilMoisture: 0.20,
            fieldReports: 0.25,
            roadBlockage: 0.15,
            historicalEvents: 0.10
        },
        responseTimeReduction: 0.15,
        explanation: "Temporary stabilization, restricted access, and slope inspection reduce estimated vulnerability and exposure."
    },
    "storm-readiness": {
        label: "Storm / Cyclone Readiness",
        disasterTypes: ["storm", "flood"],
        reductions: {
            windSpeed: 0.00,
            windGusts: 0.00,
            weatherCode: 0.00,
            infrastructureStatus: 0.30,
            roadBlockage: 0.15,
            populationExposure: 0.12,
            fieldReports: 0.12
        },
        responseTimeReduction: 0.25,
        explanation: "Securing exposed assets, checking utilities, staging crews, and pre-positioning alerts reduce operational impact."
    },
    "heat-health-plan": {
        label: "Heat Health Action Plan",
        disasterTypes: ["heatwave", "drought"],
        reductions: {
            temperature: 0.00,
            humidity: 0.00,
            infrastructureStatus: 0.28,
            populationExposure: 0.30,
            fieldReports: 0.15
        },
        responseTimeReduction: 0.18,
        explanation: "Cooling centers, public-health alerts, water distribution, and field-team heat protocols reduce estimated impact."
    },
    "wildfire-containment": {
        label: "Wildfire Containment Readiness",
        disasterTypes: ["wildfire"],
        reductions: {
            dryness: 0.00,
            windSpeed: 0.00,
            windGusts: 0.00,
            fireHotspots: 0.10,
            infrastructureStatus: 0.18,
            populationExposure: 0.14,
            fieldReports: 0.16
        },
        responseTimeReduction: 0.22,
        explanation: "Hotspot verification, firebreak planning, alerting, and resource staging reduce estimated wildfire exposure."
    },
    "earthquake-rapid-assessment": {
        label: "Earthquake Rapid Assessment",
        disasterTypes: ["earthquake"],
        reductions: {
            earthquakeMagnitude: 0.00,
            earthquakeDistance: 0.00,
            earthquakeCount: 0.00,
            infrastructureStatus: 0.35,
            roadBlockage: 0.22,
            fieldReports: 0.20,
            populationExposure: 0.16
        },
        responseTimeReduction: 0.28,
        explanation: "Damage triage, bridge and utility checks, route clearance, and shelter readiness reduce estimated secondary impact."
    },
    "drought-water-management": {
        label: "Drought Water Management",
        disasterTypes: ["drought", "heatwave", "wildfire"],
        reductions: {
            dryness: 0.00,
            precipitationDeficit: 0.00,
            soilDryness: 0.10,
            infrastructureStatus: 0.22,
            historicalEvents: 0.08,
            populationExposure: 0.22
        },
        responseTimeReduction: 0.12,
        explanation: "Water-use controls, supply planning, tankering, and agriculture advisories reduce estimated drought impact."
    },
    "increased-monitoring": {
        label: "Increased Multi-Hazard Monitoring",
        disasterTypes: ["flood", "landslide", "storm", "heatwave", "wildfire", "earthquake", "drought"],
        reductions: {
            fieldReports: 0.12,
            roadBlockage: 0.08,
            infrastructureStatus: 0.08,
            populationExposure: 0.06
        },
        responseTimeReduction: 0.10,
        explanation: "More frequent monitoring improves readiness and reduces verification delay, but it does not change physical hazard conditions."
    }
};

function simulateIntervention(risk, scenarioKey = null) {
    const scenario = chooseScenario(risk, scenarioKey);
    const scenarioMatchesDisaster = scenario.disasterTypes.includes(risk.disasterType);
    let simulatedScore = 0;

    const factors = risk.factors.map((factor) => {
        const reductionRate = scenario.reductions[factor.key] || 0;
        const reduction = round(factor.contribution * reductionRate, 1);
        const simulatedContribution = round(factor.contribution - reduction, 1);
        simulatedScore += simulatedContribution;

        return {
            ...factor,
            reductionRate,
            reduction,
            simulatedContribution
        };
    });

    simulatedScore = Math.max(0, round(simulatedScore, 0));
    const estimatedReduction = Math.max(0, round(risk.score - simulatedScore, 0));
    const confidence = buildSimulationConfidence(risk, scenario, factors, scenarioMatchesDisaster);
    const uncertaintyRange = buildUncertaintyRange(simulatedScore, confidence.score);

    return {
        scenarioKey: Object.keys(INTERVENTIONS).find((key) => INTERVENTIONS[key] === scenario),
        scenario: scenario.label,
        disasterType: risk.disasterType,
        scenarioMatchesDisaster,
        currentScore: risk.score,
        currentLevel: risk.level,
        simulatedScore,
        simulatedLevel: getRiskLevel(simulatedScore),
        simulatedScoreRange: uncertaintyRange,
        estimatedReduction,
        estimatedImprovementPercent: risk.score > 0 ? round((estimatedReduction / risk.score) * 100, 1) : 0,
        confidence,
        simulationBasis: buildSimulationBasis(factors),
        responseEstimate: buildResponseEstimate(risk.score, simulatedScore, scenario.responseTimeReduction),
        factors,
        explanation: scenario.explanation,
        disclaimer: "Scenario estimate only. API-backed observations and forecasts are used for the baseline; interventions estimate reduced exposure/readiness impact and do not change real weather, earthquake, river-discharge, or satellite observations."
    };
}

function chooseScenario(risk, scenarioKey) {
    if (scenarioKey && INTERVENTIONS[scenarioKey]) {
        return INTERVENTIONS[scenarioKey];
    }

    const matchingKey = Object.keys(INTERVENTIONS).find((key) => {
        return INTERVENTIONS[key].disasterTypes.includes(risk.disasterType);
    });

    return INTERVENTIONS[matchingKey] || INTERVENTIONS["increased-monitoring"];
}

function buildResponseEstimate(currentScore, simulatedScore, responseTimeReduction) {
    const currentPriority = getPriority(currentScore);
    const simulatedPriority = getPriority(simulatedScore);
    const currentResponseMinutes = getEstimatedResponseMinutes(currentPriority);
    const simulatedResponseMinutes = Math.round(currentResponseMinutes * (1 - responseTimeReduction));

    return {
        currentPriority,
        simulatedPriority,
        currentResponseMinutes,
        simulatedResponseMinutes,
        estimatedMinutesSaved: Math.max(0, currentResponseMinutes - simulatedResponseMinutes)
    };
}

function getPriority(score) {
    if (score >= 75) {
        return "Priority 1";
    }

    if (score >= 50) {
        return "Priority 2";
    }

    if (score >= 25) {
        return "Priority 3";
    }

    return "Routine Monitoring";
}

function getEstimatedResponseMinutes(priority) {
    const estimates = {
        "Priority 1": 30,
        "Priority 2": 60,
        "Priority 3": 120,
        "Routine Monitoring": 240
    };

    return estimates[priority];
}

function buildSimulationConfidence(risk, scenario, factors, scenarioMatchesDisaster) {
    const totalWeight = factors.reduce((total, factor) => total + factor.weight, 0) || 1;
    const apiWeight = factors
        .filter((factor) => factor.sourceType === "api" && factor.dataStatus !== "unavailable")
        .reduce((total, factor) => total + factor.weight, 0);
    const reducedWeight = factors
        .filter((factor) => factor.reductionRate > 0 && factor.dataStatus !== "unavailable")
        .reduce((total, factor) => total + factor.weight, 0);
    const dataQualityPenalty = countDataQualityProblems(risk.dataQuality) * 8;
    const scenarioPenalty = scenarioMatchesDisaster ? 0 : 12;
    const score = clamp(42 + (apiWeight / totalWeight) * 32 + Math.min(18, reducedWeight * 24) - dataQualityPenalty - scenarioPenalty, 20, 92);

    return {
        score: round(score, 0),
        level: getConfidenceLevel(score),
        apiBackedWeightPercent: round((apiWeight / totalWeight) * 100, 0),
        adjustedFactorWeightPercent: round((reducedWeight / totalWeight) * 100, 0),
        scenarioFit: scenarioMatchesDisaster ? "matched" : "cross-hazard",
        note: buildConfidenceNote(score, scenario)
    };
}

function buildSimulationBasis(factors) {
    const apiBackedFactors = factors
        .filter((factor) => factor.sourceType === "api" && factor.dataStatus !== "unavailable")
        .map((factor) => factor.label);
    const adjustableFactors = factors
        .filter((factor) => factor.reductionRate > 0 && factor.dataStatus !== "unavailable")
        .map((factor) => factor.label);
    const fixedObservationFactors = factors
        .filter((factor) => factor.sourceType === "api" && factor.reductionRate === 0 && factor.dataStatus !== "unavailable")
        .map((factor) => factor.label);

    return {
        apiBackedFactors,
        adjustableFactors,
        fixedObservationFactors,
        method: "Weighted factor contributions are recalculated after applying intervention effectiveness only to adjustable impact/exposure factors."
    };
}

function buildUncertaintyRange(simulatedScore, confidenceScore) {
    const spread = round(clamp(18 - confidenceScore * 0.12, 5, 16), 0);

    return {
        low: clamp(simulatedScore - spread, 0, 100),
        high: clamp(simulatedScore + spread, 0, 100),
        spread
    };
}

function countDataQualityProblems(notes = []) {
    if (!Array.isArray(notes)) {
        return 0;
    }

    return notes.filter((note) => /error|not_configured|not_provided/i.test(note)).length;
}

function getConfidenceLevel(score) {
    if (score >= 75) {
        return "HIGH";
    }

    if (score >= 50) {
        return "MEDIUM";
    }

    return "LOW";
}

function buildConfidenceNote(score, scenario) {
    const level = getConfidenceLevel(score).toLowerCase();
    return `Simulation confidence is ${level} because ${scenario.label} is compared against available API-backed hazard evidence and operator-provided exposure factors.`;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

module.exports = {
    INTERVENTIONS,
    simulateIntervention
};
