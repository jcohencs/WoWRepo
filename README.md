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

## How data is pulled

Every visitor sees the **most recent saved pull**, so the site doesn't call Warcraft Logs on every page view:

- Anything pulled before (characters, benchmarks, logs) is served instantly from `.cache/` with an "Updated … ago" note. If it is old, it is refreshed in the background.
- Only a character nobody has searched yet waits on Warcraft Logs; after that everyone gets the saved copy.
- Every 10 minutes a refresher re-pulls characters people have viewed in the last two weeks, stalest first. It only runs while at least 35% of the hourly allowance is left, so new searches always have room.
- Old logs never change, so they are kept for 30 days. Benchmarks refresh daily and characters every 2 hours.

To fill the cache ahead of time, pre-pull benchmarks for a spec:

```bash
npm run sync -- --class Warrior --spec Fury
```

It skips what's saved and stops before the hourly limit; run it again after the reset to continue.

## Put it online

The API key must stay on the server, so this needs a host that runs Node (not a static host).

**Render (simplest):**
1. Sign in at <https://render.com> with GitHub.
2. **New → Blueprint**, pick this repository. Render reads `render.yaml`.
3. When asked, paste `WCL_CLIENT_ID` and `WCL_CLIENT_SECRET`, then **Apply**.
4. After the build, your site is live at `https://parsecheck-xxxx.onrender.com`.

`render.yaml` uses the Starter plan with a 1 GB disk so saved data survives restarts. The free plan works too, but it sleeps when idle and starts with an empty cache each time.

**Anywhere else with Docker** (Fly.io, Railway, a VPS):

```bash
docker build -t parsecheck .
docker run -p 8787:8787 -e WCL_CLIENT_ID=… -e WCL_CLIENT_SECRET=… -v parsecheck-data:/data parsecheck
```

Keep the key in the host's environment settings, never in a committed file.

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
