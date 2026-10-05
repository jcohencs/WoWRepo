# Parsecheck

See how your **TBC** Warcraft Logs parses compare to the **99th percentile of your class and spec**, boss by boss, then open any boss to line your log up against the player sitting at the 99th percentile, ability by ability.

- Per boss: your best DPS/HPS, parse, median (p50), 99th percentile, gap to p99, and how many parses the benchmark came from.
- Percentiles are read from the exact ranking position (`rank = ceil(N × (1 − p))`) on Warcraft Logs, not estimated.
- **Spec bar** to view any of your class's specs (or each boss's best spec).
- **By week:** your best kill per raid week as a line chart; pick any week to compare that kill instead of your best.
- **More charts per boss:** output over the fight, damage taken by school, preparation and uptime (flask, food, potions, time active), and where you rank on the real percentile ladder (10th–99th).
- A slim sidebar lists every boss with your parse as a coloured bar (parse by boss); the selected boss's numbers and breakdown fill the rest of the page.
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

There is no waiting line. The site keeps everyone on the realm pulled ahead of time, and anything else is fetched the moment someone opens it.

- **Every raider, ahead of time.** Every 15 minutes (`PULL_INTERVAL_MINUTES`) a background job finds everyone with a ranked kill on Nightslayer (re-checked daily) and pulls each character's page for every released raid, ten characters per request, newest raid first. Pages are refreshed daily (`RAIDER_REFRESH_HOURS`, default 24); anyone can press **Refresh** on a character to pull them again right away (at most once per 10 minutes per page, and only while the hourly allowance has room). The log says for each batch who is new and who is being refreshed.
- **Anything else, on first click.** A boss's ability comparison, or a spec nobody has opened yet, is fetched right away (a few seconds), saved, and instant for everyone after that.
- **Allowance.** The background job stops while 20% of the hourly allowance is left (`SWEEP_RESERVE`), so first clicks always have room. If Warcraft Logs is ever out of allowance at that moment, the visitor is told roughly when it'll be ready and it is pulled automatically after the reset.
- Every page shows when it was pulled ("Updated 25 min ago").

### Start with everyone already there

With a 720-point allowance the first full pull takes a while. Do it once on your computer, then ship the result with the site:

```bash
# stop the website first: both share the hourly allowance
npm run prefill
```

It keeps going through hourly resets (leave it running overnight), prints progress and an estimate, and when everyone is pulled writes `data/seed-fresh.json.gz`. Commit and push that file:

```bash
git add data/seed-fresh.json.gz && git commit -m "Update data snapshot" && git push
```

A server with no saved data yet (like a new Render disk) starts from that snapshot, and the background job keeps it fresh from there. You can stop `prefill` with Ctrl+C at any time and run it again later; nothing is lost.

To pre-pull only benchmarks for one spec: `npm run sync -- --class Warrior --spec Fury`.

## Request log

Every Warcraft Logs request is logged in the terminal (and in Render's **Logs** tab):

```
[wcl] ok      character Alphac · 412ms +3 pts · 1240/18000 used this hour
[wcl] ok      rankings ×9 · 690ms +18 pts · 1258/18000 used this hour
[wcl] limited log aB3x (breakdown) · 0ms
[parsecheck] Pull finished. Up to date (latest raid): Nightslayer 412/1530. Waiting: 0.
```

Set `WCL_LOG=off` to silence the per-request lines. The hourly allowance is read from Warcraft Logs on every request, so a higher tier is used automatically.

## Something not working?

```bash
npm run doctor -- --name Yourcharacter
```

Checks each kind of Warcraft Logs request with your key (raid list, finding raiders, a character page, a comparison) and prints ✓ or ✗ with Warcraft Logs' own error message. It doesn't print your key, so the output is safe to share. Failed scheduled pulls are also logged as `[parsecheck] Pull failed for …` lines.

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
