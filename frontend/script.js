// Temporary frontend tester for Rudra's CASCADE-NET Risk Intelligence backend.

const API_BASE_URL = "";

const DEFAULT_SCENARIO_BY_DISASTER = {
    flood: "flood-response",
    landslide: "slope-stabilization",
    storm: "storm-readiness",
    heatwave: "heat-health-plan",
    wildfire: "wildfire-containment",
    earthquake: "earthquake-rapid-assessment",
    drought: "drought-water-management"
};

const cascadeNetResult = {
    location: null,
    weather: null,
    hazardContext: null,
    newsContext: null,
    inputFactors: null,
    risk: null,
    recommendations: [],
    aiAssessment: null,
    simulation: null
};

window.CASCADE_NET_RESULT = cascadeNetResult;

const elements = {};

document.addEventListener("DOMContentLoaded", function () {
    cacheElements();
    bindEvents();
    displayEmptyState();
    checkBackendHealth();
});

function cacheElements() {
    [
        "liveStatus",
        "messageBox",
        "apiKeysForm",
        "apiKeysSummaryStatus",
        "firmsMapKeyInput",
        "gnewsApiKeyInput",
        "geminiApiKeyInput",
        "clearFirmsMapKey",
        "clearGnewsApiKey",
        "clearGeminiApiKey",
        "showApiKeysInput",
        "saveApiKeysBtn",
        "apiKeysMessage",
        "firmsMapKeyStatus",
        "gnewsApiKeyStatus",
        "geminiApiKeyStatus",
        "locationForm",
        "useLocationBtn",
        "analyzeBtn",
        "latitudeInput",
        "longitudeInput",
        "areaNameInput",
        "disasterTypeInput",
        "slopeRiskInput",
        "soilMoistureInput",
        "historicalInput",
        "roadStatusInput",
        "infrastructureInput",
        "exposureInput",
        "drainageInput",
        "riverLevelInput",
        "cracksInput",
        "movementInput",
        "floodingInput",
        "roadBlockageInput",
        "buildingDamageInput",
        "powerOutageInput",
        "fireSmokeInput",
        "medicalStressInput",
        "waterShortageInput",
        "weatherTimestamp",
        "temperatureValue",
        "humidityValue",
        "rainValue",
        "dailyRainValue",
        "windValue",
        "gustValue",
        "weatherCodeValue",
        "coordinatesValue",
        "earthquakeValue",
        "magnitudeValue",
        "floodForecastValue",
        "fireValue",
        "timezoneValue",
        "sourceSummaryGrid",
        "weatherSourceStatus",
        "floodSourceStatus",
        "earthquakeSourceStatus",
        "fireSourceStatus",
        "newsSourceStatus",
        "weatherForecastTable",
        "floodForecastTable",
        "earthquakeEventsTable",
        "fireHotspotsTable",
        "newsArticlesTable",
        "riskScore",
        "riskLevel",
        "riskMeterFill",
        "riskExplanation",
        "factorGrid",
        "aiStatusValue",
        "aiScoreValue",
        "aiLevelValue",
        "aiConfidenceValue",
        "aiBaselineValue",
        "aiRationale",
        "aiDriversList",
        "aiTipsList",
        "aiActionPlanList",
        "aiNewsFindingsList",
        "recommendationList",
        "dataQualityList",
        "scenarioSelect",
        "currentScenarioScore",
        "simulatedScenarioScore",
        "currentScenarioLevel",
        "simulatedScenarioLevel",
        "simulatedRange",
        "simulationConfidence",
        "estimatedChange",
        "simulationExplanation",
        "apiBackedFactorsList",
        "adjustableFactorsList",
        "fixedFactorsList",
        "rawJsonOutput"
    ].forEach((id) => {
        elements[id] = document.getElementById(id);
    });
}

function bindEvents() {
    elements.locationForm.addEventListener("submit", function (event) {
        event.preventDefault();
        analyzeFromManualCoordinates();
    });

    elements.useLocationBtn.addEventListener("click", getBrowserLocationAndAnalyze);

    elements.apiKeysForm.addEventListener("submit", saveApiKeys);
    elements.showApiKeysInput.addEventListener("change", function () {
        const inputType = elements.showApiKeysInput.checked ? "text" : "password";
        [elements.firmsMapKeyInput, elements.gnewsApiKeyInput, elements.geminiApiKeyInput]
            .forEach((input) => {
                input.type = inputType;
            });
    });

    [
        [elements.firmsMapKeyInput, elements.clearFirmsMapKey],
        [elements.gnewsApiKeyInput, elements.clearGnewsApiKey],
        [elements.geminiApiKeyInput, elements.clearGeminiApiKey]
    ].forEach(([input, clear]) => {
        clear.addEventListener("change", function () {
            input.disabled = clear.checked;
            if (clear.checked) {
                input.value = "";
            }
        });
    });

    elements.disasterTypeInput.addEventListener("change", function () {
        elements.scenarioSelect.value = DEFAULT_SCENARIO_BY_DISASTER[elements.disasterTypeInput.value] || "increased-monitoring";
    });

    elements.scenarioSelect.addEventListener("change", function () {
        if (cascadeNetResult.risk) {
            simulateSelectedScenario().catch(handleSimulationError);
        }
    });
}

