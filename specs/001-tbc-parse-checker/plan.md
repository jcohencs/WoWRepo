# Implementation Plan: TBC Parse Checker

**Branch**: `claude/relaxed-galileo-x7g4ol` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-tbc-parse-checker/spec.md`

## Summary

A single web app: a React front end and a small Node API layer that holds the Warcraft Logs
(WCL) credentials and queries the WCL v2 GraphQL API. For each TBC boss the server reads the
spec's ranking list, jumps straight to the ranking page that holds the 50th and 99th
percentile positions, and returns those amounts next to the character's best. A second
endpoint pulls the damage/healing and cast tables for the character's best kill and for the
p99 player's kill and diffs them per ability. A fixture provider powers demo mode and tests.

## Technical Context

**Language/Version**: TypeScript 5, Node 20+

**Primary Dependencies**: React 18, Vite 8 (dev server + build), tsx (runs the server); no UI kit

**Storage**: In‑memory TTL cache (rankings 6h, reports 24h, characters 10 min)

**Testing**: Vitest

**Target Platform**: Any Node 20+ host; modern browsers

**Project Type**: Web application (SPA + thin API)

**Performance Goals**: Raid table in ≤ 3 WCL requests (1 character + 2 batched ranking queries)

**Constraints**: Credentials server‑side only; respect WCL rate limits through batching + cache

**Scale/Scope**: Personal/guild tool; 6 TBC raids, ~9 classes × 3–4 specs

## Constitution Check

| Principle | How the plan complies |
|---|---|
| I. Honest Numbers | Percentiles read from exact rank via `percentileRank()`; N returned and displayed; demo banner |
| II. Secrets server‑side | Browser only calls `/api/*`; token exchange in `server/wcl/client.ts` |
| III. Restrained UI | Hand‑written CSS tokens, tabular numerals, semantic colour only |
| IV. Pure core | `server/core/*` pure + unit tested; `Provider` interface with WCL and fixture implementations |
| V. Simplicity | 3 runtime deps (react, react-dom, tsx); Vite middleware mounts the API in dev — one command |

Re‑check after design: ✅ no violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-tbc-parse-checker/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
└── tasks.md
```

### Source Code (repository root)

```text
shared/
└── types.ts            # API contract types used by server and client
server/
├── core/               # pure logic (percentiles, compare, parsing, classes)
├── wcl/                # WCL GraphQL client, queries, provider
├── demo/               # fixture provider for demo mode
├── cache.ts
├── handler.ts          # /api/* router (Node req/res)
└── index.ts            # production server (static dist + API)
src/
├── components/
├── lib/
├── App.tsx
├── main.tsx
└── styles.css
tests/
└── unit/
```

**Structure Decision**: Single package with `server/` and `src/`; Vite mounts `server/handler.ts`
as middleware in dev so `npm run dev` is the only command.

## Complexity Tracking

None.
