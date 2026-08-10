# Clair — Chrome Extension → Flutter Mobile Migration Plan

**Status: Planning only. No Flutter code has been written.**
Source of truth analyzed: `app.js` (9,393 lines), `db.js` (219 lines), `index.html` (1,291 lines), `style.css` (7,751 lines), `manifest.json`, `README.md`, and five real production exports in `Backup/*.json` (largest: 1,934 test cases, 150 tasks, 15 projects, 200 activity entries).

This document is the complete planning package requested: implementation inventory, feature-parity matrix, data compatibility specification, architecture proposal, mobile navigation proposal, phase-wise roadmap, testing strategy, migration strategy, and a final gap/risk report. The companion file `README.md` in this folder is the README for the future Flutter project.

---

## 0. How This Plan Is Organized

1. [Current Implementation Inventory](#1-current-implementation-inventory) — what the extension actually does, including behavior not in the README
2. [Feature-Parity Matrix](#2-feature-parity-matrix)
3. [Data Compatibility Specification](#3-data-compatibility-specification)
4. [Architecture Proposal](#4-architecture-proposal)
5. [Mobile Navigation Proposal](#5-mobile-navigation-proposal)
6. [Phase-Wise Development Plan](#6-phase-wise-development-plan)
7. [Testing Strategy](#7-testing-strategy)
8. [Migration Strategy](#8-migration-strategy)
9. [Final Gap / Risk Report](#9-final-gap--risk-report)

---

## 1. Current Implementation Inventory

### 1.1 Runtime model

Clair is a single `index.html` shell with all view HTML generated as template-literal strings by `app.js` and injected into `#mainContent`. There is one in-memory `state` object (`app.js:49-88`) holding every collection plus a large amount of UI/filter/scroll state. Every mutation goes through the same cycle: mutate `state` → `await storage.save()` (full-array flush to SQLite via `ClairDB.save()`) → `render()` (re-run the view-dispatch switch) → occasionally `showToast()`/`logActivity()`. There is no component tree, no diffing — `render()` regenerates whole-view HTML strings and replaces `innerHTML`, with two explicit exceptions built for performance/UX: `patchReleasePtCard()` (checklist toggle) and `rerenderPreservingFocus()` (search inputs), both narrow, targeted DOM patches layered on top of the same string-rendering model.

Persistence (`db.js`) is a real SQLite database (sql.js/WASM) with **one table per collection**, each row `(seq, id, data JSON, updated_at)` — i.e. the SQLite layer is itself just a durable KV store keyed by array position; **no column is queried individually today**. The whole database is exported to bytes and written to IndexedDB after every save. A `meta` table holds schema version, a one-time legacy-migration flag, and two preferences (`theme`, `projects_view_mode`).

### 1.2 Collections and identifiers

| Collection | ID format | Example | Notes |
|---|---|---|---|
| `projects` | `uid()` — random base36, 8 chars | `gdu9ppiz` | no prefix |
| `tasks` | `uid()` | `a1ikyzcs` | no prefix |
| `tests` (Project Insights) | `uid()` | `ofhdvgfv` | no prefix; collection name in JSON/table is `tests`, product name is "Project Insights" |
| `developers` | `dev-` + `uid()` | `dev-tfep53m8` | prefixed |
| `releases` | `rel-` + `uid()` | `rel-brelhqi9` | prefixed |
| `modules` | `mod-` + `uid()` | `mod-zfee6sqo` | prefixed |
| `releasePoints` | `uid()` | `v8gbnz8m` | no prefix |
| `testCases` | **human-entered string**, OR auto `TC-###` | `PAR-RTU-001` | the only collection where users type their own ID; the `TC-###` counter only recognizes IDs matching that literal pattern when computing the next number |
| `activity` | `uid()` | `2n1xxbl2` | append-only, capped at 200 (`unshift` + `slice(0,200)`, newest first) |

`uid()` is `Math.random().toString(36).slice(2,10)` — **not a UUID, not guaranteed unique**, just an 8-char random base36 string with no collision check anywhere. This must be treated as an opaque string ID by Flutter, not parsed or assumed globally unique in a cryptographic sense.

### 1.3 Full field inventory per collection

**Project** — `id, name, description, projectType (web|app), previousVersion, upcomingVersion, androidPreviousVersion, androidUpcomingVersion, iosPreviousVersion, iosUpcomingVersion, statuses[] (≤3 of 13 STATUS_OPTIONS), clientName, assignedTeam, dueDate, priority ('' | Low | Medium | High | Critical), overallProjectStatus (YET_TO_START|ON_GOING|COMPLETED|MONITORING|ON_HOLD), releaseHistory[] (≤10, newest first: {version, platform, releasedAt, log}), lastReleaseAt, lastReleaseLog, version (legacy read-only fallback, never written), createdAt, updatedAt`.
- Save validation: `name` required. Web requires `upcomingVersion`; App requires **both** `androidUpcomingVersion` and `iosUpcomingVersion`. No format/regex validation on any version string (free text). `statuses.length` capped at 3 client-side (toast if exceeded); 0 is legal.
- Switching `projectType` in edit mode **deletes** the other type's version fields from the record (not just blanks them).
- **No delete cascade.** Deleting a project leaves dangling `projectId`/`projectIds` in tasks, insights, releases, release points, test cases, modules — every consumer defensively `.find()`/`.filter(Boolean)`s around the miss, so the UI degrades gracefully, but the orphaned ID is never cleaned from storage.
- Two **inconsistent** "primary status" pickers exist in the current code (`pickPrimaryStatus`, used only by the Excel report: `Stable > Testing > In Progress > Started > statuses[0]`; vs. inline logic in `renderProjectCard` for the card border color: `Stable → Testing → (In Progress or Started) → 'planned'`). Flutter should implement **one** reconciled function.

**Task** — `id, title, description, workDone, tags[] (free-text CSV split), startDate, endDate, status (To-Do|In Progress|Done|On Hold), priority (Urgent|High|Medium|Low, default Medium), projectIds[], developerIds[], completedDate, createdAt, updatedAt`. Legacy singular `projectId`/`developer`/`date` fields are migrated to arrays and deleted on load (`migrateTasks`).
- Save validation: **only `title` required.** No start/end date ordering check exists — a task can legally have `startDate > endDate`.
- `workDone` backfilled to `"task completed"` for any pre-existing task missing the field (one-time, on first load after the feature shipped); new tasks start blank. No length limit.
- Deadline filter thresholds (all vs. `endDate`, tasks with `status==='Done'` or no `endDate` excluded): Overdue `diffDays<0`; Within 3 Days `0≤diffDays≤3`; Within a Week `0≤diffDays≤7`; Within 15 Days `0≤diffDays≤15`.
- Start Date range filter matches `task.startDate` (**not** `createdAt`), inclusive both ends, debounced 600ms on the date inputs specifically (year-segment keystrokes otherwise fire spurious `change` events).
- Marking a card "Done" (via drag or the check button) opens a **completion date modal** (default = today, Skip/Confirm) before the write commits; any other status change commits immediately and clears `completedDate`.
- Calendar view: a task's active date range is `start = startDate || createdAt.split('T')[0]`; `end = endDate || start`, **except** when `status==='Done'`, where `end` becomes `completedDate || updatedAt`. A task with neither `startDate` nor `endDate` **and no createdAt fallback path taken** never appears on the calendar (in practice `createdAt` always exists, so this is mostly theoretical, but must be replicated).
- Tags are one free-text comma-separated input, not a chip UI; `getTagClass()` categorizes by first keyword match in a fixed priority order (`bug → feature → ui → backend → high/urgent → default`).
- Cascade: deleting a **developer** correctly strips the ID from every `task.developerIds`. Deleting a **project** does *not* clean `task.projectIds` (see §1.3 Project).

**Project Insight** (`tests` collection, product-facing name "Project Insights") — `id, title, description, developer (single dev id), type (Issue|Enhancement|Note), status (In Dev|QA|Done|Known Issue), assignedStatus (Yet to be assigned|Assigned), projectId (single), createdAt, updatedAt`.
- Save validation: only `title` required.
- **The "Dev → QA → Done workflow" described in the README is a label, not an enforced rule.** No status-transition guard exists in code; any status can be picked at any time, and `assignedStatus` is an independent manual dropdown, not auto-derived from whether a developer is set.
- Cascade: deleting a developer clears `test.developer` if it matches (single-field, simple). Deleting a project does not clean `test.projectId`.

**Release** — `id, name, version (legacy single), versions[] (current), managerName, status (Draft|Planned|In Progress|Testing|Approved|Released|Rolled Back), workItems, notes, developerIds[], projectId (legacy single), projectIds[] (current), releaseDate, createdAt, updatedAt`.
- Save validation: **at least one project** (`projectIds.length>0`) and non-empty `name` required. Status can be set to any of the 7 values regardless of current value — no sequential enforcement despite the README's arrow diagram describing a linear flow.
- **README/code contradiction found:** the README states release cards are "sorted by release date descending; undated releases at the end." No such sort exists anywhere in `app.js` — `renderReleases()` only filters, never sorts; display order is simply array order (newest-created-first, via `unshift` on create). This must be an explicit decision point for Flutter (see §9).
- "Generate Template" builds a plain-text announcement (Subject/Release Brief/Description/Work Items/sign-off) into the notes textarea for the user to copy manually — **not** a real `mailto:` link. "Copy to Clipboard" uses `navigator.clipboard.writeText()` with **no fallback** for browsers without the Clipboard API (just an error toast).
- Cascade: none. Deleting a project/developer does not clean `release.projectIds`/`developerIds`. Deleting a release does not clean `releasePoints[].releaseId` pointing at it (renders as "no linked release," ID persists).

**Release Point** — `id, title, projectId (legacy, = projectIds[0]), projectIds[], releaseId (optional), releaseType (upcoming|released — only 2 values, default upcoming), versions[], developerIds[], checklistItems[] ({id, text, ticket, developerId, done})`.
- Save validation: `title`, ≥1 checked project, and ≥1 checklist item with **non-blank trimmed text** (blank rows are silently dropped on save).
- Progress = `doneCount/totalCount` (0 if empty); card shows a completion banner when `checklistItems.length>0 && every(done)`.
- Checklist item CRUD: **Add** (1 blank row) · **Bulk Add** (count picker, clamped 1–50, default 3, identical blank rows) · **Bulk Assign** (sets one developer on every current item) · **inline edit** (Save/Cancel/Delete per row) · **checkbox toggle** patches only 4 things in the DOM (card `className`, the item's `done` class, the progress-ring innerHTML, and the completed-banner) — it never calls the full `render()`, which is *why* scroll position survives, not because of any special scroll-restore code.
- Ticket → key display: detects a URL via regex, then takes the **last non-empty path segment**, URL-decoded (`/browse/CIMTRACK-482` → `CIMTRACK-482`); falls back to bare hostname if no path; non-URL text renders as plain text.
- `populateReleasePtReleases` filters candidate releases by legacy singular `release.projectId ===`, not the new `projectIds[]` array — a release only linked via multi-project can be invisible in this dropdown (existing bug to note, not necessarily replicate).

**Developer** — `id, name, projectIds[]`. No other fields.

**Test Case** — `id (human string or "TC-###"), projectId, moduleId, title (duplicate of scenario, kept for back-compat), scenario, simplifiedScenario, description, steps, expected, actual, priority (Critical|High|Medium|Low, default High), severity (S1 - Blocker|S2 - Critical|S3 - Major|S4 - Minor, default S3 - Major), status, type (Manual|Automated|API|Security|Performance|Regression, default Manual), assignee, executionDate, defectId, comments, createdAt, updatedAt`.
- **Status enum has a real, live inconsistency in the current app**, confirmed by grep: the manual "Add Test Case" modal's default `<option>` value is the literal string **`"Not executed"`** (`index.html:731`), while every other code path — filters, dashboard/report breakdown, Excel-import normalization, the Test Case Management page's own status dropdown — treats **`"Untested"`** as canonical (`app.js:6475, 6947, 7588-7589`, etc.). A test case created via the modal without touching the Status field is silently invisible to every `status === 'Untested'` check (not miscounted — just falls out of Passed/Failed/Blocked/Untested entirely). **Flutter must treat `"Untested"` as canonical and accept `"Not executed"` as a recognized synonym on import** (see §9).
- Manual save requires: `scenario`, `steps`, `expected`, `projectId`. Duplicate-ID check is **case-sensitive** in the manual modal but **case-insensitive** on Excel import — another inconsistency to reconcile, not blindly replicate both ways.
- Auto-ID counter only recognizes existing IDs matching `TC-(\d+)`; human IDs like `PAR-RTU-001` are ignored by the counter (harmless, but means auto-numbering and human IDs coexist without collision detection between the two schemes beyond the exact-match duplicate check).
- Deleting a **module** does *not* orphan its test cases — `moduleId` is explicitly cleared to `''` on every affected case (matches its own confirm-dialog text "moved to project root"). This is the one collection with a correct, deliberate cascade already.

**Module** — `id, projectId, name, description`.

**Activity** — `id, text, type ('task'|'project'|'delete' — only 3 values, despite README listing five verb-shaped categories), at`. Every feature (tasks, projects, insights, releases, release points, test cases, modules, Excel import, bulk operations) reuses these same 3 buckets for its own CRUD events — there is no richer taxonomy to replicate. Full call-site enumeration (29 sites, all templates) is preserved in the agent research this plan was built from and should be treated as the literal message library Flutter's `ActivityService` needs to reproduce, one string-builder per action.

### 1.4 Import / Export — exact current behavior

- **Export** (`exportData`, `app.js:391-428`): dumps `{projects, tasks, tests, activity, developers, releases, testCases, modules, releasePoints, exportedAt}` — **`exportedAt` is a real top-level field not documented in the README's schema block**, and there is no `version`/`schemaVersion` field today. In the Chrome extension, saves via `chrome.downloads.download` to `Extensions/project-extension/Backup/<filename>`, filename `clair-export-YYYY-MM-DD.json`; falls back to a plain browser download if the Downloads API errors. Standalone/web mode always uses the plain download.
- **Import** (`importData`, `app.js:430-457`): validates only `data.projects && data.tasks` are truthy (both arrays, even empty, satisfy this — an empty-array key still passes). On pass, it is a **hard full-state replacement** for every known key (`developers/releases/testCases/modules/releasePoints` default to `[]` if absent; `tests`/`activity` likewise) — no merge, no upsert, no per-record validation, no duplicate-ID detection, no partial import, no dry-run, no rollback beyond a try/catch around `JSON.parse` itself. Unknown top-level keys in the file are silently ignored (safe for forward-compatibility). This is the exact behavior any Flutter "import from Chrome" path must be able to consume without failing, even though Flutter's own import can and should be materially safer (see §8).
- **First-run behavior (undocumented, found in `init()`, `app.js:9090-9122`)**: on a genuinely empty first launch, the app attempts `fetch('Backup/clair-export-2026-06-02.json')` bundled in the extension and, if present, loads it as if it were the user's real data — falling back to `prepopulateMockData()` only if that fetch fails. **This means a real user-data backup file is currently checked into the repo and shipped as the app's "demo data."** This must not be replicated in the Flutter app — see §9 (Gap/Risk Report) for the explicit recommendation to seed genuinely synthetic demo data instead.

### 1.5 Cross-cutting behaviors already noted above, consolidated

- **No referential integrity anywhere except**: developer→task cascade, developer→insight cascade (single field), module→testCase cascade. Every other relationship (project→*, developer→release, developer→releasePoint, release→releasePoint) is left to dangle and is rendered defensively.
- **`updateStorageInfo()` is a literal no-op stub** (`() => {}`) — called after saves as if it updated a live storage indicator, but does nothing. Dead code; the "Storage information" UI element in Settings is populated only once at render time via a direct `JSON.stringify(state).length` computation, not by this function.
- **Two 180–600ms debounce patterns**: 180ms for the 5 page search inputs (paired with `rerenderPreservingFocus`), 600ms specifically for the task date-range filter's date inputs.
- **Theme**: resolved in JS against `window.matchMedia`, never a CSS media query, specifically to avoid a dark-then-light flash before the SQLite-stored preference loads (documented reasoning, must be replicated conceptually: Flutter's first frame must not flash the wrong theme while `SharedPreferences`/Drift resolves).

---

## 2. Feature-Parity Matrix

| Feature | Chrome Implementation | Flutter Equivalent | Migration Notes | Priority |
|---|---|---|---|---|
| Dashboard metrics (4 stat cards) | Computed inline in `renderDashboard()` on every render | `DashboardMetricsProvider` (Riverpod, derived from repositories via `Stream.combineLatest`) | Pure derivation, no persistence — straightforward | P0 |
| Weekly task completion chart | Chart.js bar chart, month-clamped week buckets | `fl_chart` `BarChart`, same clamped-week algorithm ported verbatim | Algorithm is non-obvious (documented §1); must port exactly, including the double-counting fix | P0 |
| Task status donut (SVG, hand-rolled) | Inline SVG stroke-dasharray math | `fl_chart` `PieChart` or custom `CustomPainter` | Cosmetic only; formula (`circumference=2πr`) ports directly | P1 |
| Test Cases by Project stacked bars | Hand-rolled % bars | `fl_chart` or simple `Row`/`Expanded` percentage bars | Straightforward | P1 |
| Released-this-month + month nav | Merges manual releases + `releaseHistory[]` entries, sorts desc | Same merge in a Riverpod provider | Must include both sources, not just `releases` | P0 |
| Recent projects/tasks/insights lists | Sliced top-N by date | Same, via repository queries with `ORDER BY … LIMIT` | Straightforward once DB has indexed date columns | P1 |
| Projects — List view (3-col card) | String-templated horizontal card | Redesigned as a mobile card (stacked info/version/actions) | UI redesign required; **all data fields preserved** | P0 |
| Projects — Kanban (5 lifecycle columns) | HTML5 DnD across `.projects-kanban-column` | Horizontally-scrollable `PageView`/columns + long-press drag (`LongPressDraggable`/`DragTarget`), OR a "move to…" action sheet as primary path | Desktop DnD → touch DnD is non-trivial; recommend action-sheet as primary interaction, drag as tablet-only enhancement (§5) | P0 |
| Projects — manual list reorder | Array-splice on HTML5 dragover midpoint test | `ReorderableListView` (built-in Flutter reorder semantics) | Native widget is a strictly better mobile fit than porting the JS midpoint math | P0 |
| Project versioning + release action buttons | `incrementVersion()` semver-aware bump, `releaseHistory` unshift+cap10 | Ported 1:1 as a pure Dart function + repository write | Must port the *exact* semver rollover rules (`.9 → .0` at minor/major boundaries) | P0 |
| Project statuses (≤3 of 13) picker | Custom JS picker with 3-cap toast | Flutter `FilterChip` multi-select, capped at 3 | Straightforward | P0 |
| Tasks — Kanban (4 columns) | HTML5 DnD | Same DnD pattern as Projects Kanban; also add swipe-to-change-status as a mobile-native alternative | See §5 | P0 |
| Tasks — completion-date modal on "Done" | Custom modal, Skip/Confirm | Bottom sheet with date picker, Skip/Confirm | Direct translation | P0 |
| Tasks — deadline & date-range filters | Exact day-threshold math, 600ms debounce | Same thresholds; debounce not needed (native date pickers don't fire per-keystroke) | Threshold values must be ported exactly (§1) | P0 |
| Tasks — checklist search + dynamic dev filtering | DOM show/hide filter, live project→dev narrowing | `TextField` + filtered `Provider` list, same narrowing logic | Straightforward, arguably simpler in Flutter | P0 |
| Full Calendar (month grid) | Custom day-cell renderer, count badges | `table_calendar` package or custom `GridView`, same range/active-day algorithm | Algorithm has edge cases (Done-status end-date override) — port exactly (§1) | P1 |
| Project Insights (Issue/Enhancement/Note board) | 3-column Kanban by type | Redesigned tabbed or segmented list (mobile 3-column Kanban is cramped) | Status transitions are unrestricted — do not accidentally add validation | P0 |
| Release Management (7-stage workflow) | Free-form status select | Free-form status select/stepper (no sequence enforcement, matching actual behavior) | Decide + document whether to ALSO fix the "sorted by date" README/code gap (§9) | P0 |
| Release announcement generator | Plain-text template into textarea | Same template, `Share.share()`/clipboard for delivery | Mobile has no "generate mailto" convention; use native share sheet | P1 |
| Release notes clipboard copy | `navigator.clipboard.writeText`, no fallback | `Clipboard.setData` (always available on Flutter) | Actually simpler/more reliable on Flutter | P1 |
| Release Points (checklist cards) | 2-col grid, inline edit, bulk add/assign, DOM-patch toggle | Single-column mobile list of expandable cards; toggle via local `setState`/Riverpod without full list rebuild | The "no full re-render" trick isn't needed in Flutter — proper state scoping (per-card `Consumer`) gives the same scroll-preservation for free | P0 |
| Release Point ticket key extraction | Last-path-segment regex/URL parse | Ported 1:1 (`Uri.parse` + `pathSegments.last`) | Direct Dart equivalent exists | P1 |
| Test Case Management — All Projects summary cards | Per-project pass-rate cards | Same, as a grid/list of summary cards | Straightforward | P0 |
| Test Case Management — detail table + pagination | Rows-per-page 5/10/25/50/100/150/All | Paginated `ListView`/`DataTable2`-style widget with same options | 1,934+ rows in real data — must use DB-level `LIMIT/OFFSET`, not in-memory slicing of a JSON blob (architecture decision, §4) | P0 |
| Test Case bulk select / bulk update / bulk delete | Checkbox mode, per-field control types | Flutter multi-select list mode + bottom sheet field editor | Bulk-updatable field set (9 fields) must be ported exactly (§1) | P0 |
| Excel/CSV import with column mapping | Real quote-aware CSV parser, header auto-detection, priority-ordered header matcher, normalize functions, composite-key duplicate detection | `csv` + `excel` Dart packages, ported header-matcher priority list and normalize tables **verbatim** | Highest-risk module for silent divergence — the header-matcher order and normalize tables must be transcribed exactly, not "cleaned up" (§9) | P0 |
| Developers registry | Simple CRUD + project-link checkboxes | Same | Straightforward | P0 |
| Activity Feed | 200-cap, 3 type buckets | Same cap, same 3 buckets, same message templates | Message templates must be reproduced per call site, not paraphrased (affects exported activity text if ever displayed cross-platform) | P1 |
| Settings — Appearance (System/Light/Dark) | JS-resolved, no CSS media-query flash | `ThemeMode` from a synchronously-available preference before first frame | Flutter can solve the flash problem more robustly (native splash / preference pre-load) — see Phase 10 | P0 |
| Settings — Export/Import | Full-state JSON dump/replace | Same shape, safer import path (validated, with an explicit "replace" confirmation) as a deliberate, documented improvement | Must still accept exactly what Chrome produces (§3) | P0 |
| Settings — Clear Database | Forced export-then-wipe | Same forced-export-then-wipe flow | Direct translation | P0 |
| Settings — System overview | Record counts + naive `JSON.stringify().length` size estimate | Record counts from `SELECT COUNT(*)`, real DB file size from the filesystem | Flutter can report *actual* storage size — a genuine improvement | P2 |
| Global search (⌘K) | Instant, searches projects/tasks/developers | Mobile search: dedicated search screen/sheet, reachable from app bar and app-wide shortcut where a hardware keyboard is present | Ctrl+K itself is meaningless on mobile — replace with a persistent search entry point (§5) | P1 |
| Keyboard shortcuts (Ctrl+Enter save, Esc close) | Global keydown listeners | Optional support only on external-keyboard sessions (tablet/Chromebook); not a primary interaction | Low priority on phones | P2 |
| Excel report export (`exceljs.min.js`) | Generates a styled `.xlsx` report | `excel`/`syncfusion_flutter_xlsio` equivalent (evaluate license), or defer to Phase-2 scope | Not explicitly required by the prompt's feature list but present in code — flagged in Gap Report (§9) as a scope decision | P2 |
| Responsive sidebar/topbar | CSS breakpoints, hamburger drawer | N/A — replaced wholesale by mobile nav (bottom nav + drawer), see §5 | Intentional UI redesign | P0 |

---

## 3. Data Compatibility Specification

### 3.1 Contract

The nine-key export shape is a **public compatibility contract** and does not change shape at the top level:

```json
{
  "projects": [...], "tasks": [...], "tests": [...], "developers": [...],
  "releases": [...], "testCases": [...], "modules": [...], "releasePoints": [...],
  "activity": [...], "exportedAt": "ISO 8601"
}
```

Flutter's exporter must always emit every one of these ten keys (nine arrays + `exportedAt`), even when a collection is empty, because Chrome's importer's only validity check is `data.projects && data.tasks` both being present (truthy — an empty array passes). Never omit `projects` or `tasks` even if genuinely empty.

### 3.2 Introducing a schema/version marker safely

Add one new **top-level, optional** key: `"schemaVersion": 1`. This is safe in both directions:
- **Chrome importing a Flutter export**: Chrome's `importData()` reads only the ten keys it already knows about and ignores any others — `schemaVersion` is silently dropped, no error.
- **Flutter importing a Chrome export**: absence of `schemaVersion` is treated as `schemaVersion: 1` (the implicit version every existing export is already on, since the shape hasn't changed since it was introduced).

Do **not** add a version field per-record, and do not make any existing top-level key required-with-new-semantics. Any future genuine schema change (e.g. an eleventh collection) follows the same rule: new keys are additive and optional; the importer on both sides tolerates their absence.

### 3.3 Field-level compatibility rules

1. **Preserve unknown fields.** Every Flutter model's `fromJson` must capture any key it doesn't recognize into a sidecar `Map<String, dynamic> extra` and `toJson` must re-merge it. This guarantees a record round-tripped Chrome → Flutter → Chrome never loses a field, even one a future Chrome version adds that this plan doesn't know about yet. (See §4.4 for the concrete pattern.)
2. **Never rename an existing field.** E.g. keep `iosUpcomingVersion`, not `iosNextVersion`; keep `assignedStatus`, not `assignmentState`. The temptation to "clean up" names must be resisted at the serialization boundary — internal Dart property names may differ from JSON keys via explicit `@JsonKey(name: ...)` mapping, but the wire format is frozen.
3. **Keep both legacy and current relationship fields.** `project.projectId` (Release, Release Point) alongside `projectIds[]`; `project.version` alongside `previousVersion`/`upcomingVersion` — Flutter must **write** the modern plural/explicit fields but is free to also populate the legacy singular field for maximum backward compatibility with any external tooling reading old exports, mirroring what the extension itself already does defensively.
4. **IDs are opaque strings, never re-typed or reformatted.** Do not convert to UUIDs, integers, or a different prefix scheme on import. Newly created records **in Flutter** may use `Uuid v4` for stronger collision resistance (a deliberate, safe improvement, since IDs are never parsed for structure by either app) but existing IDs from a Chrome import are stored and re-exported byte-for-byte.
5. **Timestamps are ISO 8601 strings** (`DateTime.toIso8601String()` in Dart matches JS `Date.toISOString()` format exactly — both are RFC 3339 UTC with milliseconds). Plain date fields (`dueDate`, `startDate`, `endDate`, `executionDate`, `releaseDate`) are `YYYY-MM-DD` strings, not full timestamps — do not upgrade these to `DateTime` ISO strings on write, or Chrome's `new Date(dateStr)` parsing (which expects the short form for its `<input type="date">` round-trip) will still work but every display format in Chrome assumes the short form for `<input type="date">` prefill; keep it as-is.
6. **Empty string vs. null vs. absent are all currently used interchangeably** by the extension (e.g. `dueDate: ""` is common, `completedDate: null` is used, an absent `workDone` triggers a migration default). Flutter's `fromJson` must treat all three as "no value" for optional fields, and its `toJson` should match whatever the field's typical current representation is (empty string for the free-text fields that are already `""` in real exports, `null` for `completedDate`) rather than inventing a fourth convention.
7. **Enum synonyms must be normalized on import, not just accepted as-is.** The two known live inconsistencies (§1.3, §1.5, §9) — `testCase.status` "Not executed" vs. "Untested" — must both be recognized as the same value by Flutter's importer and Flutter must always **write** the canonical `"Untested"` on its own exports, since that's what the rest of the current app already treats as ground truth.
8. **`testCase.id` is the one field where import identity matters most.** Two different case-sensitivity rules exist in Chrome (case-sensitive in the manual-save duplicate check, case-insensitive on Excel import). Flutter's JSON-import duplicate/merge logic (§3.5) should use case-insensitive matching (the more conservative, less-likely-to-create-silent-duplicates choice) and this should be a documented, intentional decision, not an accident.

### 3.4 Chrome → JSON → Flutter model/DB → JSON → Chrome mapping (representative example, Project)

| Chrome JSON field | Type in JSON | Flutter Dart field | Drift column | Notes |
|---|---|---|---|---|
| `id` | string | `String id` | `id TEXT PRIMARY KEY` | opaque |
| `name` | string | `String name` | `name TEXT` | required |
| `projectType` | `"web"|"app"` | `ProjectType type` (enum) | `project_type TEXT` (stores raw string) | enum ↔ string mapping in the model, never in the DB |
| `statuses` | `string[]` | `List<String> statuses` | not a column — lives inside `data` JSON blob (§4.3) | multi-value, low cardinality, not filtered at DB level today |
| `overallProjectStatus` | string | `LifecycleStatus overallStatus` | `overall_status TEXT` (indexed — used for Kanban column queries) | promoted to a real column because it's filtered/grouped constantly |
| `releaseHistory` | array of objects | `List<ReleaseHistoryEntry>` | not a column — inside `data` blob | nested structure, no independent query need |
| *(any future/unknown key)* | any | captured in `Map<String,dynamic> extra` | folded into `data` blob | preserved automatically |
| — | — | — | `data TEXT` (full JSON blob of the record) | **source of truth for serialization**; every column above is a duplicate/index of a field already inside `data`, kept in sync on write, so re-exporting always uses `data`, never a column-by-column reconstruction that could silently drop something |

This same pattern (a handful of indexed columns for what's actually filtered/sorted/grouped today, plus a full `data` JSON blob as the round-trip source of truth) applies to every collection; see §4.3 for the full schema.

### 3.5 Import validation and partial/duplicate/rollback behavior

Flutter's importer is intentionally **stricter and safer** than Chrome's (a deliberate, documented improvement — Chrome's own "replace everything, no validation" behavior remains fully importable *into* Flutter, but Flutter does not blindly trust every file the same way):

1. **Structural validation**: file must be valid JSON; `projects` and `tasks` keys must be present and be arrays (mirrors Chrome's own only check, so any file Chrome would accept, Flutter accepts).
2. **Per-record validation is lenient, not strict**: a record missing a field Chrome always makes optional (e.g. `dueDate`) must **not** be rejected — apply the same defaults Chrome's own renderers use (`|| ''`, `|| 'Medium'`, etc.) rather than failing the whole import over one soft field. A record missing a field Flutter now treats as structurally required (there are none beyond what Chrome already requires) would be the only rejection case, and none currently exist.
3. **Whole-file import is transactional**: the entire replace happens inside a single Drift transaction; if any table write fails, the transaction rolls back and the pre-import database is untouched (this is what §8's migration reliability depends on).
4. **Import modes offered in the UI** (both preserve full Chrome compatibility as inputs): **Replace** (matches Chrome's exact current behavior — full overwrite) and **Merge** (new, optional, off by default — upserts by ID, additive for collections without ID collisions, skips exact-duplicate test cases using the same composite-key logic already in Chrome's Excel importer). Merge is a genuine enhancement scoped to a later phase, not a Phase-1 requirement.
5. **Corrupt/invalid JSON**: caught, surfaced as a clear error, current database untouched — strictly better than Chrome's generic "Error parsing file" toast, but never silently partial.

### 3.6 Backward / forward compatibility summary

| Direction | Guaranteed | Caveat |
|---|---|---|
| Old Chrome export → new Flutter import | ✅ | Enum synonyms normalized per §3.3.7 |
| New Flutter export → old Chrome import | ✅ | Flutter must always include all 10 top-level keys (§3.1); new optional top-level keys (`schemaVersion`) are ignored, not rejected |
| Flutter export → Flutter import (self round-trip) | ✅ | Exact byte-for-byte field preservation via `extra` bag (§3.3.1) |
| Chrome export → Flutter → re-export → Chrome import | ✅ | This is the critical "round-trip" test required in §7 |

---

## 4. Architecture Proposal

### 4.1 Guiding constraint

The existing app's entire business logic — validation rules, filter thresholds, chart math, enum tables, header-matching priority, version-bump rules — is correct and tested by real production use (1,934 real test cases, 150 real tasks). **The goal of the Flutter rebuild is a clean architecture around the *same* rules**, not a reinterpretation of them. Every phase in §6 treats "port the exact algorithm" and "redesign the UI" as separate, independently-reviewable concerns.

### 4.2 Technology decisions and reasoning

| Concern | Choice | Why, evaluated against alternatives |
|---|---|---|
| Local database | **Drift** (over sqlite3) | The extension is already SQLite (sql.js/WASM). Drift wraps the same SQLite engine on-device, giving genuine continuity (schema concepts, not just "some NoSQL box") and reactive `Stream<List<T>>` queries that map cleanly onto Riverpod. Rejected **sqflite** raw (no type safety, hand-written SQL for every query, no reactive streams — more boilerplate for no benefit here). Rejected **Isar** (fast, but a fundamentally different NoSQL document model that would force re-deriving relational queries the current SQLite schema and the test-case pagination/filtering workload both actually need; also carries more project-continuity risk given its narrower ecosystem). Drift's generated, type-checked queries also make the "port the exact filter/threshold logic" requirement auditable in code review, not buried in string SQL. |
| DB schema shape | **Hybrid: indexed columns for what's actually filtered/sorted/grouped today, + a full-record JSON blob column as the serialization source of truth** | Directly answers the prompt's compatibility concern: normalizing fully would risk silently reshaping/dropping fields; keeping everything as an opaque blob (like the extension's current schema) would make the 1,934-row Test Case table's pagination/filter/search queries do a full-table JSON scan on every keystroke, which does not scale on a phone. The hybrid gives real `WHERE`/`ORDER BY`/`LIMIT` performance on the columns that matter (project id, module id, status, priority, dates) while `data` remains untouched and complete. See §3.4. |
| State management | **Riverpod** (code-gen, `riverpod_generator`) | The current app is one giant mutable `state` object plus a full `render()` on every change — conceptually already "one global reactive store," which Riverpod's provider graph replaces faithfully while making each piece (dashboard metrics, filtered task lists, project→developer narrowing) independently testable and cacheable. Rejected **Bloc/Cubit** (more ceremony — events/states for what is fundamentally simple CRUD + derived views — no part of this app has complex event-sourcing needs). Rejected plain **Provider** (lacks `family`/`autoDispose` ergonomics needed for per-filter-set derived providers like "developers filtered by selected projects," which the current app implements ad hoc in the DOM and Riverpod expresses as a one-line `family` provider). |
| Routing | **go_router** | Declarative, deep-link-capable, and supports `ShellRoute` for a persistent bottom-nav/drawer shell exactly matching §5's navigation model, with adaptive layout switching (phone bottom-nav vs. tablet nav-rail) driven from one route table. |
| Domain models / JSON | **Hand-written models with `fromJson`/`toJson`**, not `freezed`+`json_serializable` in strict mode | The compatibility contract (§3) requires preserving unknown fields and tolerating null/empty/absent interchangeably — both of which fight against `json_serializable`'s default "throw on missing required field" posture. Models are still simple, immutable (`final` fields, `copyWith`), just without codegen magic that would make the "preserve everything I don't recognize" rule harder to enforce and audit. `json_serializable` may still be used per-model *only* where a field is genuinely always-present and strictly typed (e.g. `Developer`), evaluated case by case. |
| Charts | **fl_chart** | Open-source (no license concern, unlike Syncfusion), covers the bar chart (weekly completions), donut (task status), and stacked-percentage bars (test cases by project) needed — a direct like-for-like of the Chart.js + hand-rolled-SVG mix currently used. |
| Excel/CSV import | **`csv`** package (RFC 4180 quote-aware parser, matching the extension's hand-rolled state-machine parser) + **`excel`** package for `.xlsx` reading | The extension's CSV parser is genuinely quote/embedded-newline-aware, not a naive split — Flutter needs an equivalent, not a regression. |
| File I/O (export/import/backup) | **`file_picker`** (import) + **`share_plus`** (export/share) + **`path_provider`** (app-local backup folder) | Mobile has no `chrome.downloads`-style "save to a fixed project folder" concept — export must go through the OS share sheet or a user-chosen location via SAF/document picker, and this is one of the explicit Chrome-specific capabilities requiring a Flutter replacement (§9). |
| Local preferences (theme, view-mode, non-collection prefs) | Drift `meta`-equivalent table (mirrors `ClairDB`'s existing `meta` table 1:1) rather than `shared_preferences` | Keeps a single persistence engine and a single backup surface — if `shared_preferences` held the theme, it would live outside the SQLite file and outside any future "export includes preferences" feature. |

### 4.3 Local database schema (Drift)

One table per collection, mirroring `db.js`'s `TABLES` array plus the promoted, actually-queried columns:

```
projects(id PK, name, project_type, overall_status[idx], priority, due_date, updated_at[idx], data JSON, order_index[idx])
tasks(id PK, title, status[idx], priority, start_date, end_date[idx], completed_date, updated_at[idx], data JSON)
tests(id PK, title, type[idx], status[idx], project_id[idx], developer_id, updated_at, data JSON)
developers(id PK, name, data JSON)
releases(id PK, name, status[idx], release_date[idx], updated_at, data JSON)
test_cases(id PK, project_id[idx], module_id[idx], status[idx], priority, severity, execution_date, updated_at, data JSON)
modules(id PK, project_id[idx], name, data JSON)
release_points(id PK, project_id[idx], release_id, release_type, updated_at, data JSON)
activity(id PK, type, at[idx], data JSON)
meta(key PK, value)   -- schema_version, migrated_v1-equivalent, prefs (theme, view modes, list ordering)
```

`order_index` on `projects` replaces the extension's "array position is the order" convention with an explicit, indexed integer — the JSON export still has no `order` field (array position in the exported `projects[]` list *is* the order, matching Chrome exactly), but internally Flutter needs a real column because Drift result sets aren't ordered by insertion the way a JS array is. On export, records are simply written out `ORDER BY order_index`.

### 4.4 Model layer pattern (concrete example)

```dart
class Project {
  final String id;
  final String name;
  final ProjectType type;
  // ...known fields...
  final Map<String, dynamic> extra; // anything this model doesn't know about, preserved verbatim

  factory Project.fromJson(Map<String, dynamic> json) {
    final known = {'id','name','projectType', /* ...all known keys... */};
    final extra = Map<String, dynamic>.fromEntries(
      json.entries.where((e) => !known.contains(e.key)));
    return Project(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      type: ProjectType.fromWire(json['projectType'] as String?),
      // ...
      extra: extra,
    );
  }

  Map<String, dynamic> toJson() => {
    ...extra, // written first so known fields below always win on key collision
    'id': id, 'name': name, 'projectType': type.wireValue,
    // ...
  };
}
```

Every repository reads/writes through this pattern; the Drift `data` column is exactly `jsonEncode(model.toJson())`.

### 4.5 Layering

```
presentation/        screens, widgets, mobile-specific interaction components (§5)
application/          Riverpod providers/notifiers — one "controller" per feature area,
                       plus cross-cutting derived providers (dashboard metrics, search index,
                       project→developer filter narrowing)
domain/               plain Dart models (§4.4), enums, pure business-rule functions
                       (incrementVersion, deadline thresholds, pass-rate math, header-matcher,
                       normalize* tables) — ported verbatim from app.js as unit-testable
                       functions with no Flutter/DB dependency
repository/           interfaces + Drift-backed implementations, one per collection,
                       exposing Stream<List<T>> watchAll()/watchFiltered(...), CRUD,
                       and the specialized paginated/filtered test-case query
services/             ImportExportService, ExcelCsvImportService, ActivityService,
                       ThemeService, BackupService, ShareService
data/                 Drift database class, table definitions, migrations
```

### 4.6 Cross-cutting concerns

- **Error handling**: repository/service layer throws typed exceptions (`ImportValidationException`, `DuplicateIdException`); presentation layer catches at the boundary and surfaces a snackbar/dialog — matching the extension's toast-driven error UX, upgraded to be catchable/testable rather than a bare `catch(e){showToast(...)}`.
- **Validation**: the exact field-level rules in §1.3 are ported as pure functions in `domain/validation/`, unit-tested independently of any widget.
- **Migration/versioning**: Drift's own schema migration mechanism (`MigrationStrategy`) handles internal DB version bumps as the Flutter app evolves; this is separate from and does not affect the JSON export `schemaVersion` (§3.2), which only concerns the interchange format.
- **Offline-first**: everything above is 100% local; there is no network call anywhere in this architecture except an explicit user-triggered export/share, matching the extension's zero-backend design exactly.
- **Performance**: paginated/filtered test-case queries hit indexed columns (`project_id`, `module_id`, `status`) via Drift, not an in-memory scan of 1,934 JSON blobs on every keystroke — a genuine performance improvement over the current architecture's approach, made necessary by real production data volume.

---

## 5. Mobile Navigation Proposal

### 5.1 Top-level navigation

Replace the desktop sidebar (9 nav items across 5 grouped sections) with:
- **Bottom navigation bar** (phones): 5 primary destinations — **Dashboard, Projects, Tasks, Insights+, More**. "Insights+" is a segmented entry that itself branches to Project Insights / Release Management / Release Points / Test Cases via a top-of-screen tab or a quick-switch sheet (these four are inherently one connected "project delivery" cluster, and 9 bottom-nav items don't fit). "More" holds Developers, Activity, Settings — a drawer/list screen, not a 9-item bottom bar.
- **Navigation rail** (tablets, ≥600dp width via `go_router`'s adaptive shell): all 9 destinations get their own rail item, closer to the original sidebar's flat structure, since a rail has the width budget.

### 5.2 Screen-by-screen interaction mapping

| Desktop pattern | Mobile equivalent | Reasoning |
|---|---|---|
| Sidebar (9 items, 5 groups) | Bottom nav (5) + tablet rail (9) | §5.1 |
| Topbar search + `⌘K` | Full-screen search screen, reached via a search icon always in the app bar | Ctrl+K has no mobile meaning; a dedicated search screen with recent/scoped results is the native pattern |
| Topbar "+ New" buttons (one per view) | Single `FloatingActionButton` per screen, context-aware to that screen's entity | Standard Material pattern; avoids a cluttered app bar |
| Modals (project/task/test/release/etc.) | **Full-screen forms** (pushed routes) for anything with >4 fields (Project, Task, Release, Test Case, Release Point); **bottom sheets** for short/quick actions (confirm delete, completion-date picker, bulk-update field editor, filter pickers) | Matches Material/Cupertino convention: long forms get room to breathe and a natural back-gesture "cancel"; short/binary choices stay as a sheet the user can dismiss without full navigation |
| Generic `confirmModal` | `showDialog` (AlertDialog) — kept as a true dialog, not a sheet, since it's a binary yes/no interrupt | Matches platform convention for destructive confirmations |
| Generic `detailModal` | Dedicated read-only detail **screen** per entity type (not literally generic — mobile users expect a real screen with its own app bar/back button, not a lightbox) | The desktop "one generic modal, all types" pattern was a DOM-reuse optimization, not a UX requirement — mobile gets type-specific detail screens sharing a common layout widget instead |
| Desktop Kanban (drag between columns) | **Primary**: tap a card → "Move to…" action sheet listing the other columns. **Secondary (tablet/enhancement)**: `LongPressDraggable`/`DragTarget` for direct drag, and swipe-left/right on a card for "move to adjacent column" | Preserves the underlying capability (move between statuses) without requiring precise drag gestures on a small screen as the *only* path; drag remains available where screen size affords it |
| Desktop tables (Test Case detail table) | Card list with a **detail-density toggle** (compact rows vs. expanded cards), same pagination controls surfaced as a bottom bar (rows-per-page sheet + prev/next) | A literal `DataTable` on a phone requires horizontal scrolling for every row, which the current desktop UX explicitly avoids elsewhere (project cards) — stay consistent |
| Hover-only actions (edit/delete icons that appear on hover) | Always-visible icon buttons, or swipe actions (swipe-to-delete, matching iOS/Android list conventions) | There is no hover on touch; swipe actions are the idiomatic replacement for "reveal on hover" |
| Multi-column layouts (Settings, dev manager split) | Single-column, sectioned scroll | Direct mobile stacking |
| Filters (inline dropdowns/pills in a toolbar row) | **Filter bottom sheet**, opened from a filter icon in the app bar, with an active-filter-count badge | Standard mobile filter pattern; keeps the primary list uncluttered |
| Bulk selection (checkbox mode toggle) | Long-press to enter selection mode (standard mobile gallery/list pattern), contextual bottom action bar appears | Matches Photos/Gmail-style bulk selection UX users already know |
| Checklist search boxes (Task/Release Point modals) | Inline `TextField` at the top of the checklist sheet/section, same substring filter | Direct translation, no redesign needed |
| Full Calendar month grid | Kept as a genuine calendar view (via `table_calendar` or custom grid), but the day-detail panel becomes a bottom sheet on tap instead of a persistent side panel | Persistent side panel doesn't fit phone width; sheet-on-tap preserves the same information without a redesign of the underlying date logic |
| Release announcement "Generate + copy" | Generate into a preview screen with **Share** (native share sheet) and **Copy** actions | `Share.share()` is the idiomatic mobile replacement for "paste into your email client yourself" |

### 5.3 Explicit Chrome-specific capabilities requiring a Flutter replacement

| Chrome API/behavior | Flutter replacement | Phase |
|---|---|---|
| `chrome.downloads.download` (save export to a fixed `Backup/` folder) | `share_plus` (share sheet) or a user-chosen save location via `file_picker`'s save dialog / Android SAF | Phase 7 |
| `chrome.storage.local` (legacy migration source only) | N/A — Flutter has no prior Chrome-storage state to migrate from; only JSON import matters (§8) | — |
| `chrome.tabs`/`chrome.action`/`chrome.windows` (toolbar icon → tab focus) | N/A — normal app lifecycle | — |
| `chrome.runtime.getManifest()` (version badge) | `package_info_plus` | Phase 4 |
| IndexedDB (durability layer under sql.js) | Drift's own file-backed SQLite (already durable on-device; no browser storage quota concerns) | Phase 6 |
| `navigator.clipboard.writeText` | `Clipboard.setData` (`services.dart`) — no fallback needed, always available | Phase 15 |
| `window.matchMedia('(prefers-color-scheme: dark)')` | `WidgetsBinding.instance.platformDispatcher.platformBrightness` / `MediaQuery.platformBrightnessOf` | Phase 10 |
| CSS hover states | N/A — replaced by always-visible actions / swipe (§5.2) | Phase 21 |
| `<input type="date">` native picker | `showDatePicker` (Material) / `CupertinoDatePicker` | throughout |
| Google Fonts network request (only external call, degrades gracefully) | Bundle the font locally as an asset (removes the one network dependency entirely — a genuine improvement toward "fully offline, no exceptions") | Phase 4 |

---

## 6. Phase-Wise Development Plan

Each phase lists Objective, Source functionality, Implementation work, Files/modules, Data considerations, Dependencies, Testing, Acceptance criteria, Risks, and Exit criteria. Phases are ordered so that no phase depends on work from a later phase.

### Phase 1 — Existing Codebase & Feature Audit
**Objective**: Establish the authoritative behavior inventory (this document, §1) as the reference all later phases are checked against.
**Source functionality**: All of `app.js`, `db.js`, `index.html`, `style.css`, `manifest.json`, plus real production exports in `Backup/`.
**Implementation work**: Complete (see §1). Maintain it as a living reference document during implementation; any newly-discovered behavior gets added here, not silently absorbed into code.
**Files/modules**: `flutter_migration/MIGRATION_PLAN.md` (this file).
**Data considerations**: Real export data (1,934 test cases etc.) used as the basis for performance assumptions in §4.
**Dependencies**: None.
**Testing**: N/A (documentation phase).
**Acceptance criteria**: Every feature in the prompt's enumerated list has a corresponding entry in §1 or §2.
**Risks**: Some behavior only manifests in edge cases not present in the sampled real data (e.g. a field that's always empty in every real record so far). Mitigate by keeping this document open for amendment through Phase 22.
**Exit criteria**: Stakeholder sign-off that the inventory is accurate (spot-check against running the actual extension).

### Phase 2 — Functional Requirements & Compatibility Specification
**Objective**: Freeze the JSON compatibility contract before any model code exists.
**Source functionality**: Import/export (`app.js:391-457`), all 9 collection schemas.
**Implementation work**: §3 of this document — field-by-field mapping table, enum synonym table, unknown-field preservation rule, schemaVersion introduction plan.
**Files/modules**: `flutter_migration/MIGRATION_PLAN.md` §3 (this document).
**Data considerations**: This *is* the data-considerations phase.
**Dependencies**: Phase 1.
**Testing**: N/A.
**Acceptance criteria**: Every field in every collection in §1.3 has an explicit row in the mapping approach of §3.4 (or falls under the generic "everything else lives in the `data` blob" rule).
**Risks**: A field's true nullability/emptiness convention is ambiguous from the sampled exports alone. Mitigate: re-verify against `app.js` source (not just JSON samples) before finalizing — done in this pass.
**Exit criteria**: Compatibility spec reviewed and frozen; changes after this point require an explicit decision log entry (§9 gap list).

### Phase 3 — Flutter Architecture & Technology Decisions
**Objective**: Lock the technology stack (§4.2) so later phases build on stable foundations.
**Source functionality**: N/A — this is new Flutter-side design informed by the existing app's actual query/filter/volume patterns (§4.1).
**Implementation work**: Finalize package choices, layering (§4.5), DB schema (§4.3).
**Files/modules**: `flutter_migration/MIGRATION_PLAN.md` §4.
**Data considerations**: Schema must support the 1,934-row test-case pagination workload from day one, not as a later optimization.
**Dependencies**: Phase 2 (schema depends on the frozen field list).
**Testing**: N/A.
**Acceptance criteria**: Every "evaluate X vs Y" item the prompt calls out (SQLite variant, state management) has a written decision with reasoning (§4.2 table).
**Risks**: Package ecosystem drift (a chosen package becomes unmaintained before implementation starts) — re-verify package health immediately before Phase 4 kicks off, not from this planning pass alone.
**Exit criteria**: Architecture decisions reviewed; `pubspec.yaml` dependency list drafted (not yet installed).

### Phase 4 — Flutter Project Foundation
**Objective**: Scaffold a runnable, empty Flutter app with the chosen architecture wired end-to-end for one trivial vertical slice.
**Source functionality**: `manifest.json` (app name/version), sidebar footer version badge, Google Fonts usage, app icons (`assets/icon*.png`).
**Implementation work**: `flutter create`; folder structure per §4.5; Riverpod + go_router bootstrap; `package_info_plus` wired to a version display; bundle the current font locally instead of a network Google Fonts call; app icons ported from `assets/`; empty Drift database created and opened on boot.
**Files/modules**: `lib/main.dart`, `lib/app.dart`, `lib/data/database.dart` (empty schema), `lib/presentation/shell/` (bottom nav / rail shell), `pubspec.yaml`, `assets/`.
**Data considerations**: Drift database file created but with no tables yet beyond a placeholder — real schema arrives in Phase 6.
**Dependencies**: Phase 3.
**Testing**: App boots on Android + iOS simulator without error; a `flutter test` smoke test confirms the app widget builds.
**Acceptance criteria**: Empty shell with working bottom nav / rail switch at the 600dp breakpoint, correct app name/version/icon.
**Risks**: Low — pure scaffolding.
**Exit criteria**: CI (if configured) runs `flutter analyze` + smoke test clean on the empty shell.

### Phase 5 — Domain Models & JSON Compatibility Layer
**Objective**: Implement every collection's Dart model with the `extra`-preserving `fromJson`/`toJson` pattern (§4.4), and the pure business-rule functions ported verbatim from `app.js`.
**Source functionality**: All field lists in §1.3; `incrementVersion` (`app.js:229-278`); `pickPrimaryStatus`/inline primary-status logic (`app.js:626`, `2233`, reconciled per §1.3's note); deadline thresholds (`app.js:2319-2343`); pass-rate/status-breakdown math (`app.js:~6664-6857`); `mapHeaders` priority order and `normalizePriority/Severity/Status/Type` tables (`app.js:7479-7602`); ticket-key extraction (`app.js:5585`); `getTaskAlert`/`getTaskStage` (`app.js:325-379`).
**Implementation work**: One model class per collection (`Project`, `Task`, `Insight`, `Release`, `ReleasePoint`, `Developer`, `TestCase`, `Module`, `ActivityEntry`) plus enums (`ProjectType`, `LifecycleStatus`, `TaskStatus`, `TaskPriority`, `InsightType`, `InsightStatus`, `ReleaseStatus`, `TestCaseStatus`, `TestCasePriority`, `TestCaseSeverity`, `TestCaseType`) each with a `fromWire`/`wireValue` pair that also accepts the known synonyms (§3.3.7). Pure functions ported into `domain/rules/` with unit tests written alongside (not deferred to Phase 23).
**Files/modules**: `lib/domain/models/*.dart`, `lib/domain/enums/*.dart`, `lib/domain/rules/version_bump.dart`, `lib/domain/rules/task_deadlines.dart`, `lib/domain/rules/test_case_stats.dart`, `lib/domain/rules/csv_header_matcher.dart`, `lib/domain/rules/csv_normalizers.dart`, `lib/domain/rules/ticket_key.dart`.
**Data considerations**: This phase directly implements the §3 compatibility contract at the type level. Every model must round-trip a real `Backup/*.json` record through `fromJson`→`toJson` with zero field loss (this becomes an automated test, §7).
**Dependencies**: Phase 2 (frozen field list), Phase 4 (project scaffold exists).
**Testing**: Unit tests: round-trip fidelity against real sampled records from `Backup/clair-export-2026-08-05.json` for every collection; `incrementVersion` against the exact semver rollover cases in `app.js` (`.9`→`.0` at both minor and major boundaries, non-semver fallback formats); deadline threshold boundary values (`diffDays` = -1, 0, 3, 4, 7, 8, 15, 16); `mapHeaders` against a synthetic header row containing both "Scenario" and "Simplified Scenario" to prove the fix is preserved; `normalizeStatus('Not executed')` and `normalizeStatus('Untested')` both return `'Untested'`.
**Acceptance criteria**: 100% of fields in §1.3 have a model property or fall into `extra`; all ported pure functions pass unit tests asserting bit-for-bit parity with hand-traced `app.js` behavior on the same inputs.
**Risks**: A business rule turns out to have more edge cases than the research surfaced (e.g. `incrementVersion`'s non-semver fallback branches). Mitigate: the unit tests in this phase are the safety net — write them from the actual `app.js` source line-by-line, not from memory of §1's summary.
**Exit criteria**: All model + rule unit tests green; no widget/DB code depends on anything unfinished.

### Phase 6 — Local Database & Persistence
**Objective**: Implement the Drift schema (§4.3) and a repository per collection with reactive queries.
**Source functionality**: `db.js` (`ensureSchema`, `load`, `save`, `getPref`, `setPref`) — same conceptual API surface, different engine specifics.
**Implementation work**: Drift table definitions; `AppDatabase` class; one `Repository` interface + Drift implementation per collection exposing `watchAll()`, `watchFiltered(...)`, `getById`, `upsert`, `delete`, plus the specialized paginated/filtered Test Case query (`watchTestCasesPage(projectId, moduleId, filters, page, pageSize)`) backed by indexed columns, not in-memory filtering. A `PreferencesRepository` mirroring `meta` (theme, `projects_view_mode`, ordering).
**Files/modules**: `lib/data/database.dart`, `lib/data/tables/*.dart`, `lib/data/daos/*.dart`, `lib/domain/repositories/*.dart` (interfaces), `lib/data/repositories/*_drift.dart` (implementations).
**Data considerations**: Every write updates both the indexed columns and the `data` blob in the same transaction (never let them drift apart — a unit test enforces this, §7). `order_index` for projects is (re)computed on every reorder write.
**Dependencies**: Phase 5 (models feed repository generics).
**Testing**: Repository CRUD tests against an in-memory Drift database; transaction rollback test (simulate a mid-write failure, assert no partial write persists); pagination test against a seeded 2,000-row synthetic test-case table (mirrors real data volume) asserting correct page slicing and total-count reporting for every page-size option (5/10/25/50/100/150/All).
**Acceptance criteria**: All 9 collections + preferences have working repositories; a 2,000-row paginated query returns in well under 100ms on a mid-tier device profile (not a hard SLA number to gate on yet, but the phase must demonstrate it's not doing a full-table blob scan per keystroke).
**Risks**: Keeping indexed columns and the `data` blob in sync is a discipline problem, not a technical one — a single repository write path (never allow ad hoc SQL elsewhere) is the mitigation, enforced by code review.
**Exit criteria**: Repository test suite green; no UI code exists yet, but the persistence layer is feature-complete and independently verified.

### Phase 7 — Import/Export & Backup Compatibility
**Objective**: Implement the JSON import/export pipeline per §3, and the mobile replacement for `chrome.downloads` (§5.3).
**Source functionality**: `exportData`/`importData` (`app.js:391-457`), Settings → Export/Import/Clear (`app.js:3150-3427`).
**Implementation work**: `ImportExportService` — export walks every repository, builds the exact 10-key JSON shape (§3.1), writes via `share_plus`/`file_picker` save dialog. Import: `file_picker` file selection → structural validation (§3.5.1) → per-record lenient defaulting (§3.5.2) → transactional whole-DB replace (§3.5.3) or Merge mode (§3.5.4, can be deferred to a later minor phase if scope needs trimming — flagged as optional in §9). Clear Database: forced export-then-wipe, matching current UX exactly.
**Files/modules**: `lib/services/import_export_service.dart`, `lib/presentation/settings/export_import_screen.dart`.
**Data considerations**: This phase's automated tests are the direct proof of the §3 compatibility contract — real files from `Backup/*.json` are checked into the Flutter test fixtures and used as literal test inputs.
**Dependencies**: Phase 6.
**Testing**: Import every real file in `Backup/*.json` (5 files, largest 1,934 test cases) without error or data loss; export → re-import self round-trip byte-diff on the `extra`-preserved fields; corrupt-JSON handling; missing-optional-field handling; the `"Not executed"`/`"Untested"` synonym test using a synthetic record.
**Acceptance criteria**: All 5 real backup files import cleanly; a round-tripped export, when diffed key-by-key against the original import, has zero unexplained field loss (allowing only the deliberate `schemaVersion` addition).
**Risks**: A real backup file contains a field or shape this plan's sampling missed (only one file was fully inspected). Mitigate: the test suite in this phase runs against **all five** files, not just the one sampled during planning.
**Exit criteria**: A Chrome-exported file can be imported into Flutter and re-exported in a form Chrome itself can re-import without error (manually verified once against the actual extension, then locked in as an automated fixture test).

### Phase 8 — Application State Management
**Objective**: Wire Riverpod providers/notifiers over the Phase 6 repositories for every feature area, plus the cross-cutting derived providers.
**Source functionality**: The `state` object and its filter/search sub-objects (`app.js:49-88`); `render()` dispatch (`app.js:1140-1202`); `updateDeveloperDropdown` project→developer narrowing (`app.js:349-366`); debounced search (`app.js:9337-9343`, `rerenderPreservingFocus`).
**Implementation work**: One `Notifier`/`AsyncNotifier` per collection wrapping its repository's stream; `family` providers for filtered/searched views (tasks-by-project, developers-by-selected-projects); a `dashboardMetricsProvider` combining multiple repository streams (§2 row 1); debounce handled via Riverpod's own timer/`Debounce` pattern rather than DOM event timing.
**Files/modules**: `lib/application/providers/*.dart`, `lib/application/notifiers/*.dart`.
**Data considerations**: Providers must not each independently re-run heavy queries — filtered/derived providers depend on the base `watchAll()` stream and filter in Dart, matching the current app's actual approach (fetch collection once, filter in JS) except for the Test Case table, which uses the DB-level paginated query from Phase 6 directly, not a derived-in-Dart filter over the full 1,934 rows.
**Dependencies**: Phase 6.
**Testing**: Provider unit tests using `ProviderContainer` — assert a filter provider's output changes correctly when its upstream project-selection provider changes (project→developer narrowing scenario); debounce timing test.
**Acceptance criteria**: Every filter/search behavior cataloged in §1 has a corresponding provider with a passing unit test for its filter logic, independent of any widget.
**Risks**: Over-eager `autoDispose` could drop state a user expects to persist across screen navigation (e.g. an in-progress filter selection) — decide `autoDispose` vs. `keepAlive` per provider deliberately, not by default.
**Exit criteria**: All providers compile and pass unit tests with no widget code yet built against them.

### Phase 9 — Navigation & Mobile Design System
**Objective**: Build the navigation shell (§5.1) and a small reusable widget library (cards, list tiles, section headers, empty states, stat chips) mirroring the extension's CSS token system (§1, style.css inventory) as Flutter `ThemeData`/`ThemeExtension`.
**Source functionality**: Sidebar/topbar (`index.html`), CSS custom-property token categories (colors, spacing, radius, shadow, typography — style.css `:root`), `emptyState`/`buildPageHero` builders (`app.js:145-152`, `1204-1241`).
**Implementation work**: `go_router` route table with `ShellRoute` for bottom-nav (phone) / rail (tablet, ≥600dp); a `ThemeExtension` porting every CSS custom-property category to Dart `Color`/`double` tokens, defined once for light and once for dark (mirrors the CSS's own "one token set, defined twice" design principle exactly); reusable `EmptyStateWidget`, `PageHeroWidget` (stat-chip header), status/priority "pill" chip widgets.
**Files/modules**: `lib/presentation/shell/`, `lib/presentation/theme/tokens.dart`, `lib/presentation/theme/app_theme.dart`, `lib/presentation/widgets/common/*.dart`.
**Data considerations**: None (pure UI).
**Dependencies**: Phase 4.
**Testing**: Widget tests confirming the shell renders bottom nav below 600dp and a rail at/above it; golden tests (optional) for the pill/chip widgets in both themes.
**Acceptance criteria**: Navigating between all 9 (tablet) / 5 (phone) top-level destinations works with empty placeholder screens; theme tokens exist for every category identified in the style.css inventory.
**Risks**: Design system scope creep (building a component library bigger than the app needs) — build components on-demand as later phases need them, this phase only delivers the shell + the handful already known to be reused everywhere (empty state, hero, pills).
**Exit criteria**: Empty-state shell app is navigable and themed; ready for real screens.

### Phase 10 — Settings & Theme Infrastructure
**Objective**: Theme persistence (System/Light/Dark) without a flash-of-wrong-theme, plus the Settings screen.
**Source functionality**: `applyTheme`/`setTheme` (`app.js:117-138`), Settings screen (`app.js:3150-3427`).
**Implementation work**: Load the theme preference synchronously (or via a native splash held open) before first frame — Flutter's `MediaQuery.platformBrightnessOf` for "System," persisted choice for Light/Dark pinned, read from the Preferences repository (Phase 6) before `runApp`. Settings screen: Appearance picker, System overview (real record counts + real DB file size via `File.length()` — an explicit improvement over the current naive `JSON.stringify().length` estimate, §2), Export/Import/Clear entry points (wired to Phase 7's service), Developer management section.
**Files/modules**: `lib/services/theme_service.dart`, `lib/presentation/settings/settings_screen.dart`, `lib/presentation/settings/developers_screen.dart`.
**Data considerations**: Theme preference lives in the same `meta`-equivalent table as everything else (§4.2 reasoning).
**Dependencies**: Phase 6, Phase 9.
**Testing**: Widget test: app boots directly into the persisted theme with no visible flash (verify via a golden/frame-timing test or, at minimum, an integration test asserting the first frame's brightness matches the stored preference); Settings screen shows live-updating record counts.
**Acceptance criteria**: Theme choice persists across a full app restart; System mode follows OS changes live while the app is foregrounded.
**Risks**: Native splash screen APIs differ meaningfully between Android/iOS for "hold until data ready" — verify on both platforms specifically, don't assume one platform's behavior covers the other.
**Exit criteria**: Manual test matrix item "toggle theme → restart → verify" (from the README's existing manual checklist) passes on both platforms.

### Phase 11 — Developers
**Objective**: Developer registry CRUD + project-linking, and the context-sensitive filtering it feeds everywhere else.
**Source functionality**: `editDeveloper`/`confirmDeleteDeveloper`/dev management UI (`app.js:4211-4286`, `3349-3426`), `updateDeveloperDropdown` (`app.js:349-366`).
**Implementation work**: List/create/edit/delete screens; project-link multi-select; the cascade-on-delete logic (§1.5) reproduced **and extended** to cover the gaps found in the current app (releases, release points) as a deliberate, documented fix — decision flagged in §9 for confirmation before implementing the extended cascade vs. replicating the exact (incomplete) current behavior.
**Files/modules**: `lib/presentation/developers/*.dart`, `lib/application/notifiers/developer_notifier.dart`.
**Data considerations**: Deleting a developer touches `tasks`, `tests`, and — pending the §9 decision — `releases`/`releasePoints` too.
**Dependencies**: Phase 8.
**Testing**: Widget tests for CRUD; unit test for the cascade logic asserting exactly which collections get cleaned, matching whichever §9 decision was made.
**Acceptance criteria**: Developer CRUD works; project-linking correctly narrows dropdowns in Tasks/Insights/Releases/Release Points once those phases land (retested there).
**Risks**: If the extended cascade is implemented but the JSON compatibility test (Phase 7) round-trips a Chrome file with an orphaned dev ID already in it, that orphan must still import cleanly (not crash) even though Flutter's own future deletes won't create new ones.
**Exit criteria**: Manual checklist item "developer dropdowns filter to selected project" passes.

### Phase 12 — Projects
**Objective**: Full Projects feature — List (redesigned mobile cards), Kanban (5-column lifecycle), reorder, release actions, filters/search.
**Source functionality**: `renderProjects`/`renderKanbanBoard`/`renderProjectCard`/`renderKanbanCard` (`app.js:1936-2285`), project modal + save/delete (`app.js:4286-4560`), release-version automation (`app.js:5736-5788`), drag-reorder (`app.js:~4118-4167`).
**Implementation work**: Mobile card redesign (§5.2) preserving every data field from §1.3; `ReorderableListView` for list-mode reordering (writes `order_index`); Kanban as horizontally-scrollable columns with "Move to…" action sheet as primary interaction + optional drag (§5.2); project create/edit as a full-screen form with the exact validation from §1.3 (name required; Web needs `upcomingVersion`; App needs both platform "upcoming" fields; ≤3 statuses); release-action buttons reproducing `incrementVersion` + `releaseHistory` unshift+cap-10 exactly; filter bottom sheet (status/previousVersion/upcomingVersion) and search (name/description/previousVersion/upcomingVersion — **matching the current app's actual, narrower search scope**, not silently expanding it to also search Android/iOS version fields, unless that's explicitly chosen as a deliberate improvement and documented).
**Files/modules**: `lib/presentation/projects/*.dart`, `lib/application/notifiers/project_notifier.dart`.
**Data considerations**: Reconciled single `pickPrimaryStatus` function (§1.3) used for both the card border-color and any report/summary use, replacing the two inconsistent current implementations.
**Dependencies**: Phase 5, 6, 8, 9, 11 (developer linking not required for Projects itself, but Kanban/List share the shell from Phase 9).
**Testing**: Widget tests for card rendering (Web vs. App version-box layouts); unit tests for save validation, `incrementVersion` integration, reorder persistence; integration test: create project → drag/move across all 5 lifecycle columns → verify `overallProjectStatus` persists across app restart.
**Acceptance criteria**: Every manual-checklist item under "Projects" in the current README passes on the new mobile UI.
**Risks**: Reconciling the two primary-status implementations is a real (small) behavior change — must be called out explicitly in the Gap Report (§9), not silently "fixed."
**Exit criteria**: Projects feature reviewed against §2's Feature-Parity row for every listed capability.

### Phase 13 — Tasks
**Objective**: Full Tasks feature — Kanban, calendar, filters, checklist search/dynamic dev filtering, completion-date flow.
**Source functionality**: `renderTasks`/`renderCalendar`/task card (`app.js:2286-2706`, `2996-3097`), task modal + save/delete (`app.js:4561-4760`), drag/drop + completion modal (`app.js:2962-2996`, `9231-9256`), deadline/date-range filters.
**Implementation work**: Kanban board (4 columns) with "Move to…" sheet + swipe-to-advance-status as the mobile-native addition (§5.2); completion-date bottom sheet exactly reproducing the Skip/Confirm flow; calendar screen (`table_calendar` or custom grid) reproducing `getTaskCalendarRange`/`isTaskActiveOnDate` exactly, including the Done-status end-date override; filter sheet with the exact deadline thresholds and the Start Date range (no debounce needed — native date pickers don't fire per-keystroke, so the 600ms workaround from `app.js` doesn't need porting, only the underlying filter semantics do); task create/edit full-screen form with searchable project/developer checklists and live narrowing.
**Files/modules**: `lib/presentation/tasks/*.dart`, `lib/application/notifiers/task_notifier.dart`.
**Data considerations**: `workDone` field ported with no length limit, shown on card + detail; tags remain free-text CSV on input (a chip-based *display* is fine, but the storage format stays a flat array matching JSON).
**Dependencies**: Phase 5, 6, 8, 9, 11.
**Testing**: Unit tests for deadline threshold boundaries and calendar range/active-day logic (boundary-value tests: task with only startDate, only endDate, neither, Done with completedDate vs. without); widget test for Kanban drag/move and completion flow; integration test: create task → set Done via drag → completion sheet appears → confirm → `completedDate` persisted.
**Acceptance criteria**: Every manual-checklist item under "Tasks" and "Calendar" in the current README passes.
**Risks**: Swipe-to-advance-status is a genuinely new interaction with no desktop precedent — validate it doesn't conflict with list-scroll gestures during Phase 21 (Mobile Interaction Refinement) usability passes.
**Exit criteria**: Tasks feature reviewed against §2.

### Phase 14 — Project Insights
**Objective**: Issue/Enhancement/Note tracking with unrestricted status transitions (matching actual, not documented, behavior).
**Source functionality**: `renderTests`/`renderTestCard`/pills (`app.js:2706-2876`), test modal + save/delete (`app.js:2877-2962`).
**Implementation work**: Type-segmented list (tabs or filter chips replacing the desktop 3-column Kanban, §2 row "Project Insights"); create/edit form (title required only, matching current validation exactly — do not add transition guards that don't exist today); filter sheet (project/developer/status/assignedStatus); search (title/description/developer name).
**Files/modules**: `lib/presentation/insights/*.dart`, `lib/application/notifiers/insight_notifier.dart`.
**Data considerations**: `assignedStatus` stays a fully independent manual field, not auto-derived — explicitly do not "improve" this without flagging it as a behavior change first (§9).
**Dependencies**: Phase 5, 6, 8, 9, 11, 12 (project linking).
**Testing**: Unit test asserting no status-transition restriction exists (a regression test *for the absence* of a rule, given how easy it would be to accidentally add one during a mobile redesign); widget/integration tests for CRUD and filters.
**Acceptance criteria**: Manual-checklist parity for Project Insights.
**Risks**: Mobile redesign (tabs instead of 3-column board) could tempt adding "logical" status-order enforcement that doesn't exist in the source app — explicitly guarded against via the regression test above.
**Exit criteria**: Feature reviewed against §2.

### Phase 15 — Release Management
**Objective**: 7-stage free-form release workflow, announcement generation, clipboard/share.
**Source functionality**: `renderReleases`/`renderReleaseCard` (`app.js:5145-5323`), release modal + save/delete (`app.js:8713-9053`), `triggerNotesMailGeneration`/`copyReleaseNotesToClipboard`.
**Implementation work**: Release list/create/edit screens with multi-project + dynamic multi-version selection (`getReleaseVersionOptions`, reading Web vs. App version fields per selected project); status field as an unrestricted picker (no stepper/sequence UI implying an order that isn't enforced); announcement template generation ported verbatim into a preview screen with **Share** (`share_plus`) and **Copy** (`Clipboard.setData`) actions replacing the desktop mailto-textarea/clipboard-with-no-fallback pattern.
**Files/modules**: `lib/presentation/releases/*.dart`, `lib/application/notifiers/release_notifier.dart`, `lib/domain/rules/release_announcement.dart`.
**Data considerations**: **Explicit decision required** (flagged in §9): implement the README's claimed "sorted by release date descending, undated last" behavior (which the current code does *not* actually do), or replicate the current code's true behavior (unsorted/creation-order)? This plan recommends implementing the documented sort as the correct, intended behavior, treated as a deliberate bug fix — but it must be called out, not silently changed.
**Dependencies**: Phase 5, 6, 8, 9, 11, 12.
**Testing**: Unit test for the announcement template's exact field interpolation and bracketed-placeholder fallbacks; unit test for the release-date sort decision once made; widget tests for multi-project/multi-version selection.
**Acceptance criteria**: Manual-checklist parity, plus a documented note on the sort-order decision in release notes/changelog.
**Risks**: The sort-order decision is the single highest-visibility intentional behavior change in this whole migration — must be confirmed with the product owner, not assumed.
**Exit criteria**: Feature reviewed against §2; sort-order decision recorded.

### Phase 16 — Release Points
**Objective**: Checklist-card feature with add/bulk-add/bulk-assign/inline-edit and scroll-preserving toggle (achieved architecturally, not via a DOM-patch hack).
**Source functionality**: `renderReleasePoints`/`renderReleasePtCard`/`buildProgressRing`/`renderTicketInline` (`app.js:5323-5789`), `patchReleasePtCard` (`app.js:5789-6207`), modal + save/delete (`app.js:5849-6207`).
**Implementation work**: Card list (single column on phone) with expand/collapse checklist; checklist item toggle scoped to a per-item `Consumer`/`StatefulWidget` so only that row rebuilds (Riverpod's granular rebuild naturally gives the "no full re-render" scroll preservation the extension had to hand-build); Add/Bulk Add (1–50 clamp, default 3)/Bulk Assign/inline edit (Save/Cancel/Delete) reproduced exactly; ticket-key extraction via `Uri.parse` + last path segment; progress ring + completion banner.
**Files/modules**: `lib/presentation/release_points/*.dart`, `lib/application/notifiers/release_point_notifier.dart`, `lib/domain/rules/ticket_key.dart` (from Phase 5).
**Data considerations**: Save validation exactly as §1.3 (title + ≥1 project + ≥1 non-blank checklist item, blank rows silently dropped).
**Dependencies**: Phase 5, 6, 8, 9, 11, 12, 15 (optional link to a Release).
**Testing**: Unit test for ticket-key extraction against real ticket URLs sampled from `Backup/*.json`; widget test proving a checklist toggle doesn't rebuild sibling cards (scroll-position proxy test); unit tests for Bulk Add clamping (0→1, 51→50).
**Acceptance criteria**: Manual-checklist parity ("checklist toggle preserves scroll position," "bulk add inserts correct count," "inline delete without opening the modal").
**Risks**: None significant — this feature maps cleanly onto Flutter's native rebuild-scoping strengths.
**Exit criteria**: Feature reviewed against §2.

### Phase 17 — Test Case Management
**Objective**: The highest-complexity feature — All-Projects summary, paginated/filterable detail table, bulk operations, Excel/CSV import with exact header-matching and duplicate detection.
**Source functionality**: `renderTestCaseManagement`/`renderSingleTestCaseRow` (`app.js:6433-7079`), test case modal + module modal (`app.js:7079-7382`), Excel import pipeline in full (`app.js:7382-8454`), bulk selection/update/delete (`app.js:8454-8673`).
**Implementation work**:
- All-Projects summary cards (pass-rate, status breakdown) using the exact formulas from §1/Phase 5's ported `test_case_stats.dart`.
- Detail screen: DB-paginated list (Phase 6's `watchTestCasesPage`) with the exact page-size set (5/10/25/50/100/150/All) and filter sheet (search, status, priority, type); module filter as horizontal chips.
- Create/edit form (3 logical sections mirroring the desktop's 3 modal tabs: Scenario & Steps / Results & Status / Metadata & Assignee) with exact validation (`scenario`, `steps`, `expected`, `projectId` required) and the case-sensitivity reconciliation flagged in §1.3/§9.
- Excel/CSV import screen: file picker → header-row auto-detection (30-row scan, ≥2 canonical-term match) → column-mapping UI (pre-filled via the ported `mapHeaders` priority order, user-editable before commit) → duplicate detection using the exact composite key (`projectId + moduleId + id` OR `scenario`, case-insensitive) and `hasDiff` field comparison → preview screen (new/updated/duplicate counts, expandable duplicate list) → commit.
- Bulk operations: long-press selection mode (§5.2), bottom-sheet field editor for the exact 9 bulk-updatable fields with per-field control types (dropdown vs. date picker vs. text vs. textarea) matching §1.3.
**Files/modules**: `lib/presentation/testcases/*.dart` (list, detail, import, bulk-update), `lib/application/notifiers/testcase_notifier.dart`, `lib/services/excel_csv_import_service.dart`, `lib/domain/rules/csv_header_matcher.dart` + `csv_normalizers.dart` (from Phase 5).
**Data considerations**: This is the phase where the DB-level pagination from Phase 6 is actually exercised at real scale (1,934+ rows) — must be load-tested with a seeded dataset at that size before sign-off, not just functionally verified with a handful of test records.
**Dependencies**: Phase 5, 6, 8, 9, 11, 12 (module↔project relationship).
**Testing**: The single most important test suite in this migration — see §7.3 for the full list; summarized here: header-matcher priority order (Scenario vs. Simplified Scenario), all four `normalize*` tables against every recognized synonym, `hasDiff` duplicate/update classification, CSV quote/embedded-comma/embedded-newline parsing, bulk-update per-field application, pagination correctness at 1,934-row scale, module-delete cascade (moduleId cleared, not orphaned — the one collection that already gets this right).
**Acceptance criteria**: Importing the same source spreadsheet that produced the real `testCases` data in `Backup/clair-export-2026-08-05.json` (or an equivalent synthetic spreadsheet built to the same header conventions) reproduces the same 1,934 records field-for-field.
**Risks**: Highest-risk phase in the whole plan for silent business-rule divergence — the header-matcher and normalize tables are dense, order-dependent `if/else if` chains that are easy to transcribe slightly wrong. Mitigate with the exhaustive unit test list in §7.3, written against the literal `app.js` source, not from this document's summary.
**Exit criteria**: Test Case Management feature reviewed against §2; import fidelity test passes against real data.

### Phase 18 — Dashboard
**Objective**: Metric cards, weekly chart (exact clamped-week algorithm), donut, stacked bars, month-navigable Released section, recent lists.
**Source functionality**: `renderDashboard`/`initWeeklyChart`/`buildPageHero` (`app.js:1204-1935`).
**Implementation work**: Metric cards from `dashboardMetricsProvider` (Phase 8); `fl_chart` bar chart reproducing the Mon–Sun week-clamping-to-displayed-month algorithm exactly (double-counting-fix behavior); donut and stacked-bar charts per §4.2; Released section merging manual releases + per-project `releaseHistory[]` with month navigation.
**Files/modules**: `lib/presentation/dashboard/*.dart`, `lib/application/providers/dashboard_metrics_provider.dart`.
**Data considerations**: None new beyond Phase 5's ported math.
**Dependencies**: Phase 5, 6, 8, 9, 12 (projects), 13 (tasks), 14 (insights), 15 (releases).
**Testing**: Unit test for the week-clamping algorithm against a month boundary case (a week straddling two months, asserting no double-count); widget test for chart rendering with a seeded dataset.
**Acceptance criteria**: Manual-checklist parity ("Dashboard weekly chart renders for the selected month," "Released section filters correctly when navigating months").
**Risks**: The week-clamping algorithm is easy to get subtly wrong (it was itself a bug fix in the source app, per the README changelog) — must be unit-tested against the exact scenario the original fix targeted (a week spanning two months).
**Exit criteria**: Dashboard reviewed against §2; must be built after the features it summarizes (Projects/Tasks/Insights/Releases), not before.

### Phase 19 — Activity Feed
**Objective**: 200-cap append-only audit log with the exact 3-type-bucket, per-action message templates.
**Source functionality**: `logActivity` (`app.js:1072-1080`) and its 29 call sites across every feature.
**Implementation work**: `ActivityService.log(text, type)` called from every notifier's mutation methods (Phase 8, 11–17), reproducing each message template verbatim; 200-entry cap enforced at write time (mirrors `unshift`+`slice(0,200)` — implemented as `INSERT` + `DELETE WHERE rowid NOT IN (SELECT id ORDER BY at DESC LIMIT 200)` or equivalent Drift query); Activity screen (chronological list, 3 type-colored badges).
**Files/modules**: `lib/services/activity_service.dart`, `lib/presentation/activity/activity_screen.dart`.
**Data considerations**: Every feature phase (11–17) must call `ActivityService.log` at its actual mutation points — this is cross-cutting and easy to miss piecemeal; a final audit pass in Phase 27 cross-checks call-site coverage against the 29-site enumeration in §1.3.
**Dependencies**: Phase 6, and effectively every feature phase (11–17) for full call-site coverage, though the service itself can be built as soon as Phase 6 lands.
**Testing**: Unit test for the 200-cap truncation; a call-site coverage checklist (manual, cross-referenced against the enumerated 29 templates) run once every feature phase is complete.
**Acceptance criteria**: Every one of the 29 message templates enumerated in §1.3 has a reproducing call site somewhere in the app.
**Risks**: Silent gaps (a feature phase forgets to log an event) are easy to miss without the explicit checklist — treat the 29-site list as a literal QA checklist, not just documentation.
**Exit criteria**: Coverage checklist 100% complete.

### Phase 20 — Search & Filtering
**Objective**: Global search screen + consistent filter-sheet pattern across all list screens (already built per-feature in Phases 12–17; this phase is the cross-cutting search screen plus a final consistency pass).
**Source functionality**: `handleSearch` (`app.js:5146-5159`), global search input + `⌘K` (`app.js:9337-9356`).
**Implementation work**: Dedicated search screen (§5.2) querying projects/tasks/developers (matching the current scope exactly — the desktop global search does **not** search insights/releases/test cases, and this should not be silently expanded without flagging it as an enhancement decision); consistency pass ensuring every per-feature filter sheet built in Phases 12–17 shares one underlying `FilterSheet` widget pattern.
**Files/modules**: `lib/presentation/search/search_screen.dart`, `lib/presentation/widgets/common/filter_sheet.dart`.
**Data considerations**: None new.
**Dependencies**: Phase 12, 13, 11 (the three collections global search actually covers).
**Testing**: Widget test for search screen result relevance against seeded data; consistency review (not automated) of filter-sheet UX across features.
**Acceptance criteria**: Manual-checklist parity for the global search scope as currently implemented (projects/tasks/developers only).
**Risks**: Temptation to "improve" search scope to cover everything — must be a flagged decision (§9), not a silent expansion, since it changes what a saved/shared filter state means.
**Exit criteria**: Search screen reviewed against §2.

### Phase 21 — Mobile Interaction Refinement
**Objective**: Usability pass on every mobile-specific interaction invented in this migration (swipe-to-advance-status, long-press selection, drag reorder, action-sheet Kanban moves) that has no direct desktop precedent to copy from.
**Source functionality**: N/A — this phase validates the *new* interactions proposed in §5.2 against real usage, not a source behavior.
**Implementation work**: Usability testing (internal or with real users) of: Kanban action-sheet vs. drag vs. swipe on Tasks and Projects; long-press bulk-selection discoverability on Test Cases; checklist-toggle tap targets on Release Points at real phone sizes; filter-sheet vs. inline-filter preference. Adjust based on findings — this phase is expected to produce small UX iterations, not a rebuild.
**Files/modules**: Incremental edits across `lib/presentation/**`.
**Data considerations**: None.
**Dependencies**: Phases 12–20 (everything with a novel mobile interaction must exist first).
**Testing**: Usability findings documented; any resulting UI change gets its own widget test update.
**Acceptance criteria**: No interaction from §5.2 is rated "confusing" or "undiscoverable" by more than one tester in an internal usability pass (qualitative gate, not a numeric SLA).
**Risks**: Usability findings could motivate a late architecture change (e.g. abandoning drag entirely in favor of action-sheet-only) — timebox this phase and treat major pivots as a new mini-plan, not scope creep into Phase 22+.
**Exit criteria**: Interaction patterns signed off as final.

### Phase 22 — Data Migration & Compatibility Testing
**Objective**: Prove, with real files, that the full Chrome ↔ Flutter compatibility contract (§3) holds under realistic data volume and content.
**Source functionality**: All of §3, exercised end-to-end.
**Implementation work**: Run the actual Chrome extension, export real data, import into the built Flutter app (all 5 phases-worth of features now exist), use the Flutter app, re-export, and attempt re-import back into a running Chrome extension instance — a genuine cross-app round trip, not just a unit test of the JSON layer in isolation.
**Files/modules**: N/A — this is a testing/verification phase; any bugs found route back to the relevant feature phase for a fix.
**Data considerations**: Use all 5 real files in `Backup/`, plus a deliberately adversarial synthetic file (missing optional fields, unknown extra fields, duplicate IDs, an orphaned project reference, both `"Untested"`/`"Not executed"` status values present, a task with `startDate > endDate`).
**Dependencies**: Phases 5–20 essentially complete.
**Testing**: This phase *is* the test — see §7.3's import/export test matrix, now run as full integration tests rather than isolated unit tests.
**Acceptance criteria**: Every real file imports without data loss; the adversarial synthetic file is handled per §3.5's lenient-defaulting rules without crashing; a Flutter re-export imports cleanly into the real Chrome extension.
**Risks**: This is where any planning gap in §3 will surface concretely — treat findings here as required fixes, not "known limitations," unless truly infeasible (route to §9).
**Exit criteria**: Cross-app round-trip verified manually at least once against the real, unmodified Chrome extension; automated regression tests lock the result in.

### Phase 23 — Automated Testing
**Objective**: Fill in any remaining gaps in the unit/widget/integration test suites that individual feature phases didn't already cover, and establish CI.
**Source functionality**: N/A.
**Implementation work**: Coverage review against §7's full test matrix; add missing widget tests for major screens; add the full integration-test workflows listed in §7.5; wire CI (`flutter test`, `flutter analyze`) if not already present from Phase 4.
**Files/modules**: `test/`, `integration_test/`, CI config.
**Data considerations**: None.
**Dependencies**: All feature phases (11–20).
**Testing**: This phase is about test infrastructure itself.
**Acceptance criteria**: §7's full matrix has at least one passing automated test per row.
**Risks**: Coverage theater (tests that pass trivially without asserting real behavior) — code review should reject tests that don't assert against a specific ported business rule from §1.
**Exit criteria**: CI green on a clean checkout.

### Phase 24 — Performance & Offline Testing
**Objective**: Verify the app performs acceptably at real data scale and behaves correctly with zero network connectivity at every point.
**Source functionality**: N/A — validates §4.6's offline-first/performance claims.
**Implementation work**: Load-test with a seeded dataset matching real volume (1,934+ test cases, 150+ tasks, 200 activity entries) across low/mid-tier device profiles; airplane-mode testing of every feature (should be indistinguishable from online, since there is no network dependency by design); cold-start time measurement; large-import time measurement (Phase 7/17's import pipeline against the largest real file).
**Files/modules**: N/A (testing phase; performance fixes route back to the relevant phase, most likely Phase 6/17 if pagination or import turns out too slow).
**Data considerations**: None new.
**Dependencies**: Phase 17, 22.
**Testing**: Documented performance benchmarks (cold start, list scroll frame time on the paginated test-case table, import duration for the largest real file).
**Acceptance criteria**: No feature requires network connectivity; test-case list scrolling holds 60fps on a mid-tier device profile with 150-per-page (the largest common page size) loaded.
**Risks**: A performance shortfall here likely traces back to a Phase 6 indexing gap — budget time for a possible return trip to that phase.
**Exit criteria**: Benchmarks documented and meet the acceptance criteria above.

### Phase 25 — Android Build & Release Preparation
**Objective**: Production-ready Android build.
**Source functionality**: `manifest.json` metadata (app name, version, icons) as the source for Android manifest equivalents.
**Implementation work**: App icons/splash for Android densities; `android/app/build.gradle` versioning tied to the same version source as the in-app badge (Phase 4); release signing config; Play Store listing assets (out of scope for this plan's engineering work, but the build must produce a signed, installable release APK/AAB).
**Files/modules**: `android/`.
**Data considerations**: None.
**Dependencies**: Phase 23, 24.
**Testing**: Install and smoke-test the signed release build (not just debug) on a physical Android device.
**Acceptance criteria**: Signed release AAB builds cleanly and installs/runs correctly.
**Risks**: Release-mode-only bugs (obfuscation breaking Drift codegen reflection, etc.) — must be caught here, not assumed away from debug-mode testing throughout the earlier phases.
**Exit criteria**: Release build verified on a physical device.

### Phase 26 — iOS Build & Release Preparation
**Objective**: Production-ready iOS build.
**Source functionality**: Same as Phase 25, iOS side.
**Implementation work**: App icons/launch screen for iOS; `Info.plist` metadata; provisioning/signing; App Store listing assets (out of scope for engineering work, but the build must produce a signed, installable release build).
**Files/modules**: `ios/`.
**Data considerations**: None.
**Dependencies**: Phase 23, 24.
**Testing**: Install and smoke-test the signed release build on a physical iOS device (TestFlight or direct).
**Acceptance criteria**: Signed release build runs correctly on a physical device.
**Risks**: iOS-specific Drift/SQLite file-system sandboxing differences from Android — verify explicitly, don't assume Android testing covers it.
**Exit criteria**: Release build verified on a physical device.

### Phase 27 — Final Regression & Feature-Parity Audit
**Objective**: Close the loop against every requirement in the original prompt.
**Source functionality**: The entire feature set (§2).
**Implementation work**: Walk the Feature-Parity Matrix (§2) row by row against the finished app; walk the current README's own "Manual test checklist before submitting" line by line against the Flutter app (translated to mobile interactions per §5); confirm the Activity call-site checklist (Phase 19) is still 100%; confirm the §9 Gap/Risk items are each either resolved or explicitly accepted as a known limitation with sign-off.
**Files/modules**: N/A.
**Data considerations**: Final confirmation that a real Chrome export still round-trips correctly (re-run Phase 22's test against the final build, not just the build that existed when Phase 22 was first executed).
**Dependencies**: All prior phases.
**Testing**: Full manual regression pass + full automated suite (Phase 23) green.
**Acceptance criteria**: Every row in §2 is marked "done" or has an explicit, signed-off exception in §9.
**Risks**: Scope drift across 26 prior phases could leave a few rows silently unaddressed — this phase's entire purpose is to catch that.
**Exit criteria**: Sign-off that the Flutter app has full feature/behavior/data parity with the Chrome extension, by explicit design, except where §9 documents an intentional, approved difference.

---

## 7. Testing Strategy

### 7.1 Unit tests (domain layer, no Flutter/DB dependency)
Models: round-trip `fromJson`→`toJson` fidelity per collection against real sampled records, including `extra`-field preservation. Serialization: enum synonym normalization (`"Not executed"`/`"Untested"`). Date handling: `YYYY-MM-DD` vs. ISO-8601 timestamp fields never conflated. Filtering: every threshold in §1 (task deadlines, calendar active-day ranges) tested at boundary values. Sorting: dashboard recent-lists ordering, release sort decision (§9). Metrics: dashboard stat formulas, weekly-chart week-clamping. Pass-rate: exact formula match. Release calculations: `incrementVersion` full rollover matrix. Task calculations: `getTaskStage`/`getTaskAlert`. Status transitions: explicit regression tests asserting **no** restriction exists where none does today (Insights, Releases). ID/relationship handling: cascade-cleanup unit tests per §1.5/§9 decisions.

### 7.2 Repository/database tests
CRUD per collection against an in-memory Drift instance. Transactions: forced mid-write failure → rollback verified. Persistence: close/reopen the DB, confirm data survives. Migrations: a Drift schema-version bump test once any post-v1 schema change exists. Ordering: `order_index` write/read round trip for Projects. Preferences: theme/view-mode persistence. Activity limits: 200-cap enforcement at the DB layer.

### 7.3 Import/export tests (the highest-priority suite — uses real exported JSON)
Using the 5 real files in `Backup/*.json`:
- Chrome → Flutter: import each file, assert record counts match, assert every field survives (spot-checked field-by-field against a sample from each collection), assert the `"Not executed"`/`"Untested"` normalization.
- Flutter → Chrome: export what was just imported, hand this file to a running instance of the real Chrome extension, confirm it imports without the "Invalid backup file" toast and renders correctly.
- Empty datasets: import a file with all-empty arrays.
- Large datasets: the 1,934-test-case file, timed.
- Missing optional fields: synthetic record missing `dueDate`/`clientName`/etc.
- Unknown fields: synthetic record with an extra top-level key and an extra per-record key, both must survive a round trip.
- Invalid records: a record missing a field Chrome itself always requires (e.g. task with no `title`) — Flutter's importer must apply the same fallback Chrome's own renderers would (never crash).
- Duplicate IDs: two projects sharing an ID within one file — documented decision on which wins (last-write, matching Chrome's own `state.projects = data.projects` full-replace semantics, which has no dedup either).
- Broken relationships: task referencing a nonexistent `projectId` — must render/import without crashing (matches the orphan-tolerant pattern throughout the source app, §1.5).
- Old exports: a file without `exportedAt` or `schemaVersion` (pre-dates this migration).
- New exports: a Flutter-produced file with `schemaVersion` present.
- Partial exports: N/A today (the source app has no partial-export feature) — not a required test unless Flutter adds one later.
- Corrupt JSON: truncated/malformed file, must fail cleanly with the current DB untouched.
Excel/CSV import-specific (Phase 17): header-matcher priority order (esp. Simplified Scenario vs. Scenario), all `normalize*` synonym tables, `hasDiff` duplicate/update classification, quoted-field/embedded-comma/embedded-newline CSV parsing, header-row auto-detection at various offsets.

### 7.4 Widget tests
Cover every major screen from Phases 9–20: navigation shell at both breakpoints, each feature's list/detail/create-edit screens, filter sheets, bulk-selection mode, the theme-flash-free boot sequence, the checklist-toggle-doesn't-rebuild-siblings proof for Release Points.

### 7.5 Integration tests (full workflows)
- Create project → create task → assign developer → complete task (verifying the completion-date flow end to end).
- Create release → move through all 7 statuses in arbitrary (non-sequential) order, confirming no restriction blocks any transition.
- Create test cases → filter → bulk update → export, then verify the export file's shape.
- Export → clear database → import → verify data (the exact scenario the current README's manual checklist already describes).
- Change theme → restart app → verify theme (no flash).
- Reorder projects → restart app → verify ordering persisted.
- Import a real Chrome export → verify every screen renders the imported data correctly (a true cross-feature smoke test).

### 7.6 Regression / feature-parity checklist
The Feature-Parity Matrix (§2) itself doubles as the regression checklist, walked in Phase 27. Additionally, the current README's own "Manual test checklist before submitting" (its final section) is translated line-by-line into mobile-equivalent checks and run at Phase 27.

---

## 8. Migration Strategy

### 8.1 User-facing migration path

**Chrome Extension → JSON Export → Flutter Import** is the only supported path, matching the constraint against introducing a cloud backend. Concretely:
1. User opens the existing Chrome extension, goes to Settings → Export Data.
2. The resulting `clair-export-YYYY-MM-DD.json` file is transferred to the mobile device by whatever means the user already uses for files (email, cloud-drive app, USB, AirDrop) — this is outside the app's control and does not require any new infrastructure.
3. User opens the Flutter app for the first time, is offered an explicit "Import existing data" entry point (in addition to the normal Settings → Import), selects the file via the OS file picker.
4. Flutter validates and imports per §3.5's lenient rules, using **Replace mode** by default for a first-run import (there's nothing to merge with yet).

### 8.2 Reliability requirements for this path

Because this is the *only* migration path (no cloud, no direct device-to-device sync), it must be extremely reliable:
- The import must handle every real file shape found in the 5 sampled `Backup/*.json` exports without any manual intervention.
- The import must never partially apply (§3.5.3's transactional guarantee) — a failed import must leave a fresh install exactly as empty as before the attempt, never a half-imported mess.
- Errors must be specific enough for a non-technical user to act on ("This doesn't look like a Clair backup file" vs. a generic parse error).
- The Settings screen must make **Export** trivially discoverable in the Chrome extension side (it already is, per the current UI) and **Import** trivially discoverable on the Flutter side, with a first-run prompt actively inviting it rather than requiring the user to find Settings unprompted.

### 8.3 What this migration explicitly does NOT need

Per the prompt's constraint against introducing a backend "simply to solve migration," and because Clair's whole design premise is local-first with no account system: no server-mediated sync, no QR-code device pairing, no cloud storage integration is in scope. If real-world usage later reveals the file-transfer step is a meaningful friction point, a **future, separate** consideration (not part of this plan) could be a direct local transfer mechanism (e.g. local Wi-Fi/Bluetooth file send) — but this is explicitly out of scope unless requested, since it would be new functionality beyond "port the existing app," not a compatibility requirement.

### 8.4 Post-migration state

After a successful import, the Flutter app is the user's live copy; the Chrome extension's data is untouched (import is one-directional per session) and remains usable/exportable independently. Since both apps can independently export/import the same JSON shape (§3.6), a user who continues using both during a transition period can keep them in sync manually by re-exporting/re-importing — this is a real (documented) limitation, not silent data loss, since there is no live sync between the two: see §9.

---

## 9. Final Gap / Risk Report

### 9.1 Things that cannot be migrated 1:1 (by design — mobile UI redesign)

| Item | Why it can't be 1:1 | Resolution |
|---|---|---|
| Desktop hover-reveal actions | No hover on touch | Always-visible icons / swipe actions (§5.2) |
| HTML5 drag-and-drop Kanban | Imprecise on small touch targets as the *only* interaction | Action-sheet primary + drag/swipe secondary (§5.2) |
| `Ctrl+K`/`Ctrl+Enter`/`Esc` shortcuts | No hardware keyboard on most phones | Dedicated search screen + standard mobile save/cancel gestures; shortcuts retained only as an enhancement for external-keyboard sessions |
| Generic single `detailModal`/`confirmModal` reuse | Mobile users expect real screens with back-button navigation, not a DOM-reuse trick | Type-specific detail screens sharing a layout widget (§5.2) |
| 3-/4-/5-column Kanban boards at full desktop width | Doesn't fit phone width | Horizontally-scrollable columns or tabbed/segmented views depending on feature (§5.2) |
| `chrome.downloads` fixed-folder export | No mobile equivalent | OS share sheet / document picker (§5.3) |

### 9.2 Things requiring special handling (real bugs/inconsistencies found in the source app — do not blindly replicate)

| # | Finding | Recommendation | Decision needed from |
|---|---|---|---|
| 1 | `testCase.status` has two live canonical strings: HTML default `"Not executed"` vs. everywhere-else `"Untested"` | Treat `"Untested"` as canonical in Flutter; accept `"Not executed"` as an import synonym; **fix the underlying bug** by never writing `"Not executed"` from Flutter's own UI | Confirm before Phase 5 locks the enum |
| 2 | README claims releases sort by release date descending; no such sort exists in `app.js` | Recommend implementing the *documented* (correct) sort in Flutter, treated as an intentional bug fix, called out in release notes | Confirm before Phase 15 |
| 3 | Two different, inconsistent "primary status" pickers for a project's card border color (Excel report vs. card render) | Reconcile into one function; recommend the Excel report's more complete priority order (`Stable > Testing > In Progress > Started > statuses[0]`) as the single source of truth | Confirm before Phase 5/12 |
| 4 | No delete cascade for Project or (partially) Developer across Releases/Release Points/Test Insights/Test Cases — orphaned IDs persist forever today | Recommend Flutter **adds** full cascade cleanup (a deliberate, positive behavior change) since it removes a real class of latent data-integrity bug, while Flutter's importer must still gracefully accept already-orphaned IDs coming from an old Chrome export | Confirm before Phase 11/12 |
| 5 | `testCase` duplicate-ID check is case-sensitive in the manual modal but case-insensitive on Excel import | Standardize on case-insensitive everywhere in Flutter (the more conservative choice, avoids near-duplicate IDs differing only in case) | Low-risk, default to this unless overridden |
| 6 | First-run boot fetches a bundled `Backup/clair-export-2026-06-02.json` file (real user data) as "demo data" if present | **Do not replicate.** Flutter's first-run demo/sample data must be genuinely synthetic, generated data, never a real backup file bundled with the app — this is also a mild data-handling concern in the *current* repository worth flagging to the team independently of the Flutter work | Should be raised with the team regardless of this migration |
| 7 | `updateStorageInfo()` is a dead no-op function called as if it did something | Do not port; Flutter's System Overview computes real values directly (Phase 10), no placeholder function needed | No decision needed, just don't replicate the dead code |
| 8 | Global search only covers projects/tasks/developers, not insights/releases/test cases, despite "Global Search" sounding exhaustive | Preserve current (narrower) scope by default; expanding it is a legitimate future enhancement but must be an explicit, flagged decision, not a silent scope change during the mobile rebuild | Confirm before Phase 20 |
| 9 | `populateReleasePtReleases` filters candidate releases by legacy singular `projectId`, missing releases only linked via the newer `projectIds[]` array | Recommend fixing in Flutter (filter on `projectIds[]` correctly) as a small, low-risk bug fix | Low-risk, default to fixing it |

### 9.3 Decisions needed before implementation (consolidated)

1. Canonical Test Case status string and synonym handling (§9.2 #1).
2. Release sort-order: implement documented behavior vs. replicate actual (unsorted) behavior (§9.2 #2).
3. Reconciled primary-status function for Projects (§9.2 #3).
4. Scope of new cascade-cleanup behavior on delete (Developer/Project → Releases/Release Points) — replicate the current gap vs. fix it (§9.2 #4).
5. Whether the Excel Report Export feature (`exceljs.min.js`-based `.xlsx` generation, present in code but not explicitly named in the prompt's required feature list) is in scope for the Flutter v1, or deferred — recommend deferring past the initial mobile release given it's a desktop-oriented reporting feature, revisited once core parity is complete.
6. Whether JSON "Merge" import mode (§3.5.4) ships in v1 or is deferred — recommend deferring; **Replace mode alone already satisfies the required Chrome↔Flutter compatibility contract**, and Merge is a genuine enhancement, not a parity requirement.
7. Global search scope expansion (§9.2 #8) — recommend keeping current scope for v1.

### 9.4 Residual risks carried into implementation

- **Test Case Excel import fidelity** (Phase 17) is the single highest-effort-to-verify area of the whole port, given the density of order-dependent string-matching logic; budget proportionally more review time there than the phase's line-count share would suggest.
- **Real-world file diversity**: only five real export files were available for analysis; a user's actual Chrome-side data could contain a field combination not present in any sampled file (e.g., a very old export predating a since-added field). The lenient-defaulting import rule (§3.5.2) is the general-purpose mitigation, but Phase 22's cross-app round-trip test is the concrete verification step, not this planning document alone.
- **No license file currently exists** in the source repository (noted in its own README) — outside this plan's scope, but worth the team's attention before any public distribution of either app.