async function checkBackendHealth() {
    try {
        const response = await fetchJson("/api/health");
        setStatus("live", `${response.service} online`);
    } catch (error) {
        setStatus("error", "Backend offline");
        showError("Backend is not running. Start it with: npm start");
    }

    await refreshApiKeyStatus();
}

async function refreshApiKeyStatus() {
    try {
        const response = await fetchJson("/api/settings/api-keys", { cache: "no-store" });
        const labels = [
            ["firmsMapKey", elements.firmsMapKeyStatus, "NASA FIRMS"],
            ["gnewsApiKey", elements.gnewsApiKeyStatus, "GNews"],
            ["geminiApiKey", elements.geminiApiKeyStatus, "Gemini"]
        ];
        const configuredCount = labels.filter(([key]) => response.data[key]).length;

        labels.forEach(([key, element, label]) => {
            const configured = response.data[key];
            element.textContent = `${label}: ${configured ? "configured" : "not configured"}`;
        });

        elements.apiKeysSummaryStatus.textContent = `${configuredCount} of 3 optional keys configured`;
        elements.firmsMapKeyInput.placeholder = response.data.firmsMapKey
            ? "Saved for this server run; blank keeps it"
            : "Not configured";
        elements.gnewsApiKeyInput.placeholder = response.data.gnewsApiKey
            ? "Saved for this server run; blank keeps it"
            : "Not configured";
        elements.geminiApiKeyInput.placeholder = response.data.geminiApiKey
            ? "Saved for this server run; blank keeps it"
            : "Not configured";
    } catch (error) {
        elements.apiKeysSummaryStatus.textContent = "Local key settings unavailable";
        [elements.firmsMapKeyStatus, elements.gnewsApiKeyStatus, elements.geminiApiKeyStatus]
            .forEach((element) => {
                element.textContent = "Key status unavailable";
            });
    }
}

async function saveApiKeys(event) {
    event.preventDefault();
    const keys = {
        firmsMapKey: elements.firmsMapKeyInput.value,
        gnewsApiKey: elements.gnewsApiKeyInput.value,
        geminiApiKey: elements.geminiApiKeyInput.value,
        clear: []
    };

    if (elements.clearFirmsMapKey.checked) {
        keys.clear.push("firmsMapKey");
    }
    if (elements.clearGnewsApiKey.checked) {
        keys.clear.push("gnewsApiKey");
    }
    if (elements.clearGeminiApiKey.checked) {
        keys.clear.push("geminiApiKey");
    }

    if (!keys.firmsMapKey.trim() && !keys.gnewsApiKey.trim() && !keys.geminiApiKey.trim() && keys.clear.length === 0) {
        showApiKeysMessage("Enter a key or choose a saved key to remove.", "error");
        return;
    }

    elements.saveApiKeysBtn.disabled = true;
    showApiKeysMessage("Saving keys in server memory...", "info");

    try {
        await fetchJson("/api/settings/api-keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(keys)
        });
        elements.firmsMapKeyInput.value = "";
        elements.gnewsApiKeyInput.value = "";
        elements.geminiApiKeyInput.value = "";
        elements.clearFirmsMapKey.checked = false;
        elements.clearGnewsApiKey.checked = false;
        elements.clearGeminiApiKey.checked = false;
        elements.firmsMapKeyInput.disabled = false;
        elements.gnewsApiKeyInput.disabled = false;
        elements.geminiApiKeyInput.disabled = false;
        await refreshApiKeyStatus();
        showApiKeysMessage("Keys updated for this server run. Run a new analysis to use them.", "success");
    } catch (error) {
        showApiKeysMessage(error.message || "Unable to save API keys.", "error");
    } finally {
        elements.saveApiKeysBtn.disabled = false;
    }
}

