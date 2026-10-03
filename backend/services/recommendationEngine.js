function generateRecommendations(risk) {
    const recommendations = [
        getOverallRecommendation(risk.level, risk.disasterLabel)
    ];

    risk.factors.forEach((factor) => {
        if (factor.level === "HIGH" || factor.level === "CRITICAL") {
            const message = getFactorRecommendation(factor);
            if (message) {
                recommendations.push(message);
            }
        }
    });

    if (risk.disasterType === "wildfire" && hasDataQualityStatus(risk, "not_configured")) {
        recommendations.push("Add a free NASA FIRMS MAP_KEY if satellite fire hotspot validation is needed.");
    }

    recommendations.push("Use these outputs as decision support only. The module does not automatically dispatch emergency services.");

    return [...new Set(recommendations)];
}

function getOverallRecommendation(level, disasterLabel) {
    const recommendations = {
        LOW: `Continue normal monitoring for ${disasterLabel}.`,
        MODERATE: `Increase observation frequency and verify fresh local reports for ${disasterLabel}.`,
        HIGH: `Review response readiness and prioritize field validation for ${disasterLabel}.`,
        CRITICAL: `Activate high-priority monitoring and immediate readiness review for ${disasterLabel}.`
    };

    return recommendations[level] || recommendations.LOW;
}

function getFactorRecommendation(factor) {
    const recommendations = {
        rain: "Check low-lying roads, drainage points, and slope-adjacent settlements.",
        dailyPrecipitation: "Review rainfall forecast impact on drainage, evacuation routes, and exposed zones.",
        precipitationDeficit: "Review water-supply, crop, and storage stress indicators for the area.",
        windSpeed: "Review safety of exposed infrastructure and outdoor response operations.",
        windGusts: "Secure temporary structures and verify tree, signboard, and power-line risk.",
        weatherCode: "Weather severity is high. Validate field team safety before deployment.",
        temperature: "Prepare heat-safety checks for exposed populations and field teams.",
        humidity: "High humidity may increase heat stress and slow cooling; prepare public-health messaging.",
        dryness: "Dryness is high. Review water availability, vegetation dryness, and ignition control.",
        soilMoisture: "Soil moisture is high. Increase observation of slope saturation and seepage signs.",
        soilDryness: "Low soil moisture is high. Review drought response and water conservation triggers.",
        slopeRisk: "Coordinate with GIS mapping to flag this terrain as a vulnerable slope zone.",
        roadBlockage: "Prioritize route verification, alternate access planning, and evacuation passability.",
        infrastructureStatus: "Inspect degraded infrastructure and prepare backup operations.",
        populationExposure: "Prioritize alerts and response staging for high-exposure settlements or assets.",
        drainageCapacity: "Inspect drains, culverts, pumping points, and known waterlogging hotspots.",
        riverLevel: "Monitor riverbank and overflow-prone stretches closely.",
        riverDischargeForecast: "Use Open-Meteo flood forecast evidence to prioritize riverbank and low-lying route checks.",
        fieldReports: "Prioritize verification of active local warning signs.",
        historicalEvents: "Historical activity is significant. Treat the area as vulnerable in heatmap layers.",
        earthquakeMagnitude: "Check structures, bridges, retaining walls, and utilities after nearby seismic activity.",
        earthquakeDistance: "Nearby earthquake activity requires rapid local inspection.",
        earthquakeCount: "Multiple recent earthquakes require continued seismic monitoring.",
        fireHotspots: "Verify satellite hotspot locations and prepare local fire-response readiness."
    };

    return recommendations[factor.key] || null;
}

function hasDataQualityStatus(risk, status) {
    return Array.isArray(risk.dataQuality) && risk.dataQuality.some((note) => note.includes(status));
}

module.exports = {
    generateRecommendations
};
