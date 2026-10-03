# CASCADE-NET Risk Intelligence API Contract

This module is backend-first. The frontend is only a tester for Rudra's backend APIs.

## Data Sources

- Open-Meteo Forecast API for live weather and 3-day forecast values.
- Open-Meteo Global Flood API for flood river-discharge forecast values.
- USGS Earthquake Query API for recent nearby earthquake context.
- NASA FIRMS Area API for wildfire hotspots when `FIRMS_MAP_KEY` is configured.
- GNews API for recent risk-related news articles when `GNEWS_API_KEY` is configured.
- Gemini API for optional AI scoring, explanation, and user tips when `GEMINI_API_KEY` is configured.
- Operator inputs for field reports, road status, infrastructure, exposure, drainage, river level, soil moisture, terrain, and known historical local event count.

Missing external API data is not replaced with fake values. API-backed factors are marked `UNAVAILABLE` and receive `0` contribution when the external source is unavailable or not configured.

## Local API Key Settings

The browser tester can configure optional API keys for the current server process:

- `GET /api/settings/api-keys` returns only `true`/`false` configured status for `firmsMapKey`, `gnewsApiKey`, and `geminiApiKey`.
- `POST /api/settings/api-keys` accepts any of those fields as strings and applies non-empty values to server memory. Empty or omitted fields leave their current values unchanged. An optional `clear` array can contain setting names to remove, for example `{"clear":["geminiApiKey"]}`.

These routes require a loopback connection and an origin matching the local `localhost`, `127.0.0.1`, or `[::1]` app address. Key values are never returned or written to disk and are lost when the server restarts. Use `.env` for local configuration that should survive a restart; never commit credentials.

## Analyze Risk

`POST /api/risk/analyze`

Request:

```json
{
  "disasterType": "flood",
  "location": {
    "latitude": 28.6139,
    "longitude": 77.209,
    "name": "Delhi Yamuna"
  },
  "newsQuery": "Delhi Yamuna",
  "fieldReports": {
    "cracks": true,
    "slopeMovement": false,
    "flooding": true,
    "roadBlockage": false,
    "buildingDamage": false,
    "powerOutage": false,
    "fireSmoke": false,
    "medicalStress": false,
    "waterShortage": false
  },
  "terrain": {
    "slopeRisk": "HIGH"
  },
  "operations": {
    "roadBlockage": "PARTIAL",
    "infrastructureStatus": "WATCH",
    "populationExposure": "MODERATE",
    "drainageCapacity": "POOR",
    "riverLevel": "WATCH"
  },
  "sensor": {
    "soilMoisture": 65
  },
  "historical": {
    "eventCount": 2
  }
}
```

Supported `disasterType` values:

```text
flood, landslide, storm, heatwave, wildfire, earthquake, drought
```

Response:

```json
{
  "success": true,
  "data": {
    "location": {
      "latitude": 28.6139,
      "longitude": 77.209
    },
    "weather": {
      "temperature": 32.1,
      "humidity": 61,
      "rain": 0.2,
      "windSpeed": 11.4,
      "windGusts": 21.8,
      "weatherCode": 2,
      "forecast": {
        "dailyPrecipitation": 8.2,
        "maxTemperature": 34.1,
        "maxWindSpeed": 18.3,
        "maxWindGusts": 32.5
      },
      "source": "Open-Meteo Forecast API"
    },
    "hazardContext": {
      "earthquakes": {
        "status": "ok",
        "source": "USGS Earthquake Query API",
        "lookbackDays": 7,
        "searchRadiusKm": 300,
        "eventCount": 0,
        "maxMagnitude": 0,
        "nearestDistanceKm": 999
      },
      "fireHotspots": {
        "status": "not_configured",
        "source": "NASA FIRMS Area API",
        "hotspotCount": 0
      },
      "floodForecast": {
        "status": "ok",
        "source": "Open-Meteo Global Flood API",
        "forecastDays": 7,
        "pressureIndex": 58,
        "currentDischarge": 760,
        "peakDischarge": 1370
      }
    },
    "newsContext": {
      "status": "ok",
      "source": "GNews API",
      "query": "\"Delhi Yamuna\" (\"flood\" OR \"waterlogging\" OR \"heavy rain\")",
      "articleCount": 2,
      "riskSignals": {
        "relevantArticleCount": 2,
        "recentArticleCount": 1,
        "highSeverityMentionCount": 1,
        "matchedSeverityTerms": ["warning"]
      },
      "articles": []
    },
    "risk": {
      "disasterType": "flood",
      "disasterLabel": "Flood / Urban Waterlogging",
      "score": 47,
      "level": "MODERATE",
      "factors": [
        {
          "key": "dailyPrecipitation",
          "label": "Forecast Daily Precipitation",
          "value": 8.2,
          "unit": "mm",
          "sourceType": "api",
          "dataStatus": "available",
          "level": "MODERATE",
          "rawScore": 42,
          "weight": 0.18,
          "contribution": 7.6,
          "reason": "Forecast rain may affect drainage and exposed routes."
        }
      ],
      "majorContributors": [],
      "explanation": "Flood / Urban Waterlogging risk is classified as MODERATE.",
      "dataQuality": [],
      "ruleVersion": "CASCADE-NET-RUDRA-PROTOTYPE-v2"
    },
    "aiAssessment": {
      "status": "ok",
      "source": "Gemini API",
      "model": "gemini-2.5-flash",
      "baselineScore": 47,
      "baselineLevel": "MODERATE",
      "aiScore": 52,
      "aiLevel": "HIGH",
      "confidence": 68,
      "scoreDelta": 5,
      "scoreRationale": "Gemini explanation based on supplied weather, hazard, operator, and news evidence.",
      "topDrivers": [],
      "tips": [],
      "actionPlan": [
        {
          "priority": "P1",
          "action": "Check low-lying road access near the selected area.",
          "reason": "Flooding reports and forecast rain can reduce passability."
        }
      ],
      "newsFindings": [],
      "disclaimer": "AI assessment is decision support only and is not an official disaster warning."
    },
    "recommendations": [],
    "generatedAt": "2026-09-01T12:00:00.000Z"
  }
}
```

If `GNEWS_API_KEY` or `GEMINI_API_KEY` is missing, `newsContext.status` or `aiAssessment.status` is `not_configured`. The baseline `risk` object is still calculated normally.

## Simulate Intervention

`POST /api/risk/simulate`

Request:

```json
{
  "risk": {},
  "scenario": "flood-response"
}
```

Use the `risk` object returned by `/api/risk/analyze`.

Supported scenario values:

```text
flood-response
slope-stabilization
storm-readiness
heat-health-plan
wildfire-containment
earthquake-rapid-assessment
drought-water-management
increased-monitoring
```

Response includes:

```json
{
  "success": true,
  "data": {
    "scenario": "Flood Response",
    "currentScore": 47,
    "currentLevel": "MODERATE",
    "simulatedScore": 39,
    "simulatedLevel": "MODERATE",
    "simulatedScoreRange": {
      "low": 31,
      "high": 47,
      "spread": 8
    },
    "estimatedReduction": 8,
    "estimatedImprovementPercent": 17,
    "confidence": {
      "score": 66,
      "level": "MEDIUM",
      "apiBackedWeightPercent": 52,
      "adjustedFactorWeightPercent": 42,
      "scenarioFit": "matched"
    },
    "responseEstimate": {
      "currentPriority": "Priority 3",
      "simulatedPriority": "Priority 3",
      "estimatedMinutesSaved": 24
    }
  }
}
```

## Browser Integration Object

The test frontend stores the latest result at:

```js
window.CASCADE_NET_RESULT
```

The object includes:

```js
{
  location,
  weather,
  hazardContext,
  newsContext,
  inputFactors,
  risk,
  recommendations,
  aiAssessment,
  simulation
}
```

All scores are explainable, weighted, rule-based estimates. They are not official disaster alerts.