function showApiKeysMessage(message, status) {
    elements.apiKeysMessage.className = `message-box message-${status} mt-3`;
    elements.apiKeysMessage.textContent = message;
}

async function analyzeFromManualCoordinates() {
    const validation = validateCoordinates(elements.latitudeInput.value, elements.longitudeInput.value);

    if (!validation.valid) {
        displayEmptyState();
        setStatus("error", "Invalid coordinates");
        showError(validation.message);
        return;
    }

    await analyzeRisk(validation.latitude, validation.longitude, "Manual coordinates");
}

async function getBrowserLocationAndAnalyze() {
    showInfo("Requesting browser location permission...");
    setButtonsDisabled(true);

    try {
        const position = await getUserLocation();
        const latitude = roundNumber(position.coords.latitude, 5);
        const longitude = roundNumber(position.coords.longitude, 5);
        elements.latitudeInput.value = latitude;
        elements.longitudeInput.value = longitude;
        await analyzeRisk(latitude, longitude, "Browser geolocation");
    } catch (error) {
        setButtonsDisabled(false);
        setStatus("error", "Location unavailable");
        showError("Location permission was denied or unavailable. Enter coordinates manually.");
    }
}

function getUserLocation() {
    return new Promise(function (resolve, reject) {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation is not supported."));
            return;
        }

        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 300000
        });
    });
}

async function analyzeRisk(latitude, longitude, source) {
    showInfo("Sending real-data request to Rudra backend...");
    setStatus("loading", "Analyzing risk");
    setButtonsDisabled(true);

    try {
        const requestBody = buildAnalyzeRequest(latitude, longitude);
        const response = await fetchJson("/api/risk/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        const data = response.data;
        cascadeNetResult.location = { ...data.location, source };
        cascadeNetResult.weather = data.weather;
        cascadeNetResult.hazardContext = data.hazardContext;
        cascadeNetResult.newsContext = data.newsContext;
        cascadeNetResult.inputFactors = data.inputFactors;
        cascadeNetResult.risk = data.risk;
        cascadeNetResult.recommendations = data.recommendations;
        cascadeNetResult.aiAssessment = data.aiAssessment;

        displayWeather(data.weather, data.hazardContext);
        displayApiDetails(data.weather, data.hazardContext, data.newsContext);
        displayRisk(data.risk);
        displayAiAssessment(data.aiAssessment);
        displayRecommendations(data.recommendations);
        displayDataQuality(data.risk.dataQuality || []);
        let simulationFailed = false;

        try {
            await simulateSelectedScenario();
        } catch (error) {
            handleSimulationError(error);
            simulationFailed = true;
        }

        renderRawJson();
        setStatus("live", simulationFailed ? "Risk result ready; simulation unavailable" : "Backend risk result ready");

        if (!simulationFailed) {
            showSuccess("Backend analyzed live data and selected risk factors successfully.");
        }
    } catch (error) {
        displayEmptyState();
        setStatus("error", "Backend request failed");
        showError(error.message || "Unable to analyze risk.");
    } finally {
        setButtonsDisabled(false);
    }
}

function buildAnalyzeRequest(latitude, longitude) {
    return {
        disasterType: elements.disasterTypeInput.value,
        location: {
            latitude,
            longitude,
            name: elements.areaNameInput.value.trim()
        },
        newsQuery: elements.areaNameInput.value.trim(),
        fieldReports: {
            cracks: elements.cracksInput.checked,
            slopeMovement: elements.movementInput.checked,
            flooding: elements.floodingInput.checked,
            roadBlockage: elements.roadBlockageInput.checked,
            buildingDamage: elements.buildingDamageInput.checked,
            powerOutage: elements.powerOutageInput.checked,
            fireSmoke: elements.fireSmokeInput.checked,
            medicalStress: elements.medicalStressInput.checked,
            waterShortage: elements.waterShortageInput.checked
        },
        terrain: {
            slopeRisk: elements.slopeRiskInput.value
        },
        operations: {
            roadBlockage: elements.roadStatusInput.value,
            infrastructureStatus: elements.infrastructureInput.value,
            populationExposure: elements.exposureInput.value,
            drainageCapacity: elements.drainageInput.value,
            riverLevel: elements.riverLevelInput.value
        },
        sensor: {
            soilMoisture: Number(elements.soilMoistureInput.value)
        },
        historical: {
            eventCount: Number(elements.historicalInput.value)
        }
    };
}

async function simulateSelectedScenario() {
    const response = await fetchJson("/api/risk/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            risk: cascadeNetResult.risk,
            scenario: elements.scenarioSelect.value
        })
    });

    cascadeNetResult.simulation = response.data;
    displaySimulation(response.data);
    renderRawJson();
}

