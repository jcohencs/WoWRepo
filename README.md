# Parsecheck

See how your **TBC** Warcraft Logs parses compare to the **99th percentile of your class and spec**, boss by boss, then open any boss to line your log up against the player sitting at the 99th percentile, ability by ability.

- Per boss: your best DPS/HPS, parse, median (p50), 99th percentile, gap to p99, and how many parses the benchmark came from.
- Percentiles are read from the exact ranking position (`rank = ceil(N × (1 − p))`) on Warcraft Logs, not estimated.
- Comparison view: kill time, active time, share of damage/healing and casts per minute for every ability, sorted by the biggest difference.
- Paste a Warcraft Logs character link into the search to fill everything in.
- Works on phones.

## Run it

```bash
npm install
cp .env.example .env   # add your Warcraft Logs API client id/secret
npm run dev            # http://localhost:5173
```

Create an API client at <https://www.warcraftlogs.com/api/clients> (any redirect URL works; the app uses the client-credentials flow). Your secret stays on the server. The browser only talks to `/api/*`.

When `npm run dev` starts, a `[parsecheck]` line in the terminal tells you whether the key was loaded or what is missing. `.env.txt` also works.

Realms are limited to Dreamscythe and Nightslayer (US TBC Anniversary); edit `REALMS` in `shared/types.ts` to add more.

Without credentials the app runs on generated **demo data**, labelled as such in the header.

Production: `npm run build && npm start` serves the built app and API on `PORT` (default 8787).

## Staying under the Warcraft Logs hourly limit

Your API key gets a fixed number of points per hour (the header shows how many are used). To make them go further:

- **Everything is saved** in `.cache/` and reused after restarts. Old logs never change, so they are kept for a month; benchmarks for a day.
- **Pre-download your spec** so the raid tables load from saved data:

  ```bash
  npm run sync -- --class Warrior --spec Fury
  npm run sync -- --class Priest --spec Shadow --raid "Black Temple,Sunwell Plateau"
  ```

  It skips what's already saved and stops by itself before the limit; run it again after the reset to finish.
- When the allowance runs out, the app keeps working from saved results and tells you when it resets.

## Checks

```bash
npm test
npm run typecheck
```

## How it's built

The app was planned with [GitHub Spec Kit](https://github.com/github/spec-kit). The constitution is in `.specify/memory/constitution.md`, and the spec, plan, research, contract and tasks are in `specs/001-tbc-parse-checker/`. Use `/speckit-specify` in Claude Code to start the next feature.

```
shared/types.ts      API contract shared by server and client
server/core/         pure stat logic (percentiles, gaps, ability diff, input parsing), unit tested
server/wcl/          Warcraft Logs GraphQL client + provider (batched, cached)
server/demo/         fixture provider for demo mode
server/handler.ts    /api routes (mounted into Vite in dev, into server/index.ts in prod)
src/                 React UI, hand-written CSS
```
