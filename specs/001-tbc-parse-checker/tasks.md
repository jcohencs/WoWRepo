---
description: "Task list for TBC Parse Checker"
---

# Tasks: TBC Parse Checker

**Input**: Design documents from `/specs/001-tbc-parse-checker/`

**Tests**: Unit tests for the pure core (Constitution IV).

## Phase 1: Setup

- [x] T001 Initialise package, TypeScript, Vite, Vitest config in `package.json`, `tsconfig.json`, `vite.config.ts`
- [x] T002 [P] Add `.env.example`, `.gitignore`, `README.md`

## Phase 2: Foundational

- [x] T003 Define API contract types in `shared/types.ts`
- [x] T004 [P] Class/spec table, metric selection, colours in `server/core/classes.ts`
- [x] T005 [P] Percentile rank math in `server/core/percentile.ts` + `tests/unit/percentile.test.ts`
- [x] T006 [P] Input parsing (realm slug, WCL URL) in `server/core/input.ts` + `tests/unit/input.test.ts`
- [x] T007 TTL cache in `server/cache.ts`
- [x] T008 WCL OAuth + GraphQL client in `server/wcl/client.ts`
- [x] T009 `Provider` interface in `server/provider.ts`; demo provider in `server/demo/`
- [x] T010 API router in `server/handler.ts`; Vite middleware + `server/index.ts`

## Phase 3: User Story 1 — p99 table (P1) 🎯 MVP

- [x] T011 [US1] Zone discovery + character zone rankings in `server/wcl/provider.ts`
- [x] T012 [US1] Batched benchmark lookup (page 1 → percentile pages) in `server/wcl/provider.ts`
- [x] T013 [US1] Row + summary assembly in `server/core/report.ts` + `tests/unit/report.test.ts`
- [x] T014 [US1] Search bar, raid tabs, boss table UI in `src/components/`

## Phase 4: User Story 2 — ability comparison (P2)

- [x] T015 [US2] Ability diff in `server/core/compare.ts` + `tests/unit/compare.test.ts`
- [x] T016 [US2] Report tables fetch in `server/wcl/provider.ts`
- [x] T017 [US2] Comparison panel UI in `src/components/ComparePanel.tsx`

## Phase 5: User Story 3 — raid summary (P3)

- [x] T018 [US3] Summary strip in `src/components/Summary.tsx`

## Phase 6: Polish

- [x] T019 Handler tests in demo mode `tests/unit/handler.test.ts`
- [x] T020 360px layout pass, empty/error/loading states

## Phase 7: Feedback round 1

- [x] T021 Split combined WCL zones into single raids (BT / Hyjal, SSC / TK, Gruul / Mag) in `server/core/raids.ts`; raid dropdown replaces tabs
- [x] T022 Realm dropdown (superseded by T026)
- [x] T023 Ability breakdown: one view, share chart + difference on the right, no sort tabs
- [x] T024 Plain-language labels ("Top 1%", "Typical player", "9% behind"), larger type, higher-contrast secondary text
- [x] T025 Faster comparison: best-kill lookups warmed with the raid report, both logs loaded in parallel and cached per report, results cached server-side, prefetch on hover client-side

## Phase 8: Feedback round 2

- [x] T026 Realms limited to Dreamscythe and Nightslayer (US); region picker and `/api/realms` removed
- [x] T027 Difference column becomes a diverging bar (left/orange = top 1% more, right/grey = you more) with the value at the bar end
- [x] T028 Ability icons enlarged to 36px