function handleSimulationError(error) {
    cascadeNetResult.simulation = null;
    displaySimulation(null);
    renderRawJson();
    setStatus("live", "Risk result ready; simulation unavailable");
    showError(`Risk analysis is ready, but the intervention simulation failed: ${error.message || "Unknown error."}`);
}

async function fetchJson(path, options) {
    const response = await fetch(API_BASE_URL + path, options);
    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.success === false) {
        throw new Error((data && data.message) || `Request failed with status ${response.status}.`);
    }

    return data;
}

function displayWeather(weather, hazardContext) {
    const earthquakes = hazardContext && hazardContext.earthquakes ? hazardContext.earthquakes : null;
    const fireHotspots = hazardContext && hazardContext.fireHotspots ? hazardContext.fireHotspots : null;
    const floodForecast = hazardContext && hazardContext.floodForecast ? hazardContext.floodForecast : null;

    elements.weatherTimestamp.textContent = `Updated: ${formatDateTime(weather.updateTime)}`;
    elements.temperatureValue.textContent = formatMetric(weather.temperature, "C");
    elements.humidityValue.textContent = formatMetric(weather.humidity, "%");
    elements.rainValue.textContent = formatMetric(weather.rain, "mm");
    elements.dailyRainValue.textContent = formatMetric(weather.forecast && weather.forecast.dailyPrecipitation, "mm");
    elements.windValue.textContent = formatMetric(weather.windSpeed, "km/h");
    elements.gustValue.textContent = formatMetric(weather.windGusts, "km/h");
    elements.weatherCodeValue.textContent = weather.weatherCode;
    elements.coordinatesValue.textContent = `${roundNumber(weather.coordinates.latitude, 4)}, ${roundNumber(weather.coordinates.longitude, 4)}`;
    elements.earthquakeValue.textContent = earthquakes ? `${earthquakes.eventCount} within ${earthquakes.searchRadiusKm || 300} km` : "No data available";
    elements.magnitudeValue.textContent = earthquakes ? formatMetric(earthquakes.maxMagnitude, "Mw") : "No data available";
    elements.floodForecastValue.textContent = floodForecast ? `${formatMetric(floodForecast.pressureIndex, "index")} (${floodForecast.status})` : "No data available";
    elements.fireValue.textContent = fireHotspots ? `${fireHotspots.hotspotCount || 0} (${fireHotspots.status})` : "No data available";
    elements.timezoneValue.textContent = weather.timezone || "No data available";
}

function displayApiDetails(weather, hazardContext, newsContext) {
    const earthquakes = hazardContext && hazardContext.earthquakes ? hazardContext.earthquakes : null;
    const fireHotspots = hazardContext && hazardContext.fireHotspots ? hazardContext.fireHotspots : null;
    const floodForecast = hazardContext && hazardContext.floodForecast ? hazardContext.floodForecast : null;
    const news = newsContext || null;

    elements.sourceSummaryGrid.innerHTML = [
        sourceCard("Open-Meteo Weather", "ok", weather.source, weather.sourceUrl),
        sourceCard("Open-Meteo Flood", floodForecast && floodForecast.status, floodForecast && floodForecast.source, floodForecast && floodForecast.sourceUrl),
        sourceCard("USGS Earthquake", earthquakes && earthquakes.status, earthquakes && earthquakes.source, earthquakes && earthquakes.sourceUrl),
        sourceCard("NASA FIRMS Fire", fireHotspots && fireHotspots.status, fireHotspots && fireHotspots.source, fireHotspots && fireHotspots.sourceUrl),
        sourceCard("GNews Articles", news && news.status, news && news.source, news && news.sourceUrl)
    ].join("");

    elements.weatherSourceStatus.textContent = `${weather.source || "Open-Meteo"} | ${weather.timezone || "No timezone"}`;
    elements.floodSourceStatus.textContent = formatSourceStatus(floodForecast);
    elements.earthquakeSourceStatus.textContent = formatSourceStatus(earthquakes);
    elements.fireSourceStatus.textContent = formatSourceStatus(fireHotspots);
    elements.newsSourceStatus.textContent = formatNewsSourceStatus(news);

    elements.weatherForecastTable.innerHTML = renderWeatherForecastTable(weather.forecast && weather.forecast.days);
    elements.floodForecastTable.innerHTML = renderFloodForecastTable(floodForecast);
    elements.earthquakeEventsTable.innerHTML = renderEarthquakeEventsTable(earthquakes);
    elements.fireHotspotsTable.innerHTML = renderFireHotspotsTable(fireHotspots);
    elements.newsArticlesTable.innerHTML = renderNewsArticles(news);
}

