<div align="center">

# Clair

**A local-first project & release tracker — built as a Chrome Extension**

![Version](https://img.shields.io/badge/version-2.5.0-informational?style=flat-square)
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

### v2.5.0

#### Jira integration (import tickets into Release Points)

- **Settings → Integrations → Jira** — connect your own Jira Cloud site with your Atlassian email and an **API token**. Save verifies the credentials before storing them; **Test Connection** reports the account, workspace, and how many projects you can access; **Disconnect Jira** removes the stored site, email, and token.
- **Link a Clair project to a Jira project** (optional) from the project Create/Edit modal — search your accessible Jira projects, pick one, change or remove it later. Stored on the project as `jira: { site, projectId, projectKey, projectName }`.
- **Import from Jira** in the Release Point editor (shown only when a selected project is linked): search by issue key, issue number, or title; multi-select; load more; then add the selected tickets as checklist items — title = summary, ticket = `https://<site>/browse/KEY`, assignee = Jira display name (also linked to a Clair developer with exactly the same name), plus `jiraKey`/`jiraIssueId`.
- **No duplicates** — tickets already in any Release Point of the same Clair project (including manually entered keys or `/browse/KEY` links) are shown as "Already added" and skipped. The same ticket can still go into a different Clair project.
- **Why API tokens, not OAuth** — Atlassian's OAuth 2.0 (3LO) token exchange requires a client secret, which can't be kept secret inside an extension; it would need a backend. API tokens work with no backend and no app registration. Jira Cloud (`*.atlassian.net`) only; self-hosted Jira Data Center is not supported.
- **Credential storage (be aware)** — the site, email, and token are kept in `chrome.storage.local` (key `jiraConfig`), never in SQLite, so they are never in JSON exports or automatic backups. They are **not encrypted**: anyone with access to your Windows account / Chrome profile could read them. The token is never shown again after saving, never put in the page, and never logged. Revoke it any time at Atlassian.
- **Permission** — `https://*.atlassian.net/*` is an *optional* host permission, requested only when you save a Jira configuration and removed on disconnect.
- Only `summary` and `assignee` are requested from Jira (REST API v3: `/myself`, `/project/search`, `/search/jql`), with pagination, rate-limit retry (`Retry-After`), and readable errors for bad credentials, missing permissions, unreachable sites, and deleted projects.
- Fixes found along the way: checklist item text on Release Point cards is now HTML-escaped (a ticket titled `Fix <br> tag` no longer injects markup), and a background backup status update now refreshes only the Automatic Backup box instead of re-rendering all of Settings (which wiped anything being typed).

### v2.4.0

> An earlier pass of this work included a full visual redesign (indigo/violet accent, a design-token system, a grouped "+ New" topbar dropdown). Those changes never made it into the committed codebase and are **not** present today — the UI is still the original green-accented theme with a flat row of topbar buttons. Everything below this note reflects what's actually in the code.

#### Scheduled automatic JSON backups

- **Daily automatic backup** at a user-chosen local time (default **6:00 PM**), set from **Settings → Data Portability → Automatic Backup**. Files are saved to the same `Backup/` folder as manual exports, named `clair-autobackup-YYYY-MM-DD_HH-mm-ss.json`.
- **Identical format to manual Export** — both use the single JSON builder in [backup.js](backup.js), so the two can't drift apart. Automatic backups import like any other backup.
- **Runs in the background** — scheduled with `chrome.alarms` in the service worker, so it works with the Clair tab closed and survives service-worker termination and browser restarts.
- **Missed runs are caught up once** — if Chrome was closed or the PC was off at the scheduled time, one backup runs when Chrome next starts. A failed backup is reported in Settings and retried at the next scheduled time, never in a loop. Overlapping triggers can't create duplicates.
- **Changing the time behaves sensibly** — moving it to a time that has already passed today (with no backup since) runs one catch-up backup immediately; moving it later just reschedules. The time is applied only when you click **Save**, so partial values while typing can't trigger a backup.
- **Settings shows** enabled/disabled, the schedule, last successful backup (date, time, file name), and Success/Failed with the error message.
- **Read-only data access** — the background reads the last saved SQLite file through a new `ClairDB.loadSnapshot()` that never migrates, writes, or persists, so it can't race with an open Clair tab.
- New permissions: `alarms` (schedule) and `offscreen` (a hidden page builds the backup file — service workers can't create blob URLs, and a full backup is too large for a `data:` URL). Neither shows a permission warning.

#### Projects: Project Details page

- **New Project Details page** for each project, opened with the **Project Details** button on List and Kanban cards. Clicking elsewhere on a List card still opens the existing quick-details modal.
- **Hero header** — type, overall status, priority, client, description, statuses, a task-completion ring, and a strip with team, due date, previous → current version (Android and iOS separately for App projects), created, and last updated. **Edit Project** opens the existing edit modal.
- **Stat strip** — total, completed, in-progress, pending (To-Do), and on-hold tasks; developers; releases; latest release date.
- **Release History** — a dated vertical timeline, newest first, combining Release Management records and versions released from the project card's Release button. Platform (Android/iOS) is shown when the project's own version data identifies it. Release records open the existing release detail modal.
- **Developer Involvement** — per-developer task counts with a completed / in-progress / to-do / on-hold bar; includes developers on the project's tasks or linked to it in Developer Management (developers only on tasks are tagged "tasks only").
- **Project Timeline** — built from task and release dates. The Activity log stores plain text with no project reference, so it isn't used; nothing is guessed or fabricated.
- **Task History** — full-width table with status filters, title/developer search, and rows that open the existing task detail modal.
- **Everything is derived, nothing is stored** — all figures are recalculated from existing records on every render, so task/release/project edits show up immediately. No schema change or migration.
- **Client Name** now also appears on List view cards and in the project detail modal (it was previously only on Kanban cards and in search/reports). Client names are HTML-escaped on Kanban cards.

#### Persistence: chrome.storage.local → SQLite

- **SQLite is now the only persistence layer.** [db.js](db.js) embeds [sql.js](https://github.com/sql-js/sql.js) (SQLite → WebAssembly) and exposes a small `ClairDB` API (`load`, `save`, `getPref`, `setPref`) that the rest of the app talks to — `app.js`'s own `storage.load()` / `storage.save()` now just delegate to it, so no business logic changed.
- **Schema**: one table per collection (`projects`, `tasks`, `tests`, `activity`, `developers`, `releases`, `testCases`, `modules`, `releasePoints`, `noteFolders`, `notes`), each `(seq, id, data, updated_at)` with the full record kept as a JSON blob (so no existing field was ever at risk of being dropped or reshaped) plus an index on `id`. A `meta` table holds schema version, migration status, and user preferences (theme, projects view mode).
- **Automatic one-time migration**: on first load after updating, legacy `chrome.storage.local` (or `localStorage` in standalone mode) data is read, inserted transactionally, row counts are verified against the source, and only then is the legacy data cleared and a `migrated_v1` flag set. Re-running it (e.g. a second reload) is a no-op.
- **Durability**: the live sql.js database is exported to bytes and written to **IndexedDB** after every save, so data survives reloads and browser restarts without depending on `chrome.storage`'s size limits.
- `chrome.storage.local` is now only touched for the one-time legacy read/cleanup — see [Chrome APIs Used](#chrome-apis-used).
- Manifest CSP updated to `script-src 'self' 'wasm-unsafe-eval'` — required for Chrome to compile the sql.js WebAssembly module under Manifest V3.

#### Appearance: light/dark theme

- Light and dark tokens for every color in [style.css](style.css); switchable via **Settings → Appearance** (System / Light / Dark), persisted through `ClairDB.setPref`.
- "System" is resolved in JavaScript (`window.matchMedia`), not via a CSS `prefers-color-scheme` media query — an OS-driven media query would apply dark mode at first paint, before the saved preference has loaded from SQLite, causing a dark-then-light flash. The app now always paints light first and only switches to dark once JS has resolved the real preference.

#### Task tracking improvements

- **Work Done field** — a new free-text field on tasks for logging what was actually done, shown on the Kanban card and in the task detail modal. Existing tasks were backfilled with a placeholder ("task completed") so the field doesn't read as empty; new tasks are left blank until filled in.
- **Date filter reworked twice**, ending on: a **Start Date** range (From/To, both inclusive) replacing the old single-date picker. It intentionally does *not* filter on `createdAt` — a task bulk-logged today for an earlier day is found by the day you're logging *for*, not the day you happened to enter it.
- Typing into the From/To date fields no longer fights you: Chrome fires a `change` event on **every keystroke** of the year segment of a `type="date"` input (each digit briefly forms a zero-padded "complete" date), and reacting to each one by re-rendering was resetting which segment had focus. The filter now debounces those changes (600ms) so a normal typing burst collapses into one update.
- **Weekly task-completion double-counting fixed** — the Dashboard's "Tasks Completed by Week" stat and its Chart.js bar chart both counted a week's tasks using the full Mon–Sun range instead of clamping to the displayed month, so a week straddling two months (e.g. Jul 27–Aug 2) counted the same completed tasks in *both* months' totals. Counting is now clamped identically to the label.
- **Projects can be manually reordered** — drag and drop in the Projects List view moves a project to sit before/after any other project; order persists to SQLite. Previously the display order was just insertion order, so the most recently added project always appeared first with no way to change it.

#### Test Case Management: redesigned

- The horizontal-scrolling project tabs are gone, replaced by a searchable dropdown (top-right) with **"All Projects"** as the first option.
- **Default view is "All Projects"**, showing a card per project (case count, Passed/Failed/Blocked/Untested breakdown, pass-rate bar) instead of a flat table. Selecting a project (via the dropdown or a card) switches to the detailed table view.
- The **Modules** row now sits inline with the project dropdown (same toolbar row) as horizontal pills, and is only shown once a specific project is selected — it no longer takes up space in "All Projects" mode.
- **"Test Pass Rate" split into two cards**: the pass-rate donut/percentage on its own, plus a new **Status Breakdown bar chart** (Passed/Failed/Blocked/Untested, gradient-filled bars with value labels). The old "Automation & Run Status" card was removed to make room.
- **Real pagination** replaces the old "load more on scroll" behavior — a rows-per-page selector (5 / 10 / 25 / 50 / 100 / 150 / All, default 25) plus Prev/Next.
- Hero stats (Total Cases, Passed, Failed, Blocked, Untested, Pass Rate) are now scoped to whatever's selected (a project, a module within it, or everything in "All Projects" mode) instead of always showing global totals.
- **All pre-existing modules were wiped** in a guarded, one-time migration (per an explicit request to reset existing module data) — modules created afterward are unaffected.
- Fixed the Excel/CSV import silently dropping the "Simplified Scenario" column: the column-header matcher checked for the generic substring `"scenario"` before the more specific `"simplified scenario"`, so a "Simplified Scenario" header was always caught by the generic rule first and its data ended up overwriting the main Scenario field instead of populating its own column.

#### Notes Module: Project-based hierarchy & Markdown workspace

- **Project-based hierarchy**: Organize notes per Clair project with a strict **1-level subfolder limitation** (`Project -> Direct Notes` or `Project -> Main Folder -> Subfolder -> Notes`).
- **3-panel UI workspace**: Clean 3-panel split view featuring a left Projects list with note count badges, a middle collapsible Folders & Notes tree with search input, sort dropdown, and `New` dropdown menu, and a right Editor & Preview workspace with breadcrumbs and time-ago timestamps.
- **10-item Markdown toolbar**: Formats text with selection awareness — Bold, Italic, Heading 1, Heading 2, Bullet List, Numbered List, Checklist, Inline Code, Code Block, and Link.
- **Edit / Preview mode switcher**: Switch between editing mode and live preview using a zero-dependency HTML-escaping Markdown parser (`parseMarkdown`).
- **Debounced search & flexible sorting**: Real-time debounced search across note title, note content, project name, and folder name with location path breadcrumb tags. Sort notes by *Recently Updated* (default), *Recently Created*, or *Title A–Z*.
- **Move note modal**: Move notes between project root, main folders, or subfolders via a dedicated dropdown modal.
- **SQLite schema & JSON backup**: Data is stored in SQLite (`noteFolders` and `notes` tables), persisted to IndexedDB, and exported/imported via JSON backup files.

#### Other fixes

- **Search inputs no longer lose focus while typing.** Every debounced page search (Tasks, Project Insights, Release Management, Release Points, Test Case Management, plus the Test Case project-dropdown search) re-renders `#mainContent` on each keystroke, which was destroying and recreating the input element mid-type. A shared `rerenderPreservingFocus()` helper now restores focus (and cursor position, where the input type supports it) immediately after each re-render.
- Release Points grid changed from 3 cards per row to 2, giving the checklist column more room instead of truncating item text/links.
- The Projects List/Kanban toggle handler reacted to *any* `.view-toggle-btn` on the page, which could set the saved view mode to `undefined`; it now only responds to buttons carrying `data-view-mode`.
- Release Point checklist ticket links now show the meaningful part of the URL (e.g. the Jira ticket key `CIMTRACK-482`) instead of a fixed 20-character slice of "hostname + path" that usually cut off mid-domain before reaching anything useful.

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
| **Projects** | Create web and mobile app projects with platform-specific version fields; support custom metadata (Client, Team, Due Date, Priority); toggle between classic 3-column List view and 5-column lifecycle Kanban board view with HTML5 drag-and-drop; manually reorder projects in List view by dragging; search, filter, edit, delete; open a per-project **Project Details** page with stats, developer involvement, release history, timeline, and task history. |
| **Tasks** | 4-column Kanban board (To-Do, In Progress, Done, On Hold); drag cards between columns; visual date alerts for overdue, due-today, and due-tomorrow tasks; assign tasks to developers; log a free-text "Work Done" note per task; filter by a Start Date range (From/To). |
| **Project Insights** | Capture issues, enhancements, and notes per project; track each item through a Dev → QA → Done workflow; filter by developer, status, and assignment state. |
| **Release Management** | Log releases sorted by release date; advance through a seven-stage status workflow (Draft → Released); generate email-style release announcements; copy notes to clipboard. |
| **Release Points** | Compact horizontal cards in a two-column grid; slim progress bar per card; inline delete for checklist items; bulk add with a count picker; scroll-preserving checklist toggle; checklist ticket links show the ticket key, not a truncated URL. |
| **Notes** | Organize notes by project; create main folders and 1-level subfolders; write notes with a 10-item Markdown toolbar & Edit/Preview mode toggle; move notes across project/folder tree; debounced search & sort by updated date, creation date, or title. |
| **Test Case Management** | Enter structured test cases with priority, severity, module, and status; import cases from Excel/CSV; a searchable project dropdown ("All Projects" first, showing per-project summary cards) replaces per-project tabs; inline modules row; pass-rate donut + status-breakdown bar chart; paginated table (configurable rows per page). |
| **Developers** | Maintain a developer registry; link developers to projects so they appear in context-sensitive dropdowns on tasks and insights. |
| **Activity Feed** | Timestamped audit trail of every create, update, delete, move, and copy action (capped at 200 entries). |
| **Data Portability** | Export all collections to a single JSON file; automatic daily JSON backup at a configurable time (default 6:00 PM); restore from any previous export; clear all data after a mandatory backup prompt. Underlying storage is SQLite, but the export/import file shape is unchanged. |
| **Responsive UI** | Sidebar collapses to a hamburger menu on small screens; card grids and Kanban boards reflow for mobile and tablet. |
| **Appearance** | Light and dark themes, resolved in JS (System follows the OS setting, or pin Light/Dark explicitly) from Settings → Appearance; choice persists across reloads. |
| **Global Search** | `Ctrl+K` / `Cmd+K` opens instant search across projects, tasks, and developers from any screen. |
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
| Project Details | `projects` + `state.overviewProjectId` | Per-project page: stats, developers, release history, timeline, tasks |
| Tasks | `tasks` | Kanban board for task execution |
| Project Insights | `tests` | Issue, enhancement, and note board per project |
| Release Management | `releases` | Release lifecycle and note generation (sorted by release date) |
| Release Points | `releasepoints` | Compact checklist cards with bulk add and inline delete |
| Notes | `notes` | Project-based notes & Markdown workspace with 1-level subfolder hierarchy |
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

### Project Details

Opened from the **Project Details** button on any List or Kanban card; the top bar reads "Project Details" and a **Projects** button returns to the list (scroll position restored). Using the sidebar also leaves the page. It is a sub-page of the `projects` view (`state.overviewProjectId`), not a separate nav item.

| Section | Contents |
|---|---|
| Hero | Type, overall status, priority, client, description, statuses, task-completion ring; team, due date, previous → current version (Android/iOS separately for App), created, last updated; **Edit Project** |
| Stat strip | Total / completed / in-progress / pending / on-hold tasks, developers, releases, latest release date |
| Release History | Dated vertical timeline, newest first: Release Management records (click to open) plus versions released from the project card |
| Developer Involvement | Per-developer assigned/completed/in-progress/to-do/on-hold counts with a status bar |
| Project Timeline | Project created/updated, tasks created/completed, releases created/published — from record dates only |
| Task History | Full-width table (title, status, priority, developers, start → end, created, completed, work done) with status filters and search; rows open the task detail modal |

Tasks are matched by `task.projectIds`, so a task linked to several projects counts once for each of them and never appears on unrelated projects. On wide screens Release History sits beside a sidebar (Developer Involvement + Timeline, which scroll inside their cards) with Task History full-width below; on narrower screens everything stacks.

### Tasks — Kanban Board

Four columns: **To-Do** · **In Progress** · **Done** · **On Hold**

- Drag a card between columns to update its status instantly.
- Click the circular check button on a card to mark it **Done**.
- Cards display a coloured date indicator when the end date has passed (overdue), is today, or is tomorrow.
- **Task modal search & dynamic developer filter**:
  - **Checklist Search**: Adding or editing a task features built-in search boxes above the **Project** and **Developer** checklists to quickly filter items without scrolling the checklist container.
  - **Dynamic Developer Filtering**: Selecting a project dynamically filters the developer checklist, displaying only developers who are linked to the selected project(s). If no projects are checked, all developers are displayed.
- **Work Done**: a free-text field for logging what was actually done on a task, shown on the card and in the detail modal.

Filters: project, priority, deadline (overdue / within 3 days / within a week / within 15 days), and a **Start Date range** (From/To, both inclusive — matches `task.startDate`, not when the task was created). Search matches title, description, and developer name.

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

### Test Case Management

- **Project selector**: a searchable dropdown (top-right, "All Projects" listed first) replaces the old horizontal-scrolling project tabs.
- **"All Projects" (default)**: shows a card per project — case count and a Passed/Failed/Blocked/Untested breakdown with a pass-rate bar. Clicking a card (or picking it from the dropdown) drills into that project.
- **A specific project selected**: shows the Modules row (inline, next to the project dropdown, horizontal pills — only present in this mode), two chart cards (pass-rate donut + a Status Breakdown bar chart of Passed/Failed/Blocked/Untested), the filter toolbar (search, run status, priority, type, Import Excel, Bulk Update, Select Cases), and the full test case table.
- **Pagination**: rows-per-page selector (5 / 10 / 25 / 50 / 100 / 150 / All, default 25) with Prev/Next and a "Showing X–Y of Z" indicator, replacing the previous "load 100 more on scroll" behavior.
- **Bulk selection**: "Select Cases" enables checkboxes for multi-select, bulk field updates, and bulk delete.
- **Excel/CSV import**: drag-and-drop or file picker, with column auto-mapping (editable before import) and duplicate detection.

### Settings

- **Appearance** — choose System / Light / Dark theme; persists across reloads.
- **System overview** — record counts and estimated storage size.
- **Export** — downloads a timestamped JSON file to the `Backup/` folder.
- **Automatic Backup** — on/off switch, backup time (picker + **Save**, default 6:00 PM), last successful backup with file name, and Success/Failed status with the error message. See [Automatic Backups](#automatic-backups).
- **Integrations → Jira** — Jira site URL, Atlassian email, API token (masked; blank keeps the saved one), Save Configuration / Test Connection / Disconnect Jira, and the connection status.
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
  ├─ Focuses the existing tab on subsequent clicks
  └─ Scheduled backup: chrome.alarms → offscreen.html builds the file → chrome.downloads
       (settings + status in chrome.storage.local, read by Settings)
        │
        ▼
index.html  (static shell)
  ├─ Sidebar navigation + version badge
  ├─ Top bar (search, Import/Export, one button per create action)
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
  ├─ import/export      JSON file read/write (format from backup.js)
  ├─ renderProjectOverview()  Project Details page, all figures derived per render
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
  │          testCases/modules/releasePoints/noteFolders/notes + meta (prefs, migration state)
  ├─ migrateFromLegacyStorage()  one-time, transactional, verified, idempotent
  ├─ load()/save()/getPref()/setPref()  the only API the rest of the app uses
  └─ loadSnapshot()     read-only copy of the last saved DB, for the background backup
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
  "workDone": "string",
  "tags": ["string"],
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "status": "To-Do | In Progress | Done | On Hold",
  "priority": "Urgent | High | Medium | Low",
  "projectIds": ["project id"],
  "developerIds": ["developer id"],
  "completedDate": "ISO 8601 | null",
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

### Note Folder

```json
{
  "id": "string",
  "projectId": "string",
  "parentId": "string | null",
  "name": "string",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

### Note

```json
{
  "id": "string",
  "projectId": "string",
  "folderId": "string | null",
  "title": "string",
  "content": "string",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

### Relationships

```
PROJECT ──┬── TASK           (task.projectIds[])
          ├── INSIGHT        (insight.projectId)
          ├── RELEASE        (release.projectId)
          ├── RELEASE POINT  (releasePoint.projectIds[])
          ├── NOTE FOLDER    (noteFolder.projectId)
          └── NOTE           (note.projectId)

NOTE FOLDER ──┬── NOTE FOLDER  (subfolder parentId -> main folder id)
              └── NOTE         (note.folderId)

DEVELOPER ─┬── PROJECT       (developer.projectIds[])
            ├── TASK          (task.developerIds[])
            ├── INSIGHT       (insight.developer)
            └── RELEASE       (release.developerIds[])
```

---

## File Structure

```
project-extension/
├── manifest.json            Chrome MV3 metadata, permissions, CSP (wasm-unsafe-eval), version (currently 2.5.0)
├── background.js            Service worker — tab lifecycle + scheduled automatic backup
├── backup.js                Shared JSON backup format, Backup/ folder path, auto-backup filename
├── jira.js                  Jira Cloud client (API token auth): test connection, projects, issue search
├── offscreen.html / .js     Hidden page that builds the auto-backup file (blob URL) for the service worker
├── index.html               Static shell: sidebar, top bar, modals, form controls
├── app.js                   Single-page controller (~12 600 lines)
├── db.js                    ClairDB — SQLite persistence layer, schema, migration, snapshot (~260 lines)
├── style.css                Complete stylesheet with CSS custom properties (~9 900 lines)
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
│   ├── clair-export-YYYY-MM-DD.json                  JSON backups created by manual Export
│   └── clair-autobackup-YYYY-MM-DD_HH-mm-ss.json     JSON backups created by the daily schedule
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
| `chrome.storage.local.get / remove` | One-time: reads legacy pre-SQLite data on first launch after the migration, then clears it once migrated data is verified. |
| `chrome.storage.local.get / set`, `chrome.storage.onChanged` | Automatic-backup settings and status only (`autoBackupEnabled`, `autoBackupTime`, `autoBackupLastAttemptAt`, `autoBackupStatus`, `autoBackupLastSuccessAt`, `autoBackupLastFile`, `autoBackupLastError`, `autoBackupLastFailedAt`). Kept out of SQLite so the service worker never writes to the database file an open Clair tab is saving. |
| `chrome.downloads.download` | Saves manual exports and automatic backups to the `Backup/` folder |
| `chrome.downloads.search / onChanged` | Confirms an automatic backup actually finished before reporting Success |
| `chrome.alarms` | One-shot alarm at the next scheduled backup time, re-armed after each run (`alarms` permission) |
| `chrome.offscreen.createDocument / closeDocument` | Hidden page that builds the backup blob — service workers can't create blob URLs (`offscreen` permission, reason `BLOBS`) |
| `chrome.runtime.getContexts / sendMessage / onMessage` | Detects an existing offscreen page; service worker ↔ offscreen messaging |
| `chrome.runtime.onInstalled / onStartup` | Ensures the backup alarm exists and catches up a missed backup |
| `chrome.runtime.getURL` | Resolves the extension-relative `index.html` and `sql-wasm.wasm` URLs |
| `chrome.permissions.request / contains / remove` | Optional `https://*.atlassian.net/*` host permission — requested when saving a Jira configuration, removed on disconnect |
| `chrome.storage.local` (`jiraConfig`) | Jira site, email, API token, and connected account name — unencrypted, never exported |
| `chrome.runtime.getManifest` | Reads the app version for the sidebar badge |
| `indexedDB` (standard Web API, not Chrome-specific) | Durable storage for the exported SQLite database file — the actual ongoing persistence layer, in both extension and standalone modes |

---

## Import & Export

### Exporting

In **Settings**, click **Export Data**. A timestamped JSON file is downloaded to the `Backup/` folder:

```
clair-export-2026-06-20.json
```

The export includes: `projects`, `tasks`, `tests` (insights), `developers`, `releases`, `testCases`, `modules`, `releasePoints`, `noteFolders`, `notes`, and `activity`.

### Automatic Backups

Clair also backs up automatically once a day, by default at **6:00 PM** local time:

```
Downloads/Extensions/project-extension/Backup/clair-autobackup-2026-11-18_18-00-00.json
```

- **Same file format** as a manual export (both built by [backup.js](backup.js)), so automatic backups import the same way. The folder is relative to the browser's Downloads directory — the same rule manual exports follow.
- **Configure it** in **Settings → Data Portability → Automatic Backup**: turn it on/off, and set the time with the time picker + **Save**. Settings also shows the last successful backup and whether the last run succeeded or failed (with the reason).
- **Runs in the background** — no Clair tab needs to be open. Chrome itself must be running; if it wasn't at the scheduled time, **one** catch-up backup runs when Chrome next starts.
- **No duplicates, no retry loops** — a backup is due only when the last attempt happened before the most recent scheduled time, and the attempt is recorded before it runs. A failure is shown in Settings and retried at the next scheduled time.
- **When the scheduler first becomes active** (install, or reloading after updating to 2.4.0), it runs one backup straight away for the most recent scheduled time, then follows the schedule. On a brand-new install with no data yet, that first run shows *Failed — No saved Clair data found to back up* until data exists.
- **After updating Clair, reload it at `chrome://extensions`.** Refreshing the Clair tab loads the new page but not the new background script or permissions; until the extension is reloaded, Settings shows a "Not active yet" warning and no automatic backup runs.
- **Success means the file exists** — status is set to Success only after Chrome reports the download complete.
- Each automatic backup appears in Chrome's downloads list. Old backups are not deleted automatically (roughly the size of one manual export per day).

How it works: `chrome.alarms` wakes [background.js](background.js) → it opens [offscreen.html](offscreen.html), which reads the last saved database with `ClairDB.loadSnapshot()` (read-only), builds the JSON, and returns a blob URL → the service worker downloads it with `chrome.downloads` and records the result in `chrome.storage.local`.

### Importing

In **Settings**, click **Import Data** and select a previously exported JSON file (manual or automatic). Imported records replace the current state for each collection present in the file.

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
  "noteFolders": [...],
  "notes": [...],
  "activity": [...],
  "exportedAt": "ISO 8601"
}
```

Keys appear in the order defined by `ClairBackup.KEYS` in [backup.js](backup.js) (`projects, tasks, tests, activity, developers, releases, testCases, modules, releasePoints, noteFolders, notes`), followed by `exportedAt`. Missing collections are written as `[]`.

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
| Automatic backup never runs / Settings says "Not active yet" | Extension not reloaded after updating (the tab shows new code, but Chrome still runs the old background script without the `alarms` permission), backups disabled, or Chrome closed at the scheduled time | Reload Clair at `chrome://extensions` — a missed run is then caught up straight away; check Settings → Automatic Backup is enabled |
| Automatic Backup status: "No saved Clair data found to back up" | Clair has never saved any data in this browser profile | Open Clair and add or import data; the next scheduled run will succeed |
| Automatic Backup status: "Download interrupted (…)" | Downloads folder unavailable, disk full, or permissions | Fix the Downloads location/space; the next scheduled run retries (or use manual Export now) |
| Automatic backup ran at an unexpected time | Backup time changed to a time already passed today with no backup since — one catch-up runs immediately by design | Expected; later runs follow the saved time |

---

## Contributing

Clair follows a no-build, no-framework approach. Keep contributions consistent with that.

1. Edit [index.html](index.html), [style.css](style.css), [app.js](app.js), [db.js](db.js), or [background.js](background.js) directly.
2. Bump the `"version"` field in [manifest.json](manifest.json) for any user-visible change — the sidebar badge updates automatically.
3. Reload the unpacked extension at `chrome://extensions`.
4. Test both **extension mode** and **standalone `index.html` mode** after any storage or persistence change.
5. All persistence goes through `ClairDB` in [db.js](db.js) — don't call `chrome.storage`/`localStorage` directly from `app.js`; add a `ClairDB` method instead. If you add a new collection, add its table to the schema in `ensureSchema()` and to the `TABLES` array, **and** to `ClairBackup.KEYS` in [backup.js](backup.js) so exports and automatic backups include it. The one deliberate exception is the automatic-backup settings/status in `chrome.storage.local`, which the service worker must write without touching the SQLite file.
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
- [ ] Import restores projects, tasks, insights, developers, releases, test cases, release points, note folders, and notes.
- [ ] Notes: project selection filters tree view; folder & 1-level subfolder creation works; subfolder limit is strictly enforced; Markdown toolbar formats text correctly; Edit/Preview mode toggle works; search & sorting filter correctly; Move Note updates location; deleting a project cascades to clean up associated notes/folders.
- [ ] Calendar view correctly renders monthly grid, navigates months, filters tasks, and opens task edit/create modals.
- [ ] Fresh install (empty IndexedDB, no legacy data): app boots, schema is created, mock/backup data loads without errors.
- [ ] Upgrade path: seed legacy `chrome.storage.local` data, load the app, confirm it migrates into SQLite with matching record counts and the legacy keys are cleared.
- [ ] Reloading after migration does not duplicate rows (`migrated_v1` guard) — check via `await ClairDB.load()` in the console.
- [ ] Theme: toggling System / Light / Dark in Settings → Appearance updates the UI immediately and persists across a reload; no dark-then-light flash on launch regardless of OS theme.
- [ ] Task Work Done: new tasks start blank; existing (pre-update) tasks show the "task completed" backfill; editing and saving persists it to SQLite and shows on the card and detail modal.
- [ ] Task date range filter: matches `startDate` (not `createdAt`), inclusive on both ends; typing a full date into From/To doesn't jump segments or lose focus.
- [ ] Test Case Management: defaults to "All Projects" cards; selecting a project shows the modules row, both chart cards, and a paginated table; changing rows-per-page and Prev/Next behave correctly; Excel import correctly populates the Simplified Scenario column.
- [ ] Projects List view: dragging a project card reorders the list and persists across reload.
- [ ] Project Details: opens from the **Project Details** button in both List and Kanban views; stats match the project's tasks (tasks linked to multiple projects are counted per project, nothing from other projects); release history is newest first; editing a task/release/project from the page updates it immediately; **Projects** returns to the list; works in light and dark and at phone width.
- [ ] Client Name: create a project with and without a client; it shows on List and Kanban cards, the detail modal, and Project Details; it survives export → import.
- [ ] Jira: Save with a wrong token shows "rejected the email or API token" and stores nothing; a valid token connects and shows the account/workspace; the token field is empty afterwards; link a project, open a Release Point for it, Import from Jira, search/select/add tickets, save — the card shows each key as a link opening Jira in a new tab plus the assignee; importing the same ticket again in that project is blocked; Disconnect removes the credentials; an exported JSON contains no token.
- [ ] Automatic backup: Settings shows Enabled, schedule, last success, and status; saving a new time moves the alarm (`chrome.alarms.get('clair-daily-backup')` in the service worker console); disabling clears it; a backup file appears in `Backup/` and imports successfully; it matches a manual export apart from `exportedAt`.

---

## License

No license file is currently present in this repository. Usage and distribution rights are unspecified. Add a `LICENSE` file before distributing or open-sourcing the project.

---

<div align="center">
Built with vanilla HTML, CSS, and JavaScript — no dependencies, no build step, no server.
</div>
