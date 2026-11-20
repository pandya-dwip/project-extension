<div align="center">

# Clair

**A local-first project & release tracker — built as a Chrome Extension**

![Version](https://img.shields.io/badge/version-4.3.0-informational?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Chrome%20Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Manifest](https://img.shields.io/badge/manifest-V3-success?style=flat-square)
![Stack](https://img.shields.io/badge/stack-Vanilla%20JS%20%2F%20HTML%20%2F%20CSS-F7DF1E?style=flat-square)
![No Build](https://img.shields.io/badge/build-none%20required-lightgrey?style=flat-square)
![Storage](https://img.shields.io/badge/storage-SQLite%20(sql.js)-blueviolet?style=flat-square)
![Theme](https://img.shields.io/badge/theme-light%20%2F%20dark-333333?style=flat-square)

Track projects, tasks, releases, test cases, and your team — entirely in your browser, with no server required.

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

The UI also supports **light and dark themes** — either following the OS setting automatically, or pinned explicitly from Settings → General (the choice persists in the database).

The current app version is displayed in the sidebar footer and is always read directly from `manifest.json` — it updates automatically whenever the manifest version is bumped.

**Who it is for:** Individual project coordinators, release managers, or small internal teams who want a lightweight, private, always-available tracker without signing up for anything.

---

## What's New

### v4.3.0

#### QA checklist in "Ticket closing" tasks

- Open an automatic QA task and a **QA checklist** lists its tickets (developer, current Jira status) with **Verified & closed** and **Reopen** for each.
- Choosing one opens a comment box filled from a **QA comment template** (editable). Confirming:
  - moves the ticket in Jira — to the project's **Done** status, or back to **Reopen / In Progress** (Jira notifies the developer of the comment);
  - posts the comment (lists and **bold** formatted for Jira);
  - adds a line to the task's **Work Done**, e.g. `✓ CIMTRACK-482 — Verified and closed · 20 Nov 2026, 4:35 pm` or `↺ … — Reopened` with the first line of the comment as the reason.
- If Jira's workflow has no move to Done (or back), Clair says so instead of guessing; if the status changed but the comment failed, it tells you.

#### Auto-complete

- Tickets closed or sent back **directly in Jira** are recognised (via the project's status mapping) when you open the task, click **Refresh from Jira**, refresh the project, use **Sync Now**, or a scheduled sync runs — the Work Done line says "…in Jira".
- When every ticket of a QA task is handled, the task becomes **Done** with today's completion date.

#### QA comment templates

- **Settings → QA workflow** — edit, add, delete or restore the default **Verified** and **Reopen** templates. Placeholders: `{key}`, `{summary}`, `{developer}`, `{project}`, `{date}`.

#### Weekly QA report

- **Weekly QA report** (Jira page → sync card, or search): Monday–Sunday with previous / next / this week; verified, reopened and still-pending tickets, QA tasks created and completed, average time from Ready for QA to verified; per-project breakdown and tables. **Copy for email** (plain text) and **Download CSV**.

#### Global search (Ctrl+K)

- **Ctrl+K** anywhere (or **Search** in the top bar) opens one search box for pages, projects, tasks, Jira tickets (key or summary), test cases, notes, releases, release points and developers. Arrow keys, Enter, Esc. A Jira ticket opens on the Jira page with its panel expanded.

#### Code structure

- The 14,400-line `app.js` is split into **21 files in [`js/`](js/)** (core, jira-page, notifications, qa, search, navigation, dashboard, projects, tasks, insights, dnd, activity, settings, events, modals, releases, release-points, test-cases, notes, excel-report, boot). The code is unchanged — cut at its own section headings and loaded in the original order by `index.html` (classic scripts share one global scope).

#### Fixes

- **QA tasks in the wrong project** — tasks created before assignee routing are moved once to the right Clair project (CIMTrack vs CIMTrack Dashboard), or split per project when their tickets belong to both; recorded outcomes move with their tickets. Each task is checked only once, so a project you set by hand is kept.
- **Task form dropped developers** — the developer list showed only developers linked to the selected project, so saving could silently remove an assigned developer from another project. Developers already on the task now always appear, ticked.

### v4.2.0

#### Project environments & access

- **New optional project fields** (project form → **Environments & access**): **QA URL**, **QA login** (username / email / emp code), **QA password**, and the same three for **Production**. Password fields have a show/hide toggle; a URL without a scheme gets `https://`.
- **Project cards** (List view) show QA and Production as two small cards under the versions: the link, then aligned **User** and **Password** lines with copy buttons, and show/hide for the password.
- **Project Details** has an **Environments & access** card with QA and Production side by side, plus an Edit link.
- Project search also matches the environment URLs and logins.
- Passwords are never written into the page until you click show. They are stored **unencrypted** in Clair's local database and **included in JSON backups** — anyone with a backup file can read them (the form says so).

#### Automatic QA tasks

- **Schedule moved to office hours** — the automatic Jira sync now runs at **9:30 AM, 11:30 AM, 1:30 PM, 3:30 PM and 5:30 PM**; a missed run is caught up only between 9:30 AM and 6 PM. An existing alarm moves to the new time on its own.
- **At most 5 tickets per task** — more new Ready-for-QA tickets in one project are split into further tasks, earliest first, titled "Ticket closing - {project} (1/3)", "(2/3)", …; each part has its own batch id and notification, so duplicate prevention is unchanged.
- **Shared Jira projects are routed by assignee** — when several Clair projects are linked to the same Jira project (e.g. **CIMTrack**, the app, and **CIMTrack Dashboard**, the web software, both on CIMTRACK), each ticket goes to the Clair project its Jira assignee works on (Developers page): Rutvik Panchal → CIMTrack, Sanket Bhimani → CIMTrack Dashboard. A ticket with no assignee, or whose assignee is on none or several of them, goes to the first of those projects in Clair's project order.

#### Comments look right in Jira

- Comments sent from Clair are converted to Jira's document format: `- ` / `* ` bullet lists, `1.` numbered lists, `#` headings, `>` quotes, ` ``` ` code blocks, **bold**, *italic*, `code`, `[text](url)` and bare URLs as links. Underscores inside words (`LONG_ANSWER_STEER_WORDS`) stay as typed; plain lines and blank-line paragraphs work as before.
- Clair's own comment list shows lists with bullets and numbers. The retry check that prevents posting a comment twice compares against the converted text.

#### More notifications

- **New ticket** — "New ticket AAA-4 — Viraj Soni created a Bug: …".
- **Edited comment** — "Viraj Soni edited a comment on AAA-1".
- As before, your own changes are skipped unless **Settings → Notifications → Include my own changes** is on.

### v4.1.0

#### Notifications

A new **Notifications** module tells you what changed in Jira, and when the Jira sync creates a QA task.

- **What you're notified about** — comments ("Viraj Soni commented on AAA-1"), status changes ("AAA-2 moved to Ready for QA"), assignee changes, other field updates (priority, summary, …), and **QA tasks created** by the Jira sync. Your own Jira changes are skipped unless you turn that on.
- **Near real time** — Jira Cloud can only push webhooks to a public server, so the background worker checks your linked Jira projects **every 30 seconds** (`chrome.alarms`, Chrome's minimum period): one search for recently updated tickets across all linked projects, then the history and newest comments of just those tickets. The first check only records a starting point, so old activity doesn't flood in; after sleep or a restart the next check picks up what changed in between.
- **Where it shows** — a **bell** in the top bar and a **Notifications** sidebar item, both with an unread badge; a **Notifications** page grouped by day with filters (All / Unread / Comments / Status changes / Updates / QA tasks), mark read / unread, **Mark all read**, **Clear read**, and **Check now**. A Jira notification opens the ticket; a QA-task notification opens the task.
- **Sound** — a short chime when something arrives (on by default). Browsers only allow sound after one click or keypress in the page, so click once in Clair after opening Chrome.
- **Desktop notifications** — Windows notifications even when Clair is in the background; clicking one brings Clair forward on the Notifications page. Needs the new `notifications` permission.
- **Settings → Notifications** — sound, desktop notifications, each notification type, and "include my own changes".
- Notifications are kept in `chrome.storage.local` (up to 300), not in the SQLite file — so the background worker can add them while Clair is open — and are not part of JSON exports or backups.

#### UI refresh — every page on the same design

- **Top bar** — page title with today's date; only **Import**, **Export** and the **bell** remain. The "Add …" buttons moved to their pages: **New Project** (Projects), **New Task** (Tasks), **New Insight** (Project Insights), **New Release** (Release Management); Test Cases and Release Points already had theirs.
- **Shared page header** (title, stats, completion ring) and **toolbar cards** on Dashboard, Projects, Tasks, Calendar, Notes, Project Insights, Release Management, Developers and Activity.
- **Tasks** — equal-width columns with coloured tops that scroll individually (the Done column no longer makes the page thousands of pixels tall).
- **Projects Kanban** — same board style; compact cards with client · team, up to three statuses, task progress, developer initials, due date (red when overdue) and priority; all five columns fit without sideways scrolling.
- **Calendar** — month stats, a **Today** button, up to two open tasks per day plus one "✓ N done" line, nothing on other-month days; status chips with counts in the side panel.
- **Notes** — header with note and folder stats; panels sized to fit below it.
- **Release Management** — rebuilt: a status pipeline with counts (click a stage to filter), project filter, releases grouped **In flight** / **by month** / **Rolled back** as compact rows (name, status, projects, versions, date, manager, work items, developers) that open the release details.
- **Developers** — header with team stats. **Activity** — a timeline grouped by day with search and type chips.
- **Forms** — every modal restyled (fields, dropdowns, pickers, footer) for light and dark, with section headings in the Task, Project and Release forms.

#### Jira QA tasks

- The generated description now leads with the ticket ("Verify T3-165: Reminder Emails Are Sent…"), says what to do, and lists developer, Ready-for-QA time and link per ticket. Older auto-created tasks with the original generated text are rewritten on load; descriptions you edited are left alone.

#### Fixes

- Dark mode: readable project status pills, calendar days outside the month, the selected day, and the calendar task list.
- Release notes are escaped when shown in the release list.

#### Manifest

- Version **4.1.0**; adds the `notifications` permission (desktop notifications).

### v4.0.0

#### Scheduled Jira sync and automatic QA tasks

Clair now keeps every linked Jira project in sync on a schedule and turns tickets that move to **Ready for QA** into QA work — one consolidated task per project, never duplicated.

**Two ways to sync, one pipeline**

- **Automatic** — every day at **9 AM, 11 AM, 1 PM, 3 PM and 5 PM** (computer's local time), from the background service worker (`chrome.alarms`). One one-shot alarm is kept at the next slot (same name, so never duplicated) and re-armed after each run, on install, update and every worker start. If Chrome was closed at a slot, the most recent missed slot runs once when the worker next starts — only inside the 9:00–18:00 window.
- **Sync Now** — on the Jira page, any time (also outside the scheduled hours).
- Both run the same code ([jiracore.js](jiracore.js)) with the same duplicate prevention. A Web Lock (`navigator.locks`) shared by the page and the worker means runs never overlap. When a Clair tab is open, the worker hands the scheduled run to it (the tab's data stays the single writer); with no tab open, the worker runs it on the saved database.

**What a sync does** (for every linked project)

1. Fetches every ticket (all issue types, full pagination) and refreshes the local Jira cache, keeping the project's status mapping.
2. Reads the **changelog** of every ticket updated since the project's last checkpoint (`GET /rest/api/3/issue/{id}/changelog`, all pages) and finds tickets that **entered** the status mapped to *Ready for QA* — including tickets that entered it and moved on before the sync.
3. Creates **one task per Clair project** with all of that project's new Ready for QA tickets; projects without new tickets get no task.

**The task**

| Field | Value |
|---|---|
| Title | `Ticket closing - {project name}` |
| Project / Status / Priority | the linked Clair project / To-Do / Medium |
| Start → End | earliest Ready for QA entry in the batch → two days later |
| Tag | `Auto Task Creation` |
| Developers | Jira assignees matched to Clair developers by name (same rule as Release Point imports); none matched → no developer, task still created |
| Description | per ticket: key, title, assignee, when it entered Ready for QA, Jira link |

**Duplicate prevention** (new SQLite table `jiraQa`)

- **Checkpoint per project** — the next sync only looks at changes after it (with a 10-minute overlap for clock skew; overlaps are filtered out). The first sync of a project starts from the beginning of that day.
- **Processed tickets** — a ticket that has produced a QA task never produces another, even if it re-enters Ready for QA or the sync is repeated (manual or scheduled, in any order, across restarts).
- **Batch id** — each task carries a stable id derived from its project and tickets (`task.autoQa`), checked before creating.
- A task and the records that mark its tickets processed are saved in the same database write. If a project fails (Jira error, network), its checkpoint does not move; the other projects still complete, and the next sync retries only what failed.

**Results** — the Jira page shows the last run: scheduled or manual, projects synced, tickets fetched, new Ready for QA tickets, tasks created (and for which projects), already-processed tickets skipped, failures to retry, the last fully successful run, and the next scheduled time. A run with failures is shown as "completed with failures", never as success.

#### Fixes

- **Changes from another tab or the background are picked up** — when another context saved, an open Clair page "reloaded" from its own in-memory copy of the database and missed the change. Pages now re-read the saved database (`ClairDB.reload()`), which waits for the page's own in-flight saves.
- Ticket table: the whole row opens the ticket panel; the key is plain text (the ↗ icon opens Jira); a # column; newest tickets first by default. Comments show pasted links (Jira smart links) and attachments as one chip.

#### Manifest

- Version **4.0.0** (major: background Jira sync that creates tasks, new SQLite table, shared `jiracore.js` loaded by the service worker); description mentions Jira sync and automatic QA tasks.

> **Limitations** — scheduled runs need Chrome to be running; only the most recent missed slot is caught up. Tickets that reached Ready for QA before a project's first sync day are not turned into tasks. Clair saves the whole database at once, so the background run happens only when no Clair tab is open.

### v3.1.0

#### Jira two-way sync: change status and comment from Clair

On the Jira page's details view, click a ticket's summary to open its panel (under the row):

- **Change status** — the dropdown lists only the transitions Jira currently allows *you* on *that* ticket (`GET /rest/api/3/issue/{key}/transitions`); nothing about workflows is hard-coded. The choice is a pending change until you sync.
- **Comments** — all existing comments with author, created and edited time (`GET …/comment`, every page). Write a comment (multi-line supported) and add it to the pending changes.
- **Pending changes** — the panel shows "N changes not yet applied to Jira", the selected status and the queued comments (removable); the table marks the ticket **Pending**. Nothing is sent and the ticket cache is not changed until **Sync to Jira**. Pending changes are saved (new SQLite table `jiraPending`), so they survive navigation and reloads; they are not part of JSON exports or backups.
- **Sync to Jira** — runs the transition (`POST …/transitions`), then the comments one by one (`POST …/comment`, text converted to Atlassian Document Format), then re-fetches the ticket (`GET /rest/api/3/issue/{key}`) into the cache and reloads comments and transitions. Category counts update through the project's status mapping.
- **Partial failure** — each change is cleared and saved as soon as Jira confirms it, so a retry never repeats a step that already succeeded. The result says exactly what happened, e.g. "Status changed to “Ready for QA”. The comment was not sent: … Unsent changes are kept — click Sync to Jira to retry them."
- **No duplicates** — before a transition, Clair checks whether the ticket is already in the target status; before re-sending a comment whose earlier attempt may have reached Jira, it looks for the same text among the ticket's recent comments. One sync per ticket at a time.
- Errors (expired token, missing permission, transition not valid, network, rate limits) use the existing Jira error handling and retry; the token is never shown, cached, logged or exported.
- `jira.js`: the request helper now accepts empty `204 No Content` responses (returned by transitions).

> Transitions that require extra fields on a Jira screen (for example a resolution) are rejected by Jira; Clair shows Jira's message and keeps the change pending — those fields can't be filled in from Clair.

### v3.0.0

#### Jira page: a ticket dashboard for every linked project

A new **Jira** module in the sidebar (under Release) shows the tickets of every Clair project that is linked to a Jira project. It reuses the existing Jira connection (Settings → Integrations) and project links; nothing new to set up.

- **Overview** — one card per linked project: Clair project name, Jira key and name, total tickets, a coloured status bar, category counts, last synchronized date and time, **Refresh** and **View Details**. A banner sums all linked projects; **Refresh all from Jira** syncs them one after another. Projects without a Jira link are not shown.
- **Details page** — totals per category; a ticket table (Key, Summary, Type, Jira status, Category, Assignee, Priority, Updated, and an open-in-Jira action — the key also opens the ticket in a new tab); search by key or summary; filter by category, issue type, and assignee (including Unassigned); sort by recently/least recently updated, priority, or key; 25 / 50 / 100 rows per page. **The totals and category chips follow the search, type, and assignee filters** ("Matching tickets (of 727)").
- **All tickets** — every issue type, Epics and Sub-tasks included, via `POST /rest/api/3/search/jql` (`project = KEY ORDER BY updated DESC`, fields `summary, status, assignee, issuetype, priority, created, updated`), following `nextPageToken` until the last page. Duplicates across pages are dropped; `429` responses wait for `Retry-After`; if Jira rejects the POST with an XSRF check, the equivalent GET is used.

#### Status mapping

Jira status names differ between projects, so each linked project has its own mapping from Jira statuses to Clair categories:

**To Do · Reopen · In Progress · In Review · Ready for QA · Monitoring · On Hold · Done · Not Applicable · Will Not Do / Not a Bug**

- **Automatic** — common names are recognised, ignoring case and punctuation (`Reopened`, `IN QA`, `ON HOLD`, `Code Review`, `N/A`, `Won't Do`…), including several names joined by `/` when they agree (`WILL NOT DO/NOT A BUG`, `Done/Closed`) and a known phrase inside a longer name (`Blocked by vendor` → On Hold). Conflicting (`Done/To Do`) or negated (`Not Done`) names are left for you to decide.
- **Unmapped** — a status that isn't recognised shows as **Unmapped** (red), is counted in the total, and is never silently put in another category. Cards show "N tickets with unmapped statuses — map them".
- **Status mapping panel** (details page) — lists the project's Jira statuses (from `/rest/api/3/project/{key}/statuses`, plus any seen on tickets) with their Jira category and ticket count; pick a category per status or leave it on Automatic. **Reset all to Automatic** clears manual choices.
- **Every refresh re-applies automatic mapping**; real manual choices are kept, choices for statuses that no longer exist are dropped. "Unmapped" is no longer a selectable choice (it could pin a status to Unmapped and hide the automatic match).
- Cards and the banner always show To Do, In Progress, Ready for QA and Done, plus any other category that has tickets; the details page shows all of them.

#### Sync and caching

- Tickets are cached locally in a new SQLite table, **`jiraSync`** (one record per linked Clair project: issues, the project's statuses, the status mapping, last sync, last error), so the page opens instantly and works offline.
- **Refresh from Jira** (overview and details) replaces the cache **only after every page was fetched** — new tickets are added, changed ones updated, deleted ones removed. If a refresh fails part-way, the previous cache and its last-synced time are kept and the page says "Last refresh failed … — showing the previous sync". One refresh per project at a time; a progress counter shows while fetching.
- If a Clair project is linked to a different Jira project, the old cache is ignored.

#### Safety

- The cache is **not** part of JSON exports or automatic backups (`ClairBackup.KEYS` is unchanged), and importing a backup does not touch it.
- No API token in the page, the cache, logs, or backups — credentials stay in `chrome.storage.local` as before.
- Release Points are never changed and tickets are never imported automatically; importing into a Release Point still works from the Release Point editor.

#### Manifest

- Version **3.0.0** (major release: new module and a new SQLite table); description mentions the Jira dashboard.

### v2.6.0

#### UI redesign: Dashboard, Release Points, Settings, Test Case Management

- **Dashboard → Recent Tasks** — a status bar with Done / In Progress / To-Do / On Hold counts, a **Needs attention** list (overdue and due within 3 days, labelled "22 days overdue", "Due tomorrow", …) and **Recently completed**. Rows open the task.
- **Dashboard → Test Cases by Project** — overall pass rate with a results bar and legend, then one row per project (results bar, pass % coloured by health, red "N failed" badge, total). Rows open the project in Test Case Management.
- **Dashboard → Active Releases & Plans** — release stage pipeline (Draft → Released), **In flight** releases with their release points nested underneath (see the fix below), and **Recently shipped**.
- **Release Points → accordion** — the cards are replaced by a collapsible list grouped into **In progress** and **Completed**. Each row shows a progress ring, title, projects, type, versions, the release it belongs to, assignees, and last update; expanding it shows the full checklist (no truncation). Ticking an item updates progress in place, and checklist rows work from the keyboard (Space/Enter). Project filter chips with done/total counts, **Expand all / Collapse all**, and search that also looks inside checklist items (matches open automatically). Incomplete and newly saved release points start expanded.
- **Settings → section menu** — a two-pane layout: **General** (theme cards with previews, default startup module), **Modules**, **Data & Backups** (export/import/report, automatic backup, storage stats), **Integrations** (Jira), **Danger Zone**. Arrow keys move between sections; on phones the menu becomes a horizontal tab strip. All existing controls keep their behaviour.
- **Test Case Management → three levels**:
  1. **Home** — totals and pass rate, project cards (pass-rate ring, cases/modules/last run, results bar, failing or all-passing badge), projects without tests in a compact strip; search and sort (most cases, most failures, lowest pass rate, name).
  2. **Project overview** — KPI strip, results donut, breakdowns by priority / type / assignee, a modules table (results bar, pass %, failures; rename, delete, add), and **Open failures**. **Open test scenarios →** goes to level 3.
  3. **Test scenarios** — module rail, status chips with live counts, priority/type filters, search, selection mode, and a slimmer table (ID, scenario with module and simplified scenario, status, priority, assignee, executed date). Click a row to expand it and edit Module, Severity, Type, Defect ID, and the long text fields — edits still save automatically. Pagination, Import Excel, Bulk Update, and Add Test Case are unchanged.

#### Fixes

- **Release point versions shown twice** — a release point displayed its linked release's version (`v1.7.0`) *and* its own ticked versions, which are stored as the form's labels (`v1.7.0 (Up)`), so ticking the upcoming version showed both. Versions are now shown once, without the stale "(Up)/(Prev)" suffix; a platform label ("Android v1.7.3") wins over a bare one. Stored data is unchanged.
- **Which release point belongs to which release** — the Dashboard listed releases and release points as one flat list. They are now grouped: a release point belongs to its **Linked Release**, or — if none is set — to a release of the same project that includes one of its versions (marked "matched by version" / dashed tag). Remaining open release points are listed as "not linked to a release".
- **Linked Release dropdown** — now lists releases where the selected project isn't the release's first project, and no longer shows "(undefined)" for multi-version releases.
- **Test cases** — non-date text in an execution date no longer shows as "Invalid Date"; in selection mode, clicking a scenario title selects the row instead of expanding it; module checkboxes in selection mode, which never had any effect, were removed.
- Release point checklist text and ticket titles are HTML-escaped.

#### Manifest

- Version 2.6.0, a clearer description, `short_name`, and `minimum_chrome_version: 116` (the automatic backup uses `chrome.runtime.getContexts`, available from Chrome 116).

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
| **Dashboard** | Live counts for projects, tasks, insights, releases, and release points; weekly task completion chart; released projects by month; Recent Tasks (status mix, needs attention, recently completed); Test Cases by Project; Active Releases & Plans (stage pipeline, in-flight releases with their release points, recently shipped). |
| **Projects** | Create web and mobile app projects with platform-specific version fields; support custom metadata (Client, Team, Due Date, Priority); toggle between classic 3-column List view and 5-column lifecycle Kanban board view with HTML5 drag-and-drop; manually reorder projects in List view by dragging; search, filter, edit, delete; open a per-project **Project Details** page with stats, developer involvement, release history, timeline, and task history.; optional QA and Production URL, login and password per project, shown on the project card and on Project Details. |
| **Tasks** | 4-column Kanban board (To-Do, In Progress, Done, On Hold) with columns that scroll individually; drag cards between columns; visual date alerts for overdue, due-today, and due-tomorrow tasks; assign tasks to developers; log a free-text "Work Done" note per task; filter by a Start Date range (From/To); **New Task** in the toolbar.; automatic "Ticket closing" tasks have a QA checklist (Verified & closed / Reopen in Jira, Work Done filled in, auto-complete). |
| **Project Insights** | Capture issues, enhancements, and notes per project; track each item through a Dev → QA → Done workflow; filter by developer, status, and assignment state. |
| **Release Management** | Status pipeline with counts (click a stage to filter), search and project filter; releases grouped In flight / by month / Rolled back as compact rows that open the release details; seven-stage workflow (Draft → Released); email-style release notes, copied to the clipboard; **New Release** in the toolbar. |
| **Release Points** | Accordion list grouped into In progress / Completed; progress ring and bar per release point; full checklist on expand with in-place, keyboard-accessible ticking; project filter chips, Expand/Collapse all, search inside checklist items; shows the release each point belongs to; bulk add and bulk assign in the editor; import Jira tickets as checklist items; ticket links show the ticket key. |
| **Jira** | Dashboard of every Clair project linked to Jira: per-project cards with ticket counts by category and last sync; a details page with a searchable, filterable, sortable, paginated ticket table (counts follow the filters); per-project status mapping into 10 Clair categories with automatic matching; local cache refreshed on demand and kept if a refresh fails; change a ticket's status and add comments, queued as pending changes and sent with **Sync to Jira**; scheduled sync (9 AM–5 PM) and **Sync Now** create one "Ticket closing" QA task per project for tickets that moved to Ready for QA, never duplicated. |
| **Notes** | Organize notes by project; create main folders and 1-level subfolders; write notes with a 10-item Markdown toolbar & Edit/Preview mode toggle; move notes across project/folder tree; debounced search & sort by updated date, creation date, or title. |
| **Test Case Management** | Three levels: a home page of project cards with pass rates; a project overview with KPIs, results donut, priority/type/assignee breakdowns, modules table, and open failures; and a test scenarios page with a module rail, status chips, filters, expandable rows with autosaving fields, bulk selection, and pagination. Import cases from Excel/CSV; bulk update. |
| **Developers** | Developer registry with team stats (on projects, not assigned, open tasks, projects staffed); link developers to projects so they appear in context-sensitive dropdowns on tasks and insights. |
| **Activity Feed** | Timeline of every create, update, delete, move, and copy action, grouped by day, with search and Tasks / Projects / Deletions filters (last 200 entries). |
| **Notifications** | Jira comments, status changes, assignee and field updates in linked projects (checked every 30 seconds) and QA tasks created by the Jira sync; bell and sidebar badge, sound, desktop notifications, Notifications page with filters and read / unread. |
| **Data Portability** | Export all collections to a single JSON file; automatic daily JSON backup at a configurable time (default 6:00 PM); restore from any previous export; clear all data after a mandatory backup prompt. Underlying storage is SQLite, but the export/import file shape is unchanged. |
| **Responsive UI** | Sidebar collapses to a hamburger menu on small screens; card grids and Kanban boards reflow for mobile and tablet. |
| **Settings** | Section menu (General, Modules, Data & Backups, Integrations, Notifications, Danger Zone): theme, default startup module, sidebar module visibility, backup/import/report, automatic backup, storage stats, Jira connection, notification sound / desktop / types, clear database. |
| **Appearance** | Light and dark themes, resolved in JS (System follows the OS setting, or pin Light/Dark explicitly) from Settings → General; choice persists across reloads. |
| **Global Search** | `Ctrl+K` / `Cmd+K` (or **Search** in the top bar) finds pages, projects, tasks, Jira tickets, test cases, notes, releases, release points and developers; arrow keys + Enter. |
| **Weekly QA report** | Verified / reopened / pending tickets, QA tasks created and completed, average time to verify, by project; copy for email or download CSV. |
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
| Dashboard | `dashboard` | Live metrics, weekly chart, released projects, recent tasks, test cases, and releases in flight |
| Projects | `projects` | Project catalog with 3-column cards, version boxes, and release actions |
| Project Details | `projects` + `state.overviewProjectId` | Per-project page: stats, developers, release history, timeline, tasks |
| Tasks | `tasks` | Kanban board for task execution |
| Project Insights | `tests` | Issue, enhancement, and note board per project |
| Release Management | `releases` | Release lifecycle and note generation (sorted by release date) |
| Release Points | `releasepoints` | Accordion of release readiness checklists, grouped by In progress / Completed |
| Jira | `jira` + `state.jiraProjectId` | Linked projects overview → per-project ticket table and status mapping |
| Notes | `notes` | Project-based notes & Markdown workspace with 1-level subfolder hierarchy |
| Test Cases | `testcases` + `state.activeTestCaseProjectId` / `state.tcPage` | Home (all projects) → project overview → test scenarios |
| Notifications | `notifications` | Jira change and QA-task notifications, grouped by day |
| Weekly QA report | `qareport` + `state.qaReportWeek` | QA outcomes of a week (opened from the Jira page or search) |
| Activity | `activity` | Day-grouped audit timeline with search and type filters |
| Settings | `settings` + `state.settingsSection` | General, Modules, Data & Backups, Integrations, Notifications, Danger Zone |

### Dashboard

A hero with live counts, then:

- **Released** — releases shipped in the selected month (month navigation).
- **Charts & Metrics** — tasks completed per week of the selected month.
- **Recent Tasks** — status bar and counts; **Needs attention** (open tasks overdue or due within 3 days, with "N days overdue" / "Due tomorrow" labels); **Recently completed**. Rows open the task.
- **Test Cases by Project** — overall pass rate and one row per project (results bar, pass %, failed badge, total); rows open that project in Test Case Management.
- **Active Releases & Plans** — stage pipeline; **In flight**: each release at Planned / In Progress / Testing / Approved (or with open checklist work) with its release points nested and their progress; open release points with no release under "not linked to a release"; **Recently shipped**.

A release point belongs to a release through its **Linked Release** field; when that isn't set, it is matched to a release of the same project that includes one of its versions and labelled "matched by version". Everything updates whenever data changes.

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

An **Environments & access** card (above Release History) shows the project's QA and Production URL, login and password (masked; show and copy buttons), with an Edit link. Empty until those fields are filled in the project form.

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

- **Header** — total, in flight, released, rolled back, and a released ring.
- **Status pipeline** — Draft → Planned → In Progress → Testing → Approved → Released, plus Rolled Back, each with its count; click a stage to filter, click again to clear.
- **Toolbar** — search (name, version, project, work items, manager, description), project filter, Clear, result count, **New Release**.
- **List** — **In flight** first, then released releases **by month** (newest first), then **Rolled back**. Each row: name and status, projects and versions, a one-line description, released / target date, manager, work items, developer initials, and icons to copy the release-notes email, edit, and delete. Click a row (or press Enter) to open the release details.

```
Draft  →  Planned  →  In Progress  →  Testing  →  Approved  →  Released
                                                             ↘  Rolled Back
```

### Notifications

The bell (top bar) and the **Notifications** sidebar item show the unread count. The page lists notifications grouped by day — Today, Yesterday, then dates — with filters (All, Unread, Comments, Status changes, Updates, QA tasks), per-item read / unread, **Mark all read**, **Clear read**, **Check now** and a link to the settings. A Jira notification opens the ticket in a new tab; a QA-task notification opens the task.

Clair checks every linked Jira project every 30 seconds while Chrome is running (see [v4.1.0](#v410)); it needs a Jira connection and at least one Clair project linked to a Jira project.

### Release Points

An accordion list: a compact header (totals, in progress, completed, upcoming, overall checks ring), a toolbar (search, type, status, Expand all / Collapse all, **New Release Point**), project filter chips with done/total counts, then two groups — **In progress** and **Completed**.

Each collapsed row shows the progress ring, title, projects, Upcoming/Released, versions (each once), the release it belongs to (solid tag = Linked Release, dashed tag = matched by version), a progress bar, assignee avatars, and last update; edit and delete sit on the right. Incomplete and newly saved release points start expanded, and the open/closed state survives re-renders.

**Checklist interactions (expanded row):**
- Click an item — or focus it and press Space/Enter — to toggle it done/undone. Progress updates in place; the row stays where it is until the next render.
- Click the pencil icon on an item for inline edit (**Save** / **Cancel**).
- Search also matches checklist text, tickets, and Jira keys, and opens the matching release points.

**Adding checklist items in the modal:**
- **Add Item** — inserts one empty row.
- **Bulk Add** — opens a count picker; set how many empty rows you want (`−` / number / `+`) and click **Add Items**.

### Jira

Requires a Jira connection (Settings → Integrations) and at least one project linked to a Jira project (project Edit form → Jira Project).

- **Overview** — a banner with totals across linked projects and a card per project (name, Jira key and name, total, status bar, category tiles, unmapped notice, last synced / last failed refresh, **Refresh**, **View Details**). **Refresh all from Jira** syncs every linked project in turn.
- **Details** (breadcrumb Jira / Project) — header with **Open in Jira**, **Status mapping**, and **Refresh from Jira**; category tiles; search, issue type, assignee, and sort controls; category chips; the ticket table; rows per page and Prev/Next. Totals and chips reflect the search/type/assignee filters.
- **Status mapping** — one row per Jira status: name, Jira's own category, ticket count, and a dropdown (**Automatic — *category*** or a fixed category). Saved per linked project; **Reset all to Automatic** clears manual choices.

- **Jira sync & QA tasks** card — **Sync Now**, the schedule (9:30 AM–5:30 PM, every two hours) with the next run, and the last run's results. See [v4.0.0](#v400).
- **Ticket table** — # column, newest tickets first by default; click anywhere on a row to open its panel (the ↗ icon opens Jira).
- **Ticket panel** — click a ticket row: current Jira status, **Change status** (available transitions only), comments, a comment box, pending changes, and **Sync to Jira** with the result. See [v3.1.0](#v310).

Nothing is fetched until you press Refresh; the page shows the last successful sync and says so when a later refresh failed.

### Test Case Management

Three levels, with a breadcrumb (Test Cases / Project / Test scenarios) to move back up:

1. **Home** — totals (total, passed, failed, blocked, untested) and overall pass rate; a card per project with test cases (pass-rate ring, cases, modules, last run, results bar, "N failing" / "All passing"); projects without test cases in a compact "No test cases yet" strip. Search projects and sort by most cases, most failures, lowest pass rate, or name. Import Excel and Add Test Case are available here too.
2. **Project overview** — KPIs (cases, passed, failed, blocked, untested, pass rate, automated %), a results donut, breakdowns by priority, type, and assignee, a **Modules** table (results bar, pass %, failures; click a module to see its scenarios; rename/delete; Add Module), and **Open failures** (failed and blocked cases with defect keys; "View all in scenarios"). **Open test scenarios →** goes to level 3.
3. **Test scenarios** — a module rail (All cases, each module, counts, add/rename/delete), search, status chips with live counts, priority and type filters, and the table: ID, scenario (module and simplified scenario underneath), status, priority, assignee, executed date. Failed/blocked rows are edged red/amber. **Click a row to expand it** and edit Module, Severity, Type, Defect ID, Scenario, Simplified scenario, Description, Steps, Expected, Actual, and Comments — every field saves automatically. The eye icon opens the details popup.

- **Pagination**: rows per page (5 / 10 / 25 / 50 / 100 / 150 / All, default 25) with Prev/Next.
- **Selection**: "Select cases" switches row clicks to selecting; Select all (filtered), Clear, Delete selected.
- **Excel/CSV import**: drag-and-drop or file picker, with column auto-mapping (editable before import) and duplicate detection. **Bulk Update** edits fields across many cases.

### Settings

A section menu on the left (arrow keys move between sections; a horizontal tab strip on phones) and one section at a time on the right:

- **General** — theme cards with previews (System / Light / Dark); default startup module.
- **Modules** — show or hide each sidebar module (hidden modules keep their data; Settings is always on).
- **Data & Backups** — Export backup (timestamped JSON to the `Backup/` folder), Import backup, Excel report; **Automatic backup** (on/off, backup time with **Save**, last successful backup, Success/Failed with the reason — see [Automatic Backups](#automatic-backups)); storage counts and data size.
- **Integrations** — **Jira Cloud**: site URL, Atlassian email, API token (masked; blank keeps the saved one), Save Configuration / Test Connection / Disconnect Jira, and the connection status.
- **QA workflow** — QA comment templates (Verified / Reopen) used by the QA checklist; placeholders `{key}`, `{summary}`, `{developer}`, `{project}`, `{date}`.
- **Notifications** — Sound (with a Play button to test it), Desktop notifications, and which events to notify about: comments, status changes, other updates, QA tasks created, and your own changes (off by default).
- **Danger Zone** — Clear database (all SQLite tables, after exporting a backup first).

Developers are managed on the **Developers** page.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Open global search |
| `Ctrl+Enter` / `Cmd+Enter` | Save the active modal form |
| `Escape` | Close the active modal |
| `Space` / `Enter` | On a focused Release Point checklist item: tick / untick it |
| `Enter` / `Space` | On a focused module in the Test scenarios rail: show that module |
| `↑` / `↓` / `Home` / `End` | In the Settings section menu: move between sections |

---

## Architecture

```
Chrome toolbar action
        │
        ▼
background.js  (MV3 service worker)
  ├─ Opens a Clair tab on first click
  ├─ Focuses the existing tab on subsequent clicks
  ├─ Scheduled backup: chrome.alarms → offscreen.html builds the file → chrome.downloads
  └─ Scheduled Jira sync: chrome.alarms (9:30/11:30/13:30/15:30/17:30) → open Clair tab runs it, or the worker
     runs jiracore.js on the saved database (ClairDB.reload → load → save)
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
js/*.js  (single-page controller — 21 classic scripts, loaded in order, one global scope)
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
  │          testCases/modules/releasePoints/noteFolders/notes/jiraSync + meta (prefs, migration state)
  │          (jiraSync = local Jira ticket cache, jiraPending = unsynced status/comment changes,
  │           jiraQa = sync checkpoints, processed Ready for QA tickets, task batches, run log;
  │           none of them is part of JSON export/backup)
  └─ (notifications live in chrome.storage.local — clairNotifications, clairNotifySettings,
      clairJiraWatch, clairJiraWatchProjects — so the worker can add them while a page is open)
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
  "qaUrl": "string", "qaUser": "string", "qaPassword": "string (plain text)",
  "prodUrl": "string", "prodUser": "string", "prodPassword": "string (plain text)",
  "jira": { "site": "string", "projectId": "string", "projectKey": "string", "projectName": "string" },
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
├── manifest.json            Chrome MV3 metadata, permissions, CSP (wasm-unsafe-eval), version (currently 4.3.0)
├── background.js            Service worker — tab lifecycle, scheduled automatic backup, scheduled Jira sync
├── backup.js                Shared JSON backup format, Backup/ folder path, auto-backup filename
├── jira.js                  Jira Cloud client (API token auth): test connection, projects, issue search, full issue fetch, project statuses, transitions, comments (ADF), changelog
├── jiracore.js              Shared by page + service worker: status categories/auto-mapping, Jira sync + automatic QA task pipeline, schedule slots
├── offscreen.html / .js     Hidden page that builds the auto-backup file (blob URL) for the service worker
├── index.html               Static shell: sidebar, top bar, modals, form controls
├── js/                      Single-page controller, split by area (loaded in this order by index.html):
│   ├── core.js              Constants, state, storage, theme, utilities, import/export, toasts
│   ├── excel-report.js      Excel report export
│   ├── jira-page.js         Jira page: dashboard, Sync Now card, ticket panel
│   ├── notifications.js     Notifications page, bell, sound, settings
│   ├── qa.js                QA checklist, QA comment templates, weekly QA report
│   ├── search.js            Global search (Ctrl+K)
│   ├── navigation.js        Navigation, render dispatcher, shared page header
│   ├── dashboard.js         Dashboard
│   ├── projects.js          Projects (list, Kanban, environments, Project Details)
│   ├── tasks.js             Tasks board, Calendar
│   ├── insights.js          Project Insights
│   ├── dnd.js / activity.js Drag and drop / Activity timeline
│   ├── settings.js          Settings, modules, Developers page, Jira settings
│   ├── events.js            Event delegation for page actions, filters
│   ├── modals.js            Developer, project and task forms; detail modal
│   ├── releases.js          Release Management
│   ├── release-points.js    Release Points
│   ├── test-cases.js        Test Case Management, Excel import
│   ├── notes.js             Notes
│   └── boot.js              Start-up (init) and global listeners
├── db.js                    ClairDB — SQLite persistence layer, schema, migration, snapshot (~260 lines)
├── style.css                Complete stylesheet with CSS custom properties (~10 600 lines)
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
| `chrome.alarms` | One-shot alarms at the next scheduled backup time and the next Jira sync slot, re-armed after each run; a repeating 30-second alarm for the Jira change watcher (`alarms` permission) |
| `chrome.notifications.create / onClicked / clear` | Desktop notifications for new Jira changes and QA tasks; clicking one opens Clair on the Notifications page (`notifications` permission) |
| `chrome.storage.local` + `chrome.storage.onChanged` (notifications) | `clairNotifications` (up to 300), `clairNotifySettings`, `clairJiraWatch` (last check, seen events), `clairJiraWatchProjects` (linked Jira projects, written by the page); open pages update instantly on change |
| `chrome.offscreen.createDocument / closeDocument` | Hidden page that builds the backup blob — service workers can't create blob URLs (`offscreen` permission, reason `BLOBS`) |
| `chrome.runtime.getContexts / sendMessage / onMessage` | Detects an existing offscreen page; service worker ↔ offscreen messaging |
| `chrome.runtime.onInstalled / onStartup` | Ensures the backup and Jira sync alarms exist and catches up a missed backup / Jira sync slot |
| `chrome.runtime.sendMessage / onMessage` (`clair-jira-qa-sync`) | The service worker hands a scheduled Jira sync to an open Clair tab |
| `navigator.locks` (Web Locks) | One Jira sync and one change check at a time across the page and the service worker; serialises updates to the notification list |
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

The export includes: `projects`, `tasks`, `tests` (insights), `developers`, `releases`, `testCases`, `modules`, `releasePoints`, `noteFolders`, `notes`, and `activity`. The Jira ticket cache (`jiraSync`), unsynced Jira changes (`jiraPending`), Jira sync bookkeeping (`jiraQa`), notifications and their settings, and Jira credentials are not exported (generated QA tasks are ordinary tasks and are exported); after restoring on another machine, connect Jira and press Refresh on the Jira page (manual status-mapping choices are not restored).

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

1. Edit [index.html](index.html), [style.css](style.css), the page scripts in [js/](js/), [db.js](db.js), [jiracore.js](jiracore.js) or [background.js](background.js) directly. New page code goes into the matching `js/` file; a new file must be added to the script list in `index.html` (order matters — code that runs at load can only use what earlier files define).
2. Bump the `"version"` field in [manifest.json](manifest.json) for any user-visible change — the sidebar badge updates automatically.
3. Reload the unpacked extension at `chrome://extensions`.
4. Test both **extension mode** and **standalone `index.html` mode** after any storage or persistence change.
5. All persistence goes through `ClairDB` in [db.js](db.js) — don't call `chrome.storage`/`localStorage` directly from the page scripts; add a `ClairDB` method instead. If you add a new collection, add its table to the schema in `ensureSchema()` and to the `TABLES` array, **and** to `ClairBackup.KEYS` in [backup.js](backup.js) so exports and automatic backups include it. The one deliberate exception is the automatic-backup settings/status in `chrome.storage.local`, which the service worker must write without touching the SQLite file.
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
- [ ] Release Points: rows are grouped into In progress / Completed; clicking a row expands/collapses it; Expand all / Collapse all work; ticking an item (mouse or Space/Enter) updates the count in place and the row stays open; project chips filter; searching a ticket key opens the matching release point; each version appears once; the release tag is solid for a Linked Release and dashed for "matched by version".
- [ ] Dashboard: Recent Tasks counts match task statuses; Needs attention lists overdue/due-soon tasks; Test Cases by Project rows open the project; Active Releases & Plans nests each release point under its release and lists the rest as not linked.
- [ ] Bulk Add count picker inserts the correct number of empty rows.
- [ ] Export creates a valid JSON backup.
- [ ] Import restores projects, tasks, insights, developers, releases, test cases, release points, note folders, and notes.
- [ ] Notes: project selection filters tree view; folder & 1-level subfolder creation works; subfolder limit is strictly enforced; Markdown toolbar formats text correctly; Edit/Preview mode toggle works; search & sorting filter correctly; Move Note updates location; deleting a project cascades to clean up associated notes/folders.
- [ ] Calendar view correctly renders monthly grid, navigates months, filters tasks, and opens task edit/create modals.
- [ ] Fresh install (empty IndexedDB, no legacy data): app boots, schema is created, mock/backup data loads without errors.
- [ ] Upgrade path: seed legacy `chrome.storage.local` data, load the app, confirm it migrates into SQLite with matching record counts and the legacy keys are cleared.
- [ ] Reloading after migration does not duplicate rows (`migrated_v1` guard) — check via `await ClairDB.load()` in the console.
- [ ] Theme: toggling System / Light / Dark in Settings → General updates the UI immediately and persists across a reload; no dark-then-light flash on launch regardless of OS theme.
- [ ] Task Work Done: new tasks start blank; existing (pre-update) tasks show the "task completed" backfill; editing and saving persists it to SQLite and shows on the card and detail modal.
- [ ] Task date range filter: matches `startDate` (not `createdAt`), inclusive on both ends; typing a full date into From/To doesn't jump segments or lose focus.
- [ ] Test Case Management: home shows project cards and the "No test cases yet" strip; a card opens the project overview (KPIs, charts, modules, open failures); **Open test scenarios** shows the scenario table; clicking a row expands it and edits autosave; status chips, filters, search, module rail, selection mode, rows-per-page and Prev/Next behave correctly; the breadcrumb returns to each level; Excel import correctly populates the Simplified Scenario column.
- [ ] Settings: each section in the menu opens (also with ↑/↓); theme cards switch the theme; module toggles hide/show sidebar items; Data & Backups and Integrations controls behave as before; Clear database asks for confirmation.
- [ ] Projects List view: dragging a project card reorders the list and persists across reload.
- [ ] Project Details: opens from the **Project Details** button in both List and Kanban views; stats match the project's tasks (tasks linked to multiple projects are counted per project, nothing from other projects); release history is newest first; editing a task/release/project from the page updates it immediately; **Projects** returns to the list; works in light and dark and at phone width.
- [ ] Client Name: create a project with and without a client; it shows on List and Kanban cards, the detail modal, and Project Details; it survives export → import.
- [ ] Jira: Save with a wrong token shows "rejected the email or API token" and stores nothing; a valid token connects and shows the account/workspace; the token field is empty afterwards; link a project, open a Release Point for it, Import from Jira, search/select/add tickets, save — the card shows each key as a link opening Jira in a new tab plus the assignee; importing the same ticket again in that project is blocked; Disconnect removes the credentials; an exported JSON contains no token.
- [ ] QA checklist: open a "Ticket closing" task; Verified & closed moves the ticket to Done in Jira and posts the template comment; Reopen moves it back with the comment; each adds a Work Done line; closing the remaining tickets in Jira and clicking Refresh from Jira completes the task. Settings → QA workflow templates can be edited.
- [ ] Weekly QA report and search: the report shows this week's outcomes, Copy for email and Download CSV work; Ctrl+K finds a Jira ticket by key and opens it.
- [ ] Project environments: fill QA / Production URL, login and password in the project form; the List card and Project Details show them with working links, copy buttons and show/hide for the password; a new project starts with empty, masked fields.
- [ ] Comment formatting: a comment with "- " bullets and **bold** sent with Sync to Jira looks like a bullet list with bold text in Jira.
- [ ] Notifications: with Jira connected and a project linked, a comment / status change / assignee change by someone else appears within about 30 seconds (or after **Check now**) with a chime, a desktop notification and badge counts; your own changes don't appear; mark read / Mark all read / Clear read work; switching a type off in Settings → Notifications stops it; Sync Now that creates a QA task adds a "QA task created" notification that opens the task; `chrome.alarms.get('clair-jira-watch')` in the service worker shows `periodInMinutes: 0.5`.
- [ ] Top bar and pages: only Import, Export and the bell in the top bar; New Project / New Task / New Insight / New Release are in their pages' toolbars; Projects Kanban, Calendar, Release Management and the forms look right in light and dark and at phone width.
- [ ] Jira sync & QA tasks: Sync Now creates one "Ticket closing - {project}" task per project with new Ready for QA tickets (tag Auto Task Creation, To-Do, Medium, start = earliest entry, end = +2 days, developers matched, description with keys and links); a second Sync Now creates nothing; a ticket that leaves and re-enters Ready for QA creates nothing; `chrome.alarms.get('clair-jira-qa-sync')` in the service worker shows the next slot; a failed project is reported and retried on the next sync without duplicating the others. More than five new tickets in a project become several tasks of at most five ("(1/2)", "(2/2)"). With two Clair projects on the same Jira project, tickets go to the project of their assignee (Developers page).
- [ ] Jira ticket panel: clicking a ticket row opens it; the status dropdown lists only transitions Jira allows; choosing one and adding comments marks the ticket Pending without changing anything in Jira; pending changes survive leaving the page and reloading; Sync to Jira applies the status and posts the comments (check in Jira), refreshes the row and comments, and clears the pending state; with a failing comment the status change is kept, the comment stays pending, and Sync again posts it once.
- [ ] Jira page: only linked projects appear; Refresh fetches every ticket (Epics and Sub-tasks included) and updates the counts and last-synced time; a failed refresh keeps the previous data and says so; View Details shows the table — search, type, assignee, category chips, sort, and pagination work, and the totals follow the filters; keys and the action icon open the ticket in Jira; unrecognised statuses show as Unmapped and can be mapped in Status mapping (saved per project, kept across refresh, Reset all to Automatic clears them); Release Points are unchanged; an exported JSON contains no `jiraSync`; light and dark themes and phone width look right.
- [ ] Automatic backup: Settings shows Enabled, schedule, last success, and status; saving a new time moves the alarm (`chrome.alarms.get('clair-daily-backup')` in the service worker console); disabling clears it; a backup file appears in `Backup/` and imports successfully; it matches a manual export apart from `exportedAt`.

---

## License

No license file is currently present in this repository. Usage and distribution rights are unspecified. Add a `LICENSE` file before distributing or open-sourcing the project.

---

<div align="center">
Built with vanilla HTML, CSS, and JavaScript — no dependencies, no build step, no server.
</div>