function sourceCard(label, status, source, sourceUrl) {
    const normalizedStatus = status || "not_available";
    const sourceText = source || "No source available";
    const link = sourceUrl
        ? `<a href="${escapeAttribute(sourceUrl)}" target="_blank" rel="noreferrer">Source</a>`
        : "<span>No link</span>";

    return `
        <div class="source-card">
            <span>${escapeHtml(label)}</span>
            <strong class="source-status status-text-${escapeHtml(normalizedStatus)}">${escapeHtml(normalizedStatus)}</strong>
            <small>${escapeHtml(sourceText)}</small>
            ${link}
        </div>
    `;
}

function formatSourceStatus(source) {
    if (!source) {
        return "No data available";
    }

    const parts = [source.status || "unknown"];

    if (source.message) {
        parts.push(source.message);
    }

    return parts.join(" | ");
}

function renderWeatherForecastTable(days) {
    if (!Array.isArray(days) || days.length === 0) {
        return "No forecast rows available";
    }

    return renderTable(
        ["Date", "Rain", "Max Temp", "Max Wind", "Max Gust", "Code"],
        days.map((day) => [
            day.date,
            formatMetric(day.precipitation, "mm"),
            formatMetric(day.maxTemperature, "C"),
            formatMetric(day.maxWindSpeed, "km/h"),
            formatMetric(day.maxWindGusts, "km/h"),
            day.weatherCode
        ])
    );
}

function renderFloodForecastTable(floodForecast) {
    if (!floodForecast) {
        return "No flood forecast available";
    }

    if (floodForecast.status !== "ok") {
        return escapeHtml(floodForecast.message || `Status: ${floodForecast.status}`);
    }

    const summary = `
        <div class="inline-summary">
            <span>Pressure: ${formatMetric(floodForecast.pressureIndex, "index")}</span>
            <span>Current: ${formatMetric(floodForecast.currentDischarge, "m3/s")}</span>
            <span>Peak: ${formatMetric(floodForecast.peakDischarge, "m3/s")}</span>
            <span>Trend: ${formatMetric(floodForecast.trendRatio, "x")}</span>
        </div>
    `;

    if (!Array.isArray(floodForecast.days) || floodForecast.days.length === 0) {
        return `${summary}<p class="support-note">No daily flood rows available.</p>`;
    }

    return summary + renderTable(
        ["Date", "Discharge", "Mean", "Max", "P25", "P75"],
        floodForecast.days.map((day) => [
            day.date,
            formatMetric(day.riverDischarge, "m3/s"),
            formatMetric(day.riverDischargeMean, "m3/s"),
            formatMetric(day.riverDischargeMax, "m3/s"),
            formatMetric(day.riverDischargeP25, "m3/s"),
            formatMetric(day.riverDischargeP75, "m3/s")
        ])
    );
}

function renderEarthquakeEventsTable(earthquakes) {
    if (!earthquakes) {
        return "No earthquake context available";
    }

    if (earthquakes.status !== "ok") {
        return escapeHtml(earthquakes.message || `Status: ${earthquakes.status}`);
    }

    if (!Array.isArray(earthquakes.strongestEvents) || earthquakes.strongestEvents.length === 0) {
        return `No USGS earthquakes found within ${earthquakes.searchRadiusKm || 300} km in the last ${earthquakes.lookbackDays || 7} days.`;
    }

    return renderTable(
        ["Magnitude", "Distance", "Place", "Time"],
        earthquakes.strongestEvents.map((event) => [
            formatMetric(event.magnitude, "Mw"),
            formatMetric(event.distanceKm, "km"),
            event.place || event.title || "Unknown",
            formatDateTime(event.time)
        ])
    );
}

function renderFireHotspotsTable(fireHotspots) {
    if (!fireHotspots) {
        return "No fire hotspot context available";
    }

    if (fireHotspots.status !== "ok") {
        return escapeHtml(fireHotspots.message || `Status: ${fireHotspots.status}`);
    }

    if (!Array.isArray(fireHotspots.hotspots) || fireHotspots.hotspots.length === 0) {
        return "No NASA FIRMS fire hotspots found in the checked area.";
    }

    return renderTable(
        ["Distance", "Confidence", "FRP", "Latitude", "Longitude", "Date"],
        fireHotspots.hotspots.map((hotspot) => [
            formatMetric(hotspot.distanceKm, "km"),
            hotspot.confidence || "unknown",
            formatMetric(hotspot.frp, "MW"),
            roundNumber(hotspot.latitude, 4),
            roundNumber(hotspot.longitude, 4),
            `${hotspot.date || ""} ${hotspot.time || ""}`.trim()
        ])
    );
}

