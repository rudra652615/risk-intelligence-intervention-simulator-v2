# CASCADE-NET Risk Intelligence + Intervention Simulator

An explainable, multi-hazard risk-scoring API with a browser-based tester. The backend combines weather and hazard context with operator-provided field reports and local conditions to produce a 0–100 baseline score, recommendations, and an intervention simulation.

> **Important:** This is a prototype decision-support tool. Scores and recommendations are estimates, not official warnings or emergency instructions. Follow local authorities and emergency services.

## Capabilities

- Risk analysis for floods, landslides, storms, heatwaves, wildfires, earthquakes, and drought.
- Factor-level contributions and data-quality notes for the rule-based score.
- Intervention scenarios with estimated score changes and confidence details.
- Optional AI assessment, news context, and wildfire hotspot data when their API keys are configured.
- A browser interface for entering coordinates and operator observations.

The backend uses Open-Meteo for weather and flood forecasts and USGS for earthquake context without requiring API keys. NASA FIRMS, GNews, and Gemini are optional and require their respective keys. When an external source is unavailable, the API reports its status rather than treating missing data as a real low-risk measurement.

## Requirements

- Node.js 18 or later
- npm

## Run locally

Install the locked dependencies:

```sh
npm ci
```

Start the server:

```sh
npm start
```

Open <http://localhost:3000>. For automatic restarts during development, use `npm run dev`. Run the existing tests with `npm test`.

The app works without optional API keys. To enable those integrations, copy `.env.example` to `.env` in the project root and add only the keys you want to use. In PowerShell:

```powershell
Copy-Item .env.example .env
```

In macOS, Linux, or Git Bash:

```sh
cp .env.example .env
```

Alternatively, open the **API keys** panel in the app to provide keys for the current server run. Keys entered there are held in server memory until restart and are not written to `.env` or browser storage. This settings endpoint accepts requests only from the local app on `localhost`; the server binds to `127.0.0.1` by default. Never commit `.env` or share API keys. See [SECURITY.md](SECURITY.md) before exposing the app to a network.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service status |
| `GET` | `/api/risk/rules` | Scoring profiles, factors, and interventions |
| `GET` | `/api/weather?latitude=28.6139&longitude=77.209` | Weather and forecast |
| `GET` | `/api/hazards?latitude=28.6139&longitude=77.209&disasterType=flood` | Hazard context |
| `POST` | `/api/risk/analyze` | Calculate baseline risk and recommendations |
| `POST` | `/api/risk/simulate` | Simulate an intervention against an analysis result |

Request and response examples are in [`integration/API_CONTRACT.md`](integration/API_CONTRACT.md).

Coordinates accept decimal degrees, optionally with a direction suffix, for example `28.6139 N, 77.2090 E` or `40.7128 N, 74.0060 W`.

## Contributing

Keep changes focused, preserve the API contract where possible, and run `npm test` before submitting. Do not include credentials, private operational information, or real personal location data in issues, tests, or pull requests.

## License

No license has been selected or included. Choose a license before publishing if you intend to grant reuse or redistribution rights.
