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

`WCL_SITE=fresh` (default) reads TBC Anniversary logs, while `WCL_SITE=classic` reads original TBC Classic logs.

Without credentials the app runs on generated **demo data**, labelled as such in the header.

Production: `npm run build && npm start` serves the built app and API on `PORT` (default 8787).

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