function formatNewsSourceStatus(newsContext) {
    if (!newsContext) {
        return "No data available";
    }

    const parts = [newsContext.status || "unknown"];

    if (newsContext.query) {
        parts.push(`query: ${newsContext.query}`);
    }

    if (newsContext.message) {
        parts.push(newsContext.message);
    }

    return parts.join(" | ");
}

function renderNewsArticles(newsContext) {
    if (!newsContext) {
        return "No news context available";
    }

    if (newsContext.status !== "ok") {
        return escapeHtml(newsContext.message || `Status: ${newsContext.status}`);
    }

    if (!Array.isArray(newsContext.articles) || newsContext.articles.length === 0) {
        return `No GNews articles found for ${escapeHtml(newsContext.query || "this request")}.`;
    }

    const signals = newsContext.riskSignals || {};
    const summary = `
        <div class="inline-summary">
            <span>Articles: ${escapeHtml(newsContext.articleCount || newsContext.articles.length)}</span>
            <span>Recent: ${escapeHtml(signals.recentArticleCount || 0)}</span>
            <span>Severity terms: ${escapeHtml(signals.highSeverityMentionCount || 0)}</span>
        </div>
    `;

    return summary + renderTable(
        ["Published", "Source", "Title"],
        newsContext.articles.map((article) => [
            formatDateTime(article.publishedAt),
            article.source && article.source.name ? article.source.name : "Unknown",
            article.url
                ? `<a href="${escapeAttribute(article.url)}" target="_blank" rel="noreferrer">${escapeHtml(article.title || "Untitled article")}</a>`
                : article.title || "Untitled article"
        ]),
        { allowHtmlColumns: [2] }
    );
}

