# Quickstart

1. `npm install`
2. Create a WCL API client at https://www.warcraftlogs.com/api/clients (any redirect URL).
3. `cp .env.example .env` and set `WCL_CLIENT_ID`, `WCL_CLIENT_SECRET` (optionally `WCL_SITE=classic`).
4. `npm run dev` → http://localhost:5173
5. Search a character, pick a raid, click a boss to compare against the 99th percentile log.

Without step 3 the app runs in demo mode with fixture data.

Validation: `npm test && npm run typecheck`.
