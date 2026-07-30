<div align="center">

# Clair

**A local-first project & release tracker — built as a Chrome Extension**

![Version](https://img.shields.io/badge/version-2.3.5-informational?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Chrome%20Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Manifest](https://img.shields.io/badge/manifest-V3-success?style=flat-square)
![Stack](https://img.shields.io/badge/stack-Vanilla%20JS%20%2F%20HTML%20%2F%20CSS-F7DF1E?style=flat-square)
![No Build](https://img.shields.io/badge/build-none%20required-lightgrey?style=flat-square)
![Storage](https://img.shields.io/badge/storage-SQLite%20(sql.js)-blueviolet?style=flat-square)
![Theme](https://img.shields.io/badge/theme-light%20%2F%20dark-333333?style=flat-square)

Track projects, tasks, releases, and your team — entirely in your browser, with no server required.

</div>

---

## Table of Contents

- [Overview](#overview)
- [What's New](#whats-new)
- [Features](#features)
- [Quick Start](#quick-start)
- [Screens](#screens)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Architecture](#architecture)
- [Data Models](#data-models)
- [File Structure](#file-structure)
- [Chrome APIs Used](#chrome-apis-used)
- [Import & Export](#import--export)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Clair is a single-page Chrome Extension (Manifest V3) for coordinating software projects, tasks, release cycles, and developer assignments — with zero backend, zero build step, and zero cloud dependency.

All data is stored in a real **SQLite database** running in-browser via [sql.js](https://github.com/sql-js/sql.js) (SQLite compiled to WebAssembly), persisted to **IndexedDB** so it survives reloads, browser restarts, and extension updates. Existing installs are migrated automatically and exactly once — legacy `chrome.storage.local` (or `localStorage`, in standalone mode) data is read, inserted into SQLite inside a transaction, verified, and only then cleared. A JSON export/import flow still provides backup and cross-device portability on top of that.

The UI also supports **light and dark themes** — either following the OS setting automatically, or pinned explicitly from Settings → Appearance (the choice persists in the database).

The current app version is displayed in the sidebar footer and is always read directly from `manifest.json` — it updates automatically whenever the manifest version is bumped.

**Who it is for:** Individual project coordinators, release managers, or small internal teams who want a lightweight, private, always-available tracker without signing up for anything.

---

## What's New

### Storage migration to SQLite & full visual redesign (latest, unreleased)

> The `manifest.json` version has not been bumped for this round of changes — the sidebar badge still reads 2.3.5. Bump it when these changes ship.

#### Persistence: chrome.storage.local → SQLite

- **SQLite is now the only persistence layer.** [db.js](db.js) embeds [sql.js](https://github.com/sql-js/sql.js) (SQLite → WebAssembly) and exposes a small `ClairDB` API (`load`, `save`, `getPref`, `setPref`) that the rest of the app talks to — `app.js`'s own `storage.load()` / `storage.save()` now just delegate to it, so no business logic changed.
- **Schema**: one table per collection (`projects`, `tasks`, `tests`, `activity`, `developers`, `releases`, `testCases`, `modules`, `releasePoints`), each `(seq, id, data, updated_at)` with the full record kept as a JSON blob (so no existing field was ever at risk of being dropped or reshaped) plus an index on `id`. A `meta` table holds schema version, migration status, and user preferences (theme, projects view mode).
- **Automatic one-time migration**: on first load after updating, legacy `chrome.storage.local` (or `localStorage` in standalone mode) data is read, inserted transactionally, row counts are verified against the source, and only then is the legacy data cleared and a `migrated_v1` flag set. Re-running it (e.g. a second reload) is a no-op — verified with automated tests that seed legacy data, migrate, and reload repeatedly with no duplication.
- **Durability**: the live sql.js database is exported to bytes and written to **IndexedDB** after every save, so data survives reloads and browser restarts without depending on `chrome.storage`'s size limits.
- `chrome.storage.local` is now only touched for the one-time legacy read/cleanup — see [Chrome APIs Used](#chrome-apis-used).

#### Design: complete visual redesign

- **New design system** — full replacement of the color palette (an indigo/violet brand accent replacing the old flat green, with green reserved for "success" status only), a real typographic scale, a 4px spacing scale, a multi-level elevation/shadow system, and a tightened radius scale — all as CSS custom properties in [style.css](style.css).
- **Light & dark themes** — every token has a dark-mode value, switchable via `prefers-color-scheme` or an explicit toggle in **Settings → Appearance**, persisted through `ClairDB.setPref`.
- **Topbar decluttered** — the five separate "Add Task / Add Insight / Add Test Case / Add Release Point / Add Release" buttons are now grouped into a single animated **"+ New" dropdown menu**; "Add Project" remains the one standalone primary action. Import/Export became icon-only buttons.
- **Every screen restyled** — dashboard, projects (list & Kanban), tasks, calendar, project insights, test case management, release management, release points, activity, and settings all redrawn against the new system; shared components (buttons, inputs, badges/pills, cards, tables, tabs, modals, toasts, empty states) unified into one visual language with hover-elevation and consistent motion.
- **Accessibility pass** — ARIA labels on icon-only buttons, `role="dialog"`/`aria-modal` on all modals, a visible `:focus-visible` ring everywhere, and `prefers-reduced-motion` support.

### v2.3.5

#### Dashboard

- **Weekly task completion chart** — a Chart.js bar chart shows task completions grouped by day of week for the selected month. Month navigation (prev / next) is shared with the Released section.
- **Released section with month switcher** — the "Released This Month" section is now labelled "Released" and includes the same month navigation pill used by the chart, so you can browse released projects for any past month without leaving the dashboard.

#### Projects Page — Kanban View & Metadata

- **List/Kanban view toggle** — replaced the project count in the project bar with a view toggle segmented button group, allowing users to switch between the traditional list view and a new Kanban Board view representing the overall lifecycle status of projects. Selection is persisted in `localStorage` (`clair_projects_view_mode`).
- **Lifecycle status Kanban view** — projects are organized into five lifecycle columns (*Yet to Start*, *On Going*, *Completed*, *Monitoring*, *On Hold*). Supports full horizontal board scrolling and individual column vertical scrolling. Features custom cards displaying Client, Team, Due Date, Priority, current internal statuses, and overall task completion progress.
- **Project modal extensions** — added Overall Project Status select, Client Name input, Assigned Team input, Due Date input, and Priority select to allow full visual coordination of projects.
- **Interactive drag-and-drop lifecycle tracking** — drag cards between lifecycle columns on the Kanban board to update `overallProjectStatus` instantly.
- **Persistent projects scroll state** — saves and restores horizontal and vertical scroll positions of the Kanban board and columns across view mode switching.

#### Task Modal — Search & Filtering

- **Dynamic developer filtering** — selecting a project in the Task modal instantly filters the developer checklist to display only team members linked to the selected project(s). If no projects are selected, it displays the full developer list.
- **Searchable checklists** — added search boxes above both the Project and Developer checklists inside the Task modal, allowing instant text-filtering of items dynamically while keeping selections intact.

#### Project Cards — full redesign

- **3-column horizontal card layout** — each project card is now a horizontal row divided into three sections: project info (left), version (center), release history + actions (right). Cards stack vertically in a single column so no information is ever off-screen.
- **Colored left border as status indicator** — the left edge of each card is colored by primary status (green = Stable, amber = Testing, blue = In Progress, gray = Planned). All three sections share a clean white background; there are no tinted gradients.
- **Version section with card-like boxes** — the center column renders version data inside individually bordered, rounded boxes:
  - *Web projects:* a single box showing **Previous** (left) and **Current** (right) with the current version highlighted in the accent color.
  - *App projects:* two separate boxes stacked vertically — one for **Android**, one for **iOS** — each showing **Prev** and **Up** columns side by side.
  - Empty or N/A values display as `—` for clarity.
- **Compact release history column** — the right column is fixed at 240 px so it never dominates wide viewports. It shows up to three recent release log entries with checkmarks and dates, a "Clear" button when history exists, and the last-updated date.
- **Side-by-side release buttons** — Web projects show a single "Release Version" button; App projects show "Android Release" and "iOS Release" side by side, both filling the column equally.

#### Earlier v2.3.5 changes

- **Release cards sorted by release date** — cards on the Release Management screen sort by release date descending; undated releases appear at the end.
- **Release Point card redesign** — compact two-column horizontal layout with a slim inline progress bar. Cards sit 2-per-row on desktop.
- **Release Point card actions on hover** — edit and delete buttons float to the top-right and only appear on hover.
- **Inline checklist item delete** — the pencil icon on a checklist item opens an inline form with Save, Cancel, and Delete.
- **Bulk Add for checklist items** — a count picker (`−` / number / `+`) inserts multiple empty rows at once.
- **No-scroll checklist toggle** — toggling a checklist item patches the DOM in place; scroll position is fully preserved.
- **App version badge** — current version shown in the sidebar footer, read from `manifest.json` automatically.

---

## Features

| Area | What you can do |
|---|---|
| **Dashboard** | Live counts for projects, tasks, and insights; weekly task completion bar chart; released projects by month; recent projects, tasks, and insights. |
| **Projects** | Create web and mobile app projects with platform-specific version fields; support custom metadata (Client, Team, Due Date, Priority); toggle between classic 3-column List view and 5-column lifecycle Kanban board view with HTML5 drag-and-drop; search, filter, edit, delete. |
| **Tasks** | 4-column Kanban board (To-Do, In Progress, Done, On Hold); drag cards between columns; visual date alerts for overdue, due-today, and due-tomorrow tasks; assign tasks to developers. |
| **Project Insights** | Capture issues, enhancements, and notes per project; track each item through a Dev → QA → Done workflow; filter by developer, status, and assignment state. |
| **Release Management** | Log releases sorted by release date; advance through a seven-stage status workflow (Draft → Released); generate email-style release announcements; copy notes to clipboard. |
| **Release Points** | Compact horizontal cards in a two-column grid; slim progress bar per card; inline delete for checklist items; bulk add with a count picker; scroll-preserving checklist toggle. |
| **Test Case Management** | Enter structured test cases with priority, severity, module, and status; import cases from CSV; group by module. |
| **Developers** | Maintain a developer registry; link developers to projects so they appear in context-sensitive dropdowns on tasks and insights. |
| **Activity Feed** | Timestamped audit trail of every create, update, delete, move, and copy action (capped at 200 entries). |
| **Data Portability** | Export all collections to a single JSON file; restore from any previous export; clear all data after a mandatory backup prompt. Underlying storage is SQLite, but the export/import file shape is unchanged. |
| **Responsive UI** | Sidebar collapses to a hamburger menu on small screens; card grids and Kanban boards reflow for mobile and tablet. |
| **Appearance** | Light and dark themes, either following the OS (`prefers-color-scheme`) or pinned explicitly from Settings → Appearance; choice persists across reloads. |
| **Global Search** | `Ctrl+K` / `Cmd+K` opens instant search across projects, tasks, and developers from any screen. |
| **"+ New" menu** | The topbar groups Task / Insight / Test Case / Release Point (and Release, on the Release Management screen) into one dropdown, keeping "Add Project" as the single standalone primary action. |
| **Version Badge** | App version shown in the sidebar footer; auto-read from `manifest.json` — always stays in sync. |

---

## Quick Start

No installation tool needed. Choose one of two modes:

### As a Chrome Extension (recommended)

1. Open `chrome://extensions` in Chrome or any Chromium-based browser.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select this project folder.
4. Click the **Clair** icon in your browser toolbar.

The app opens in a dedicated tab. Clicking the icon again focuses the same tab instead of opening a new one.

### As a Standalone Web Page

1. Open `index.html` directly in any modern browser.
2. Data is stored in a SQLite database (via sql.js), persisted to IndexedDB for that page's origin.

> **Note:** Extension mode (`chrome-extension://…`) and standalone mode (`file://` or `http://…`) are different browser origins, so they still don't share the same IndexedDB storage. Use the export/import flow if you need to move data between them.

---

## Screens

Clair is a single-page application. Navigation switches the rendered view in place; the browser URL never changes.

| Screen | Internal view key | Purpose |
|---|---|---|
| Dashboard | `dashboard` | Live metrics, weekly chart, released projects, and recent records |
| Projects | `projects` | Project catalog with 3-column cards, version boxes, and release actions |
| Tasks | `tasks` | Kanban board for task execution |
| Project Insights | `tests` | Issue, enhancement, and note board per project |
| Release Management | `releases` | Release lifecycle and note generation (sorted by release date) |
| Release Points | `releasepoints` | Compact checklist cards with bulk add and inline delete |
| Test Cases | `testcases` | Structured test case entry and management |
| Activity | `activity` | Chronological audit feed |
| Settings | `settings` | Export, import, clear data, and developer management |

### Dashboard

Displays four metric cards (projects, tasks, insights, top status), a weekly task completion bar chart with month navigation, a "Released" section showing projects released in the selected month, and three lists showing the four most recent projects, five most recent tasks, and five most recent insights. Auto-updates whenever data changes.

### Projects

Supports two interchangeable modes:

- **List View**: The classic view rendering horizontal 3-column rows:
  1. **Left — Info**: Project name, type badge (WEB/APP), status pills, description, edit/delete actions.
  2. **Center — Version**: Version boxes with Previous/Current for Web, or Android/iOS rows for App. Empty values display as `—`.
  3. **Right — History + Actions**: Up to three release log entries, last-updated date, and Release button(s).
- **Kanban View**: Visualizes projects inside five lifecycle status columns (*Yet to Start*, *On Going*, *Completed*, *Monitoring*, *On Hold*). Cards are draggable between columns to update status instantly. Card display includes Client Name, Assigned Team, Due Date, Priority badge, current internal statuses, and overall task progress bars.

Supports two project types with different version fields:

- **Web** — single version track: previous release version + upcoming release version, displayed in a single rounded box.
- **App** — dual platform tracks: Android (previous/upcoming) + iOS (previous/upcoming), each displayed in its own rounded box.

Projects support two types of status values independently:
1. **Statuses (Concurrent)**: Up to three simultaneous tags drawn from: `N/A`, `Started`, `Stable`, `Testing`, `Automation`, `On Hold`, `Yet to Start`, `Completed`, `In Progress`, `Blocker`, `Issue Assigned`, `Developer`, `New Development`.
2. **Overall Project Status (Lifecycle)**: A single lifecycle categorization: `Yet to Start`, `On Going`, `Completed`, `Monitoring`, `On Hold`.

Filters: project status, previous version, upcoming version. Search matches name, description, client, team, and version fields.

### Tasks — Kanban Board

Four columns: **To-Do** · **In Progress** · **Done** · **On Hold**

- Drag a card between columns to update its status instantly.
- Click the circular check button on a card to mark it **Done**.
- Cards display a coloured date indicator when the end date has passed (overdue), is today, or is tomorrow.
- **Task modal search & dynamic developer filter**:
  - **Checklist Search**: Adding or editing a task features built-in search boxes above the **Project** and **Developer** checklists to quickly filter items without scrolling the checklist container.
  - **Dynamic Developer Filtering**: Selecting a project dynamically filters the developer checklist, displaying only developers who are linked to the selected project(s). If no projects are checked, all developers are displayed.

Filters: project, date range. Search matches title, description, and developer name.

### Project Insights

Three columns: **Issue** · **Enhancement** · **Note**

Statuses: `In Dev`, `QA`, `Done`, `Known Issue`.
Assignment states: `Yet to be assigned`, `Assigned`.

Filters: project, developer, status, assignment state. Search matches title, description, and developer name.

### Release Management

Cards are sorted by **release date descending** (most recent date first; undated releases at the end).

Seven-stage release status workflow:

```
Draft  →  Planned  →  In Progress  →  Testing  →  Approved  →  Released
                                                             ↘  Rolled Back
```

The release metrics header shows counts per stage group: Draft/Planned, Active/Testing/Approved, Released, Rolled Back.

### Release Points

Cards use a horizontal two-column layout (info + slim progress bar on the left, scrollable checklist on the right) and sit in a responsive two-column grid.

**Checklist interactions on the card:**
- Click any item row to toggle it done/undone — scroll position is fully preserved (no full page refresh).
- Click the pencil icon on an item to enter inline edit mode, which shows **Save**, **Cancel**, and **Delete** buttons.

**Adding checklist items in the modal:**
- **Add Item** — inserts one empty row.
- **Bulk Add** — opens a count picker; set how many empty rows you want (`−` / number / `+`) and click **Add Items**.

### Settings

- **Appearance** — choose System / Light / Dark theme; persists across reloads.
- **System overview** — record counts and estimated storage size.
- **Export** — downloads a timestamped JSON file to the `Backup/` folder.
- **Import** — restores from any previously exported JSON file.
- **Clear database** — wipes all SQLite tables after triggering an export.
- **Developer management** — add, edit, and delete developers; link them to projects.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Open global search |
| `Ctrl+Enter` / `Cmd+Enter` | Save the active modal form |
| `Escape` | Close the active modal |

---

## Architecture

```
Chrome toolbar action
        │
        ▼
background.js  (MV3 service worker)
  ├─ Opens a Clair tab on first click
  └─ Focuses the existing tab on subsequent clicks
        │
        ▼
index.html  (static shell)
  ├─ Sidebar navigation + version badge
  ├─ Top bar (search, "+ New" dropdown, action buttons)
  ├─ #mainContent  ◄── all view HTML is rendered here
  └─ Modal layer (forms, detail views, confirmations)
        │
        ▼
app.js  (single-page controller)
  ├─ state {}           in-memory store for all collections
  ├─ storage            thin wrapper → delegates to ClairDB (db.js)
  ├─ render*()          string-template view renderers
  ├─ modal*()           modal open / close / save handlers
  ├─ drag & drop        Kanban column movement
  ├─ search/filter      debounced, per-view
  ├─ import/export      JSON file read/write
  ├─ applyTheme/setTheme  light/dark theme, persisted via ClairDB.setPref
  ├─ initWeeklyChart()  Chart.js bar chart for weekly task completions
  ├─ patchReleasePtCardAfterToggle()  targeted DOM patch (no full re-render)
  ├─ setAppVersion()    reads manifest version, injects into sidebar
  └─ activity           append-only audit log (max 200 entries)
        │
        ▼
db.js  (ClairDB — persistence layer)
  ├─ sql.js (SQLite compiled to WebAssembly, see sql-wasm.js/.wasm)
  ├─ schema: projects/tasks/tests/activity/developers/releases/
  │          testCases/modules/releasePoints + meta (prefs, migration state)
  ├─ migrateFromLegacyStorage()  one-time, transactional, verified, idempotent
  └─ load()/save()/getPref()/setPref()  the only API the rest of the app uses
        │
        ▼
IndexedDB  (durable byte storage for the exported SQLite file)
        ▲
        │ one-time read, on first migration only
chrome.storage.local / localStorage   (legacy data source, cleared after migration)
```

### Design Principles

- **No framework** — vanilla JS, HTML, and CSS only.
- **No build step** — edit files directly; reload the extension to see changes. `sql.js` is vendored as plain script files, same as the other bundled libraries.
- **No network calls** — Google Fonts is the only external request; the app (including the SQLite engine) works fully offline without it.
- **Event delegation** — a single listener on `#mainContent` handles all dynamic card, filter, and board interactions.
- **Targeted DOM updates** — high-frequency interactions (checklist toggle) patch the DOM in place rather than re-rendering the full view, preserving scroll position.
- **SQLite-backed, IndexedDB-durable** — every read/write goes through `ClairDB`; the in-memory `sql.js` database is re-exported to IndexedDB after each save so state survives reloads and restarts.
- **One design system, one set of tokens** — every color, radius, shadow, and spacing value in `style.css` is a CSS custom property, defined once for light mode and once for dark, so the whole UI reflows to a new theme without per-component overrides.

---

## Data Models

### Project

```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "projectType": "web | app",
  "previousVersion": "string",
  "upcomingVersion": "string",
  "androidPreviousVersion": "string",
  "androidUpcomingVersion": "string",
  "iosPreviousVersion": "string",
  "iosUpcomingVersion": "string",
  "statuses": ["string"],
  "clientName": "string",
  "assignedTeam": "string",
  "dueDate": "YYYY-MM-DD",
  "priority": "Critical | High | Medium | Low",
  "overallProjectStatus": "YET_TO_START | ON_GOING | COMPLETED | MONITORING | ON_HOLD",
  "releaseHistory": [{ "version": "string", "platform": "string", "releasedAt": "ISO 8601", "log": "string" }],
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

### Task

```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "tags": ["string"],
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "status": "To-Do | In Progress | Done | On Hold",
  "priority": "Urgent | High | Medium | Low",
  "projectId": "string",
  "developer": "developer id",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

### Insight

```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "developer": "developer id",
  "type": "Issue | Enhancement | Note",
  "status": "In Dev | QA | Done | Known Issue",
  "assignedStatus": "Yet to be assigned | Assigned",
  "projectId": "string",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

### Release

```json
{
  "id": "string",
  "name": "string",
  "version": "string",
  "description": "string",
  "managerName": "string",
  "status": "Draft | Planned | In Progress | Testing | Approved | Released | Rolled Back",
  "workItems": "string",
  "notes": "string",
  "developerIds": ["developer id"],
  "projectId": "string",
  "releaseDate": "YYYY-MM-DD",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

### Developer

```json
{
  "id": "dev-string",
  "name": "string",
  "projectIds": ["project id"]
}
```

### Activity Entry

```json
{
  "id": "string",
  "text": "string",
  "type": "task | project | delete",
  "at": "ISO 8601"
}
```

### Relationships

```
PROJECT ──┬── TASK           (task.projectId)
          ├── INSIGHT         (insight.projectId)
          ├── RELEASE         (release.projectId)
          └── RELEASE POINT   (releasePoint.projectIds[])

DEVELOPER ─┬── PROJECT       (developer.projectIds[])
            ├── TASK          (task.developer)
            ├── INSIGHT       (insight.developer)
            └── RELEASE       (release.developerIds[])
```

---

## File Structure

```
project-extension/
├── manifest.json            Chrome MV3 metadata, permissions, CSP (wasm-unsafe-eval), version (currently 2.3.5)
├── background.js            Service worker — tab lifecycle management
├── index.html               Static shell: sidebar, top bar, modals, form controls
├── app.js                   Single-page controller (~9 100 lines)
├── db.js                    ClairDB — SQLite persistence layer, schema, migration (~220 lines)
├── style.css                Complete stylesheet with CSS custom properties (~7 300 lines)
├── sql-wasm.js              sql.js (SQLite → WebAssembly) loader, vendored
├── sql-wasm.wasm            SQLite compiled to WebAssembly
├── chart.umd.min.js         Bundled Chart.js v4.4.4 (local, no CDN)
├── xlsx.full.min.js         Bundled Excel library for spreadsheet operations
├── exceljs.min.js           Bundled Excel workbook generation library (report export)
├── generate_import_file.js  Dev utility — generates sample test data
├── testcases_to_import.csv  Sample test case CSV for import testing
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── Backup/
│   └── clair-export-YYYY-MM-DD.json   JSON backups created by the export function
└── Reports/
    └── clair-report-YYYY-MM-DD.xlsx   Excel reports created by Settings → Export Report
```

---

## Chrome APIs Used

| API | Purpose |
|---|---|
| `chrome.action.onClicked` | Detects toolbar icon click to open the app tab |
| `chrome.tabs.get / create / update` | Opens the app tab or focuses the existing one |
| `chrome.windows.update` | Brings the Chrome window to the foreground |
| `chrome.tabs.onRemoved` | Clears the stored tab ID when the tab is closed |
| `chrome.storage.local.get / remove` | One-time only: reads legacy pre-SQLite data on first launch after the migration, then clears it once migrated data is verified. No longer used for ongoing persistence. |
| `chrome.downloads.download` | Saves export JSON to the `Backup/` folder |
| `chrome.runtime.getURL` | Resolves the extension-relative `index.html` and `sql-wasm.wasm` URLs |
| `chrome.runtime.getManifest` | Reads the app version for the sidebar badge |
| `indexedDB` (standard Web API, not Chrome-specific) | Durable storage for the exported SQLite database file — the actual ongoing persistence layer, in both extension and standalone modes |

---

## Import & Export

### Exporting

In **Settings**, click **Export Data**. A timestamped JSON file is downloaded to the `Backup/` folder:

```
clair-export-2026-06-20.json
```

The export includes: `projects`, `tasks`, `tests` (insights), `developers`, `releases`, `testCases`, `modules`, `releasePoints`, and `activity`.

### Importing

In **Settings**, click **Import Data** and select a previously exported JSON file. Imported records replace the current state for each collection present in the file.

### Export File Shape

```json
{
  "projects": [...],
  "tasks": [...],
  "tests": [...],
  "developers": [...],
  "releases": [...],
  "testCases": [...],
  "modules": [...],
  "releasePoints": [...],
  "activity": [...]
}
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Toolbar icon does nothing | Extension not loaded or disabled | Reload unpacked extension at `chrome://extensions` |
| Data missing after switching modes | Extension and standalone modes are different origins, so each has its own IndexedDB store | Export from one mode and import in the other |
| `WebAssembly.instantiate` / CSP error in console | `manifest.json`'s CSP is missing `'wasm-unsafe-eval'` | Confirm `content_security_policy.extension_pages` includes `script-src 'self' 'wasm-unsafe-eval'` |
| Data looks reset after updating the extension | Migration only runs once per browser profile, guarded by a `migrated_v1` flag; a genuinely fresh profile has nothing to migrate | Check `Backup/` for a recent export, or verify the pre-update data actually existed in `chrome.storage.local` |
| Developer dropdown is empty | No developers linked to the selected project | Link developers to the project in Settings |
| Release version dropdown is empty | Project has no version fields configured | Edit the project and add previous/upcoming version values |
| Clipboard copy fails | Clipboard API requires a secure context | Use the extension tab (`chrome-extension://`) instead of a plain `file://` page |
| Fonts display as system fallback | Google Fonts request blocked by network | The app is fully functional; only the typeface changes |
| Version shows wrong value | `manifest.json` version not updated | Update the `"version"` field in `manifest.json` and reload the extension |
| Chart does not appear on dashboard | No tasks with a `completedAt` date in selected month | Complete at least one task; or navigate to a month that has completions |

---

## Contributing

Clair follows a no-build, no-framework approach. Keep contributions consistent with that.

1. Edit [index.html](index.html), [style.css](style.css), [app.js](app.js), [db.js](db.js), or [background.js](background.js) directly.
2. Bump the `"version"` field in [manifest.json](manifest.json) for any user-visible change — the sidebar badge updates automatically.
3. Reload the unpacked extension at `chrome://extensions`.
4. Test both **extension mode** and **standalone `index.html` mode** after any storage or persistence change.
5. All persistence goes through `ClairDB` in [db.js](db.js) — don't call `chrome.storage`/`localStorage` directly from `app.js`; add a `ClairDB` method instead. If you add a new collection, add its table to the schema in `ensureSchema()` and to the `TABLES` array.
6. Keep storage shape changes backward-compatible with existing backup files where possible.
7. Update this README when adding views, form fields, storage collections, Chrome permissions, or browser APIs.

**Manual test checklist before submitting:**

- [ ] Extension icon opens Clair and focuses the same tab on a second click.
- [ ] Sidebar footer shows the correct version from `manifest.json`.
- [ ] Projects can be created for both `web` and `app` types, with Client, Team, Due Date, Priority, and Overall Lifecycle Status properly saved.
- [ ] Projects can be toggled between classic List view and 5-column lifecycle Kanban view.
- [ ] Project cards on the Kanban board display all relevant metadata (Client, Team, Due Date, Priority, current status pills, and task progress bars).
- [ ] Project cards can be dragged and dropped between lifecycle columns to update Overall Project Status instantly.
- [ ] Kanban scroll positions (board horizontal scroll and column vertical scrolls) are preserved across re-renders and view switching.
- [ ] Project cards display the correct version boxes (single box for Web, two stacked boxes for App).
- [ ] Tasks move between Kanban columns via drag-and-drop.
- [ ] Developer dropdowns filter to the selected project.
- [ ] Dashboard weekly chart renders for the selected month.
- [ ] Dashboard "Released" section filters correctly when navigating months.
- [ ] Release cards are sorted by release date (most recent first).
- [ ] Release Point checklist toggle preserves scroll position.
- [ ] Inline checklist item delete removes the item without opening the modal.
- [ ] Bulk Add count picker inserts the correct number of empty rows.
- [ ] Export creates a valid JSON backup.
- [ ] Import restores projects, tasks, insights, developers, releases, test cases, and release points.
- [ ] Calendar view correctly renders monthly grid, navigates months, filters tasks, and opens task edit/create modals.
- [ ] Fresh install (empty IndexedDB, no legacy data): app boots, schema is created, mock/backup data loads without errors.
- [ ] Upgrade path: seed legacy `chrome.storage.local` data, load the app, confirm it migrates into SQLite with matching record counts and the legacy keys are cleared.
- [ ] Reloading after migration does not duplicate rows (`migrated_v1` guard) — check via `await ClairDB.load()` in the console.
- [ ] Theme: toggling System / Light / Dark in Settings → Appearance updates the UI immediately and persists across a reload.
- [ ] The "+ New" topbar dropdown opens/closes on trigger click, outside click, and `Escape`, and each item still opens its correct modal.

---

## License

No license file is currently present in this repository. Usage and distribution rights are unspecified. Add a `LICENSE` file before distributing or open-sourcing the project.

---

<div align="center">
Built with vanilla HTML, CSS, and JavaScript — no dependencies, no build step, no server.
</div>