function renderTable(headers, rows, options = {}) {
    const allowHtmlColumns = options.allowHtmlColumns || [];

    return `
        <table class="data-table">
            <thead>
                <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
            </thead>
            <tbody>
                ${rows.map((row) => `
                    <tr>${row.map((cell, index) => `<td>${allowHtmlColumns.includes(index) ? cell : escapeHtml(cell)}</td>`).join("")}</tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

function displayRisk(risk) {
    elements.riskScore.textContent = `${risk.score}/100`;
    elements.riskLevel.textContent = risk.level;
    elements.riskLevel.className = `risk-pill risk-${risk.level.toLowerCase()}`;
    elements.riskMeterFill.style.width = `${risk.score}%`;
    elements.riskMeterFill.className = `risk-meter-fill risk-fill-${risk.level.toLowerCase()}`;
    elements.riskExplanation.textContent = risk.explanation;

    elements.factorGrid.innerHTML = risk.factors.map(function (factor) {
        return `
            <div class="factor-card">
                <div class="factor-topline">
                    <strong>${escapeHtml(factor.label)}</strong>
                    <span class="risk-pill mini risk-${factor.level.toLowerCase()}">${escapeHtml(factor.level)}</span>
                </div>
                <dl>
                    <div><dt>Value</dt><dd>${escapeHtml(formatValue(factor.value, factor.unit))}</dd></div>
                    <div><dt>Weight</dt><dd>${Math.round(factor.weight * 100)}%</dd></div>
                    <div><dt>Source</dt><dd>${escapeHtml(formatSourceType(factor.sourceType))}</dd></div>
                    <div><dt>Status</dt><dd>${escapeHtml(factor.dataStatus || "available")}</dd></div>
                    <div><dt>Contribution</dt><dd>${factor.contribution}/100</dd></div>
                </dl>
                <p class="factor-reason">${escapeHtml(factor.reason)}</p>
            </div>
        `;
    }).join("");
}

function displayAiAssessment(aiAssessment) {
    if (!aiAssessment) {
        elements.aiStatusValue.textContent = "No data available";
        elements.aiScoreValue.textContent = "No data available";
        elements.aiLevelValue.textContent = "No data available";
        elements.aiConfidenceValue.textContent = "No data available";
        elements.aiBaselineValue.textContent = "No data available";
        elements.aiRationale.textContent = "Gemini assessment will appear after analysis when GEMINI_API_KEY is configured.";
        displayList(elements.aiDriversList, []);
        displayList(elements.aiTipsList, []);
        displayActionPlan([]);
        displayList(elements.aiNewsFindingsList, []);
        return;
    }

    elements.aiStatusValue.textContent = `${aiAssessment.source || "Gemini API"} | ${aiAssessment.status}`;
    elements.aiBaselineValue.textContent = `${aiAssessment.baselineScore}/100 (${aiAssessment.baselineLevel})`;

    if (aiAssessment.status !== "ok") {
        elements.aiScoreValue.textContent = "Not active";
        elements.aiLevelValue.textContent = aiAssessment.status;
        elements.aiConfidenceValue.textContent = "0/100";
        elements.aiRationale.textContent = aiAssessment.message || "Gemini AI assessment is not available.";
        displayList(elements.aiDriversList, []);
        displayList(elements.aiTipsList, []);
        displayActionPlan([]);
        displayList(elements.aiNewsFindingsList, []);
        return;
    }

    elements.aiScoreValue.textContent = `${aiAssessment.aiScore}/100`;
    elements.aiLevelValue.textContent = aiAssessment.aiLevel;
    elements.aiConfidenceValue.textContent = `${aiAssessment.confidence}/100`;
    elements.aiRationale.textContent = aiAssessment.scoreRationale || "Gemini returned an AI risk assessment.";
    displayList(elements.aiDriversList, aiAssessment.topDrivers);
    displayList(elements.aiTipsList, aiAssessment.tips);
    displayActionPlan(aiAssessment.actionPlan);
    displayList(elements.aiNewsFindingsList, aiAssessment.newsFindings);
}

function displayActionPlan(items) {
    if (!Array.isArray(items) || items.length === 0) {
        elements.aiActionPlanList.innerHTML = "<li>No data available</li>";
        return;
    }

    elements.aiActionPlanList.innerHTML = items.map((item) => {
        const priority = item.priority ? `<strong>${escapeHtml(item.priority)}</strong>` : "";
        const reason = item.reason ? `<span>${escapeHtml(item.reason)}</span>` : "";

        return `
            <li>
                ${priority}
                <p>${escapeHtml(item.action || "")}</p>
                ${reason}
            </li>
        `;
    }).join("");
}

function displayRecommendations(recommendations) {
    elements.recommendationList.innerHTML = recommendations.map(function (recommendation) {
        return `<li>${escapeHtml(recommendation)}</li>`;
    }).join("");
}

function displayDataQuality(notes) {
    elements.dataQualityList.innerHTML = notes.map(function (note) {
        return `<li>${escapeHtml(note)}</li>`;
    }).join("");
}

function displaySimulation(simulation) {
    if (!simulation) {
        elements.currentScenarioScore.textContent = "No data available";
        elements.simulatedScenarioScore.textContent = "No data available";
        elements.currentScenarioLevel.textContent = "No data available";
        elements.simulatedScenarioLevel.textContent = "No data available";
        elements.simulatedRange.textContent = "No data available";
        elements.simulationConfidence.textContent = "No data available";
        elements.estimatedChange.textContent = "No data available";
        displayList(elements.apiBackedFactorsList, []);
        displayList(elements.adjustableFactorsList, []);
        displayList(elements.fixedFactorsList, []);
        elements.simulationExplanation.textContent = "Simulation output will appear after backend analysis.";
        return;
    }

    elements.currentScenarioScore.textContent = `${simulation.currentScore}/100`;
    elements.simulatedScenarioScore.textContent = `${simulation.simulatedScore}/100`;
    elements.currentScenarioLevel.textContent = simulation.currentLevel;
    elements.simulatedScenarioLevel.textContent = simulation.simulatedLevel;
    elements.simulatedRange.textContent = `${simulation.simulatedScoreRange.low}-${simulation.simulatedScoreRange.high}/100`;
    elements.simulationConfidence.textContent = `${simulation.confidence.level} (${simulation.confidence.score}/100)`;
    elements.estimatedChange.textContent = `-${simulation.estimatedReduction} points, ${simulation.estimatedImprovementPercent}% improvement, about ${simulation.responseEstimate.estimatedMinutesSaved} response minutes saved`;
    elements.simulationExplanation.textContent = `${simulation.scenario}: ${simulation.explanation} ${simulation.confidence.note} ${simulation.disclaimer}`;
    displayList(elements.apiBackedFactorsList, simulation.simulationBasis.apiBackedFactors);
    displayList(elements.adjustableFactorsList, simulation.simulationBasis.adjustableFactors);
    displayList(elements.fixedFactorsList, simulation.simulationBasis.fixedObservationFactors);
}

function displayEmptyState() {
    Object.assign(cascadeNetResult, {
        location: null,
        weather: null,
        hazardContext: null,
        newsContext: null,
        inputFactors: null,
        risk: null,
        recommendations: [],
        aiAssessment: null,
        simulation: null
    });

    [
        "weatherTimestamp",
        "temperatureValue",
        "humidityValue",
        "rainValue",
        "dailyRainValue",
        "windValue",
        "gustValue",
        "weatherCodeValue",
        "coordinatesValue",
        "earthquakeValue",
        "magnitudeValue",
        "floodForecastValue",
        "fireValue",
        "timezoneValue",
        "weatherSourceStatus",
        "floodSourceStatus",
        "earthquakeSourceStatus",
        "fireSourceStatus",
        "newsSourceStatus"
    ].forEach((key) => {
        elements[key].textContent = "No data available";
    });

    elements.sourceSummaryGrid.innerHTML = '<div class="source-card empty-state">No API data loaded</div>';
    elements.weatherForecastTable.textContent = "No data available";
    elements.floodForecastTable.textContent = "No data available";
    elements.earthquakeEventsTable.textContent = "No data available";
    elements.fireHotspotsTable.textContent = "No data available";
    elements.newsArticlesTable.textContent = "No data available";
    elements.riskScore.textContent = "--";
    elements.riskLevel.textContent = "No data available";
    elements.riskLevel.className = "risk-pill risk-none";
    elements.riskMeterFill.style.width = "0%";
    elements.riskMeterFill.className = "risk-meter-fill";
    elements.riskExplanation.textContent = "Send coordinates and risk factors to the backend to calculate Rudra's prototype score.";
    elements.factorGrid.innerHTML = '<div class="factor-card empty-state">No backend result available</div>';
    displayAiAssessment(null);
    elements.recommendationList.innerHTML = "<li>No data available</li>";
    elements.dataQualityList.innerHTML = "<li>No data quality notes available</li>";
    displaySimulation(null);
    renderRawJson();
}

function validateCoordinates(latitudeValue, longitudeValue) {
    const latitudeResult = parseCoordinate(latitudeValue, "latitude");
    const longitudeResult = parseCoordinate(longitudeValue, "longitude");

    if (!latitudeResult.valid || !longitudeResult.valid) {
        return {
            valid: false,
            message: latitudeResult.message || longitudeResult.message
        };
    }

    if (latitudeResult.value < -90 || latitudeResult.value > 90) {
        return { valid: false, message: "Latitude must be between -90 and 90." };
    }

    if (longitudeResult.value < -180 || longitudeResult.value > 180) {
        return { valid: false, message: "Longitude must be between -180 and 180." };
    }

    return {
        valid: true,
        latitude: latitudeResult.value,
        longitude: longitudeResult.value
    };
}

function parseCoordinate(value, coordinateType) {
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

function setStatus(status, text) {
    elements.liveStatus.className = `live-status status-${status}`;
    elements.liveStatus.querySelector("span:last-child").textContent = text;
}

function setButtonsDisabled(disabled) {
    elements.useLocationBtn.disabled = disabled;
    elements.analyzeBtn.disabled = disabled;
}

function showInfo(message) {
    elements.messageBox.className = "message-box message-info mt-3";
    elements.messageBox.textContent = message;
}

function showSuccess(message) {
    elements.messageBox.className = "message-box message-success mt-3";
    elements.messageBox.textContent = message;
}

function showError(message) {
    elements.messageBox.className = "message-box message-error mt-3";
    elements.messageBox.textContent = message;
}

function formatValue(value, unit) {
    if (value === null || value === undefined) {
        return "Unavailable";
    }

    if (Array.isArray(value)) {
        return value.join(", ");
    }

    if (typeof value === "number") {
        return formatMetric(value, unit);
    }

    return `${value} ${unit}`;
}

function formatMetric(value, unit) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return "No data available";
    }

    return `${roundNumber(value, 1)} ${unit}`;
}

function formatSourceType(sourceType) {
    return sourceType === "api" ? "API" : "Operator";
}

function displayList(element, items) {
    if (!Array.isArray(items) || items.length === 0) {
        element.innerHTML = "<li>No data available</li>";
        return;
    }

    element.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function roundNumber(value, digits) {
    const multiplier = 10 ** digits;
    return Math.round(Number(value) * multiplier) / multiplier;
}

function formatDateTime(value) {
    if (!value) {
        return "No data available";
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function renderRawJson() {
    elements.rawJsonOutput.textContent = JSON.stringify(cascadeNetResult, null, 2);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
    return escapeHtml(value);
}
