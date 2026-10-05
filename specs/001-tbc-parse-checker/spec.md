# Feature Specification: TBC Parse Checker

**Feature Branch**: `claude/relaxed-galileo-x7g4ol`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "I wanna make a WoW logs checker that shows stats based on 99th percentile data compared to your class. Use TBC parses as a base. Make a nice UI, clean, not AI sloppy, and use Spec Kit."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how my bests compare to the 99th percentile (Priority: P1)

A raider enters their region, realm and character name (or pastes their Warcraft Logs
character URL). For a chosen TBC raid they see one row per boss: their best kill amount
(DPS or HPS), the median and 99th‑percentile amount for **their class and spec** on that
boss, the gap between them and the 99th percentile, and their parse percentile.

**Why this priority**: This is the core question — "how far am I from a 99?" — and is
useful on its own.

**Independent Test**: Search a known character; the table lists every boss in the raid with
your amount, p50, p99, and gap; numbers match the ranking pages on Warcraft Logs.

**Acceptance Scenarios**:

1. **Given** a character with kills in Black Temple, **When** they search, **Then** each boss
   shows their best amount, p50, p99 for their spec, the gap to p99 (absolute and %), and
   the sample size used.
2. **Given** a boss the character has not killed, **When** the table renders, **Then** the row
   shows the p99 benchmark for their main spec and marks "No kill".
3. **Given** a Warcraft Logs character URL pasted into the search field, **When** submitted,
   **Then** region, realm and name are filled from the URL.

---

### User Story 2 - See *why*: ability breakdown vs a 99th‑percentile player (Priority: P2)

From a boss row the user opens a comparison. It shows their best kill next to the log of the
player sitting at the 99th percentile for the same spec and boss: fight length, amount,
active time, and per‑ability damage/healing share and casts per minute, sorted by the
biggest difference.

**Why this priority**: Turns a number into something the player can act on.

**Independent Test**: Open the comparison for one boss; both columns are filled from real
report data and differences are highlighted.

**Acceptance Scenarios**:

1. **Given** a boss row with a kill, **When** the user opens it, **Then** a panel shows both
   players' summary stats, two pie charts of where each player's damage comes from (same colour
   per ability, top five plus "everything else") with a legend of both shares and the difference,
   and a full ability list with uses per minute and share bars.
2. **Given** an ability used only by one side, **When** shown, **Then** the other side reads "—"
   rather than 0 %.

---

### User Story 3 - Raid overview (Priority: P3)

Above the table the user sees a short summary for the raid: average parse, how many bosses
are at or above p99, and the median gap to p99.

**Independent Test**: Summary values equal the aggregates of the rows below.

**Acceptance Scenarios**:

1. **Given** a loaded raid, **When** the user switches raid tabs, **Then** the summary and table
   update together.

### Edge Cases

- Character not found / misspelled realm → clear message naming what was searched.
- Character has no logs in the selected raid → empty state, benchmarks still listed.
- Warcraft Logs unavailable or rate‑limited → error state with retry; no partial fake data.
- No API credentials configured → app runs in clearly labelled demo mode.
- Spec with very few ranked parses (< 100) → p99 still read from exact rank; sample size shown.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to pick their realm (Dreamscythe or Nightslayer, US TBC
  Anniversary) from a dropdown and type a character name, or paste a Warcraft Logs character URL.
- **FR-002**: System MUST list the TBC raids available on the configured Warcraft Logs site
  and let the user switch between them.
- **FR-003**: For each boss, system MUST show the character's best amount, rank percent,
  the 50th and 99th percentile amount for the same class + spec + metric, and the sample size.
- **FR-004**: Percentile benchmarks MUST be read from the ranking at position
  `ceil(N × (1 − p))` of N ranked parses.
- **FR-005**: Metric MUST be HPS for healing specs and DPS otherwise.
- **FR-006**: System MUST offer an ability‑level comparison against the 99th‑percentile player's
  log for the same encounter and spec.
- **FR-007**: API credentials MUST stay server‑side.
- **FR-008**: Without credentials the app MUST run on fixture data with a persistent "Demo data"
  label.
- **FR-009**: Benchmark lookups MUST be cached so repeated searches do not re‑query rankings.
- **FR-010**: The cache MUST survive restarts, and the app MUST stay within the Warcraft Logs
  hourly allowance: show usage, stop before the limit, and fall back to saved data.
- **FR-011**: Users MUST be able to pre-download benchmarks for their class and spec in the
  background, resuming across hourly windows.
- **FR-012**: Visitors MUST be shown the most recent saved pull (with its age) rather than
  triggering a new pull; stale data is refreshed in the background within the allowance.
- **FR-013**: The app MUST be deployable as a public website with the API key held only in the
  host's environment.

### Key Entities

- **Character**: name, realm, region, class, spec(s) seen.
- **Raid (Zone)**: id, name, encounters.
- **Benchmark**: encounter, class, spec, metric, sample size N, p50 and p99 amounts, the
  reference ranking entry (player, report, fight) at p99.
- **Boss Row**: encounter + character best + benchmark + derived gap.
- **Ability Comparison**: per ability: amount, share of total, casts, casts per minute, for
  both the character and the reference player.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user goes from opening the app to seeing their p99 table in under 15 seconds.
- **SC-002**: Benchmark values match Warcraft Logs ranking pages for the same filters.
- **SC-003**: Repeat searches for the same raid/spec reuse cached benchmarks (no new ranking queries).
- **SC-004**: Every screen is usable at 360px width without horizontal page scroll.

## Assumptions

- Default site is TBC Anniversary (`fresh.warcraftlogs.com`); TBC Classic (`classic`) is
  selectable via configuration.
- "Compared to your class" means same class **and** spec; comparing a Shadow Priest to a Holy
  Priest is not meaningful.
- The current partition (phase) is used by default.
- The user supplies their own Warcraft Logs API client (free) for live data.
