<!--
Sync Impact Report
- Version: 0.0.0 → 1.0.0 (initial ratification)
- Principles added: I–V
- Templates reviewed: plan-template.md ✅, spec-template.md ✅, tasks-template.md ✅ (no changes required)
-->
# Parsecheck Constitution

## Core Principles

### I. Honest Numbers (NON-NEGOTIABLE)
Every figure shown to a player MUST be traceable to Warcraft Logs data or to a documented,
deterministic calculation over it. Percentile benchmarks are read from the actual ranking
position (rank = ceil(N × (1 − p))), never estimated or interpolated from partial samples.
Sample size (number of ranked parses) MUST be visible wherever a benchmark is shown.
Demo/fixture data MUST be labelled as such on screen at all times.

### II. Secrets Stay Server-Side
Warcraft Logs API credentials MUST never reach the browser. The client talks only to this
project's own `/api/*` endpoints. Credentials come from environment variables, never from
committed files.

### III. Restrained, Legible Interface
The UI exists to make numbers easy to read and compare. No decorative gradients, glass
effects, emoji, or ornamental icons. Colour is used semantically only: class colours for
identity and the standard Warcraft Logs parse colours for performance. Numbers use tabular
figures and are right-aligned. Every view MUST work at 360px wide.

### IV. Pure, Tested Core
Stat math (percentile rank lookup, gap calculation, ability comparison, input parsing) lives
in pure functions with unit tests. Network code is a thin layer around that core and can be
swapped for a fixture provider.

### V. Simplicity
Prefer the platform and a small dependency set. A new dependency needs a reason that a
few lines of code cannot meet. One repository, one `npm install`, one dev command.

## Data Scope

The baseline is The Burning Crusade (TBC Classic / TBC Anniversary) rankings on Warcraft
Logs. Comparisons are always same class **and** same spec, same encounter, same metric
(DPS for damage specs, HPS for healers), within the current partition unless the user
chooses otherwise.

## Development Workflow

Features follow Spec Kit: constitution → spec → plan → tasks → implement. `npm test` and
`npm run typecheck` MUST pass before a change is committed.

## Governance

This constitution supersedes ad-hoc preferences. Amendments are made by editing this file,
bumping the version (semantic versioning), and noting the change in the Sync Impact Report.

**Version**: 1.0.0 | **Ratified**: 2026-10-05 | **Last Amended**: 2026-10-05
