# Parsecheck

See how your **TBC** Warcraft Logs parses compare to the **99th percentile of your class and spec**, boss by boss, then open any boss to line your log up against the player sitting at the 99th percentile, ability by ability.

- Per boss: your best DPS/HPS, parse, median (p50), 99th percentile, gap to p99, and how many parses the benchmark came from.
- Percentiles are read from the exact ranking position (`rank = ceil(N × (1 − p))`) on Warcraft Logs, not estimated.
- **Spec bar** to view any of your class's specs (or each boss's best spec).
- **Parse by boss** column chart for the whole raid, in Warcraft Logs parse colours.
- Comparison view: head-to-head meters (DPS, kill time, time active, total), pie charts of where the damage comes from, a buttons-pressed-per-minute chart, and the full ability list.
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

Only Nightslayer (US TBC Anniversary) is supported for now; add realms to `REALMS` in `shared/types.ts`.

Without credentials the app runs on generated **demo data**, labelled as such in the header.

Production: `npm run build && npm start` serves the built app and API on `PORT` (default 8787).

## How data is pulled

Visitors only ever see **saved data**. The site never calls Warcraft Logs because someone opened a page; a scheduled job does all the pulling.

- **Every 10 minutes** (`PULL_INTERVAL_MINUTES`) the puller runs, in this order, until the hourly allowance runs low:
  1. Anything a visitor is waiting on (a character or boss comparison not saved yet), in the order asked.
  2. Saved pages people still open: characters older than 2 hours, comparisons older than 12 hours, stalest first.
  3. **Finding everyone on the realms** (daily): it reads the Nightslayer rankings for the first boss of every raid and keeps a list of everyone with a ranked kill.
  4. **Pulling everyone**: every listed character's raid pages, ten characters per request, newest raid first, refreshed daily.

  Steps 2–4 stop while 15% of the hourly allowance is left, so a visitor's new lookup always fits in the next run. The first full pass over both realms takes a while on a 720-point allowance; each run logs how far it got, e.g. `Up to date (latest raid): Nightslayer 412/1530`.
- The search box suggests names from that list.
- A character that isn't saved yet shows "not pulled yet, number 2 in line, about 8 minutes" and fills in by itself after the next run.
- Every page shows when it was pulled ("Updated 25 min ago").
- Pages nobody opens for two weeks stop being refreshed.

Everything lives in one file, `.cache/wcl-<site>.json` (or `$CACHE_DIR`). To fill in benchmarks ahead of time, stop the site and run:

```bash
npm run sync -- --class Warrior --spec Fury
```

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
