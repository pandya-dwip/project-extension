<div align="center">

# Clair

**A local-first project & release tracker — built as a Chrome Extension**

![Version](https://img.shields.io/badge/version-2.0.5-informational?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Chrome%20Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Manifest](https://img.shields.io/badge/manifest-V3-success?style=flat-square)
![Stack](https://img.shields.io/badge/stack-Vanilla%20JS%20%2F%20HTML%20%2F%20CSS-F7DF1E?style=flat-square)
![No Build](https://img.shields.io/badge/build-none%20required-lightgrey?style=flat-square)
![Storage](https://img.shields.io/badge/storage-local%20only-blueviolet?style=flat-square)

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

All data lives in `chrome.storage.local` when running as an extension, or falls back to `localStorage` when the page is opened directly in a browser. A JSON export/import flow provides backup and cross-device portability.

The current app version is displayed in the sidebar footer and is always read directly from `manifest.json` — it updates automatically whenever the manifest version is bumped.

**Who it is for:** Individual project coordinators, release managers, or small internal teams who want a lightweight, private, always-available tracker without signing up for anything.

---

## What's New

### v2.0.5

- **Release cards sorted by release date** — cards on the Release Management screen now sort by release date descending (most upcoming first); releases with no date set appear at the end.
- **Release Point card redesign** — compact two-column horizontal layout (info left, checklist right) in a responsive two-column grid. Replaced the SVG progress ring with a slim inline progress bar. Cards now sit 2-per-row on desktop, reducing vertical scrolling.
- **Release Point card actions on hover** — edit and delete buttons float to the top-right of the card and only appear on hover, giving the title full width and eliminating wrapping.
- **Inline checklist item delete** — clicking the pencil icon on a checklist item now shows Save, Cancel, and a **Delete** button in the inline edit form, so items can be removed directly from the card without opening the edit modal.
- **Bulk Add for checklist items** — a **Bulk Add** button in the Release Point modal opens a count picker (`−` / number / `+`). Clicking **Add Items** inserts that many empty rows into the checklist editor at once.
- **No-scroll checklist toggle** — toggling a checklist item done/undone no longer triggers a full page re-render. The card is patched in place (progress bar, item state, completed banner, card class), so scroll position is fully preserved.
- **App version badge** — the current version is now shown at the bottom of the sidebar, read from `manifest.json` automatically in extension mode.

---

## Features

| Area | What you can do |
|---|---|
| **Dashboard** | See live counts for projects, tasks, and insights; review the most common project status; scan recent projects, tasks, and insights at a glance. |
| **Projects** | Create web and mobile app projects with platform-specific version fields; set up to 3 concurrent statuses per project; search, filter, edit, and delete. |
| **Tasks** | Manage a 4-column Kanban board (To-Do, In Progress, Done, On Hold); drag cards between columns; get visual date alerts for overdue, due-today, and due-tomorrow tasks; assign tasks to developers. |
| **Project Insights** | Capture issues, enhancements, and notes against projects; track each item through a Dev → QA → Done workflow; filter by developer, status, and assignment state. |
| **Release Management** | Log releases sorted by release date; advance through a seven-stage status workflow (Draft → Released); generate email-style release announcements; copy notes to clipboard. |
| **Release Points** | Compact horizontal cards in a two-column grid; slim progress bar per card; inline delete for checklist items; bulk add with a count picker; scroll-preserving checklist toggle. |
| **Test Case Management** | Enter structured test cases with priority, severity, module, and status; import cases from CSV; group by module. |
| **Developers** | Maintain a developer registry; link developers to projects so they appear in context-sensitive dropdowns on tasks and insights. |
| **Activity Feed** | Browse a timestamped audit trail of every create, update, delete, move, and copy action (capped at 200 entries). |
| **Data Portability** | Export all collections to a single JSON file; restore from any previous export; clear all data after a mandatory backup prompt. |
| **Responsive UI** | Sidebar collapses to a hamburger menu on small screens; card grids and Kanban boards reflow for mobile and tablet widths. |
| **Global Search** | `Ctrl+K` / `Cmd+K` opens an instant search across projects, tasks, and developers from any screen. |
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
2. Data is stored in `localStorage` under keys prefixed with `clair_`.

> **Note:** Extension mode and standalone mode use separate storage backends. Use the export/import flow if you need to move data between them.

---

## Screens

Clair is a single-page application. Navigation switches the rendered view in place; the browser URL never changes.

| Screen | Internal view key | Purpose |
|---|---|---|
| Dashboard | `dashboard` | Live metrics and recent records overview |
| Projects | `projects` | Project catalog with version and status management |
| Tasks | `tasks` | Kanban board for task execution |
| Project Insights | `tests` | Issue, enhancement, and note board per project |
| Release Management | `releases` | Release lifecycle and note generation (sorted by release date) |
| Release Points | `releasepoints` | Compact checklist cards with bulk add and inline delete |
| Test Cases | `testcases` | Structured test case entry and management |
| Activity | `activity` | Chronological audit feed |
| Settings | `settings` | Export, import, clear data, and developer management |

### Dashboard

Displays four metric cards (projects, tasks, insights, top status) and three lists showing the four most recent projects, five most recent tasks, and five most recent insights. Auto-updates whenever data changes.

### Projects

Supports two project types with different version fields:

- **Web** — single version track: previous release version + upcoming release version.
- **App** — dual platform tracks: Android (previous/upcoming) + iOS (previous/upcoming).

Each project holds up to three concurrent statuses drawn from a fixed list:
`N/A`, `Started`, `Stable`, `Testing`, `Automation`, `On Hold`, `Yet to Start`, `Completed`, `In Progress`, `Blocker`, `Issue Assigned`, `Developer`, `New Development`.

Filters: project status, previous version, upcoming version. Search matches name, description, and both version fields.

### Tasks — Kanban Board

Four columns: **To-Do** · **In Progress** · **Done** · **On Hold**

- Drag a card between columns to update its status instantly.
- Click the circular check button on a card to mark it **Done**.
- Cards display a coloured date indicator when the end date has passed (overdue), is today, or is tomorrow.

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

- **System overview** — record counts and estimated storage size.
- **Export** — downloads a timestamped JSON file to the `Backup/` folder.
- **Import** — restores from any previously exported JSON file.
- **Clear database** — wipes all local data after triggering an export.
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
  ├─ Top bar (search, action buttons)
  ├─ #mainContent  ◄── all view HTML is rendered here
  └─ Modal layer (forms, detail views, confirmations)
        │
        ▼
app.js  (single-page controller)
  ├─ state {}           in-memory store for all collections
  ├─ storage            chrome.storage.local ↔ localStorage bridge
  ├─ render*()          string-template view renderers
  ├─ modal*()           modal open / close / save handlers
  ├─ drag & drop        Kanban column movement
  ├─ search/filter      debounced, per-view
  ├─ import/export      JSON file read/write
  ├─ patchReleasePtCardAfterToggle()  targeted DOM patch (no full re-render)
  ├─ setAppVersion()    reads manifest version, injects into sidebar
  └─ activity           append-only audit log (max 200 entries)
        │
  ┌─────┴──────┐
  ▼            ▼
chrome.storage.local    localStorage
(extension mode)        (standalone mode)
```

### Design Principles

- **No framework** — vanilla JS, HTML, and CSS only.
- **No build step** — edit files directly; reload the extension to see changes.
- **No network calls** — Google Fonts is the only external request; the app works fully offline without it.
- **Event delegation** — a single listener on `#mainContent` handles all dynamic card, filter, and board interactions.
- **Targeted DOM updates** — high-frequency interactions (checklist toggle) patch the DOM in place rather than re-rendering the full view, preserving scroll position.
- **Offline-first** — all CRUD operations write to local storage synchronously.

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
├── manifest.json            Chrome MV3 metadata, permissions, version (currently 2.0.5)
├── background.js            Service worker — tab lifecycle management
├── index.html               Static shell: sidebar, top bar, modals, form controls
├── app.js                   Single-page controller (~7 200 lines)
├── style.css                Complete stylesheet with CSS custom properties (~5 400 lines)
├── xlsx.full.min.js         Bundled Excel library for spreadsheet operations
├── generate_import_file.js  Dev utility — generates sample test data
├── testcases_to_import.csv  Sample test case CSV for import testing
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── Backup/
    └── clair-export-YYYY-MM-DD.json   JSON backups created by the export function
```

---

## Chrome APIs Used

| API | Purpose |
|---|---|
| `chrome.action.onClicked` | Detects toolbar icon click to open the app tab |
| `chrome.tabs.get / create / update` | Opens the app tab or focuses the existing one |
| `chrome.windows.update` | Brings the Chrome window to the foreground |
| `chrome.tabs.onRemoved` | Clears the stored tab ID when the tab is closed |
| `chrome.storage.local.get / set` | Reads and writes all application data |
| `chrome.downloads.download` | Saves export JSON to the `Backup/` folder |
| `chrome.runtime.getURL` | Resolves the extension-relative `index.html` URL |
| `chrome.runtime.getManifest` | Reads the app version for the sidebar badge |

---

## Import & Export

### Exporting

In **Settings**, click **Export Data**. A timestamped JSON file is downloaded to the `Backup/` folder:

```
clair-export-2026-06-20.json
```

The export includes: `projects`, `tasks`, `tests` (insights), `developers`, `testCases`, `modules`, `releasePoints`, and `activity`.

> **Known limitation:** `releases` are currently excluded from export/import. Recreate them manually after a restore, or extend the export/import functions in [app.js](app.js) to include the `releases` collection.

### Importing

In **Settings**, click **Import Data** and select a previously exported JSON file. Imported records replace the current state for each collection present in the file.

### Export File Shape

```json
{
  "projects": [...],
  "tasks": [...],
  "tests": [...],
  "developers": [...],
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
| Data missing after switching modes | Extension and standalone modes use separate storage | Export from one mode and import in the other |
| Releases missing after import | `releases` collection is excluded from export | Recreate releases manually; or extend the export/import code in [app.js](app.js) |
| Developer dropdown is empty | No developers linked to the selected project | Link developers to the project in Settings |
| Release version dropdown is empty | Project has no version fields configured | Edit the project and add previous/upcoming version values |
| Clipboard copy fails | Clipboard API requires a secure context | Use the extension tab (`chrome-extension://`) instead of a plain `file://` page |
| Fonts display as system fallback | Google Fonts request blocked by network | The app is fully functional; only the typeface changes |
| Version shows wrong value | `manifest.json` version not updated | Update the `"version"` field in `manifest.json` and reload the extension |

---

## Contributing

Clair follows a no-build, no-framework approach. Keep contributions consistent with that.

1. Edit [index.html](index.html), [style.css](style.css), [app.js](app.js), or [background.js](background.js) directly.
2. Bump the `"version"` field in [manifest.json](manifest.json) for any user-visible change — the sidebar badge updates automatically.
3. Reload the unpacked extension at `chrome://extensions`.
4. Test both **extension mode** and **standalone `index.html` mode** after any storage or persistence change.
5. Keep storage shape changes backward-compatible with existing backup files where possible.
6. Update this README when adding views, form fields, storage collections, Chrome permissions, or browser APIs.

**Manual test checklist before submitting:**

- [ ] Extension icon opens Clair and focuses the same tab on a second click.
- [ ] Sidebar footer shows the correct version from `manifest.json`.
- [ ] Projects can be created for both `web` and `app` types.
- [ ] Tasks move between Kanban columns via drag-and-drop.
- [ ] Developer dropdowns filter to the selected project.
- [ ] Release cards are sorted by release date (most recent first).
- [ ] Release Point checklist toggle preserves scroll position.
- [ ] Inline checklist item delete removes the item without opening the modal.
- [ ] Bulk Add count picker inserts the correct number of empty rows.
- [ ] Export creates a valid JSON backup.
- [ ] Import restores projects, tasks, insights, developers, test cases, and release points.

---

## License

No license file is currently present in this repository. Usage and distribution rights are unspecified. Add a `LICENSE` file before distributing or open-sourcing the project.

---

<div align="center">
Built with vanilla HTML, CSS, and JavaScript — no dependencies, no build step, no server.
</div>
