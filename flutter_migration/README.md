<div align="center">

# Clair (Mobile)

**A local-first project & release tracker — Flutter mobile companion to the Clair Chrome Extension**

![Status](https://img.shields.io/badge/status-planning-informational?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Android%20%2F%20iOS-02569B?style=flat-square&logo=flutter&logoColor=white)
![Stack](https://img.shields.io/badge/stack-Flutter%20%2F%20Dart-0175C2?style=flat-square)
![Storage](https://img.shields.io/badge/storage-SQLite%20(Drift)-blueviolet?style=flat-square)
![Theme](https://img.shields.io/badge/theme-light%20%2F%20dark%20%2F%20system-333333?style=flat-square)
![Backend](https://img.shields.io/badge/backend-none-lightgrey?style=flat-square)

</div>

---

> **This README documents the planned Flutter application.** No implementation exists yet — see [`MIGRATION_PLAN.md`](MIGRATION_PLAN.md) in this same folder for the full phase-by-phase build plan, feature-parity matrix, data compatibility specification, and architecture reasoning this README summarizes, and [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) for the exact color tokens and icon mapping. This file will be updated to reflect actual implementation state as phases complete.

## Table of Contents

- [Overview](#overview)
- [Goals](#goals)
- [Feature List](#feature-list)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Folder Structure](#folder-structure)
- [Data Models](#data-models)
- [Database Architecture](#database-architecture)
- [JSON Import/Export Compatibility](#json-importexport-compatibility)
- [Migration Strategy](#migration-strategy)
- [Navigation Structure](#navigation-structure)
- [Screen Inventory](#screen-inventory)
- [Theme System](#theme-system)
- [Offline / Local-First Behavior](#offline--local-first-behavior)
- [Testing Strategy](#testing-strategy)
- [Development Setup](#development-setup)
- [Build Instructions](#build-instructions)
- [Known Limitations](#known-limitations)
- [Compatibility Notes](#compatibility-notes)
- [Feature Parity With the Chrome Extension](#feature-parity-with-the-chrome-extension)
- [Future Considerations](#future-considerations)

---

## Overview

Clair Mobile is a Flutter/Dart rebuild of the [Clair Chrome Extension](../README.md) — a personal/small-team workspace for tracking projects, tasks, releases, release checklists, test cases, and developer assignments. It is **not** a shrunken copy of the desktop UI; it is a mobile-native redesign that preserves every data field, business rule, and workflow of the original while replacing desktop-only interaction patterns (hover actions, drag-and-drop Kanban, keyboard shortcuts, multi-column layouts) with mobile-appropriate equivalents (swipe actions, action sheets, bottom navigation, full-screen forms).

Like the Chrome Extension, Clair Mobile has **zero backend, zero account system, and zero cloud dependency**. All data lives in an on-device SQLite database. The only way data ever leaves the device is a user-initiated JSON export, which is fully compatible with the Chrome Extension's own export/import — a file created by one app can be opened by the other.

## Goals

1. **Full functional parity** with the Chrome Extension — every feature, field, validation rule, filter, calculation, and workflow, as documented in [`MIGRATION_PLAN.md`](MIGRATION_PLAN.md).
2. **A genuinely mobile UI**, not a cramped port of the desktop layout.
3. **Guaranteed JSON compatibility** in both directions with the Chrome Extension's export format — the existing schema is treated as a public contract, not a starting point to redesign.
4. **Local-first, offline-first**, exactly like the source app.
5. **A clean, testable Flutter architecture** built around the source app's proven business logic, not a literal transliteration of its ~9,400-line single-file JavaScript controller.

## Feature List

| Area | Capability |
|---|---|
| Dashboard | Live project/task/insight/release metrics, weekly task-completion chart, task status breakdown, test-cases-by-project chart, month-navigable "Released" section, recent projects/tasks/insights |
| Projects | Web and App (Android + iOS) project types with independent version tracks, client/team/due-date/priority metadata, up to 3 concurrent status tags, 5-stage lifecycle Kanban, manual list reordering, versioned release actions with history |
| Tasks | 4-stage Kanban (To-Do / In Progress / Done / On Hold), full calendar view, project & developer assignment with dynamic filtering, deadline and date-range filters, free-text tags, Work Done log, completion-date capture |
| Project Insights | Issue / Enhancement / Note tracking with a 4-state status field and an independent assignment-state flag, filterable by project/developer/status |
| Release Management | 7-stage free-form release status, multi-project/multi-version releases, generated release announcements, share/clipboard delivery |
| Release Points | Checklist-based release-readiness cards, bulk checklist item creation, inline editing, ticket-link display, progress tracking |
| Test Case Management | Structured test cases with priority/severity/type/status, per-project modules, paginated & filterable case table, bulk update/delete, Excel/CSV import with automatic column mapping and duplicate detection |
| Developers | A simple registry linked to projects, feeding context-aware dropdowns everywhere a developer can be assigned |
| Activity Feed | A 200-entry, append-only audit log of every create/update/delete/move/copy action across the app |
| Settings | Theme (System/Light/Dark), data export/import, clear database (with forced backup), developer management, live storage/record-count overview |
| Search | A dedicated search screen covering projects, tasks, and developers |

Every row above is described in exhaustive, field-level detail — including hidden business rules discovered directly in the extension's source, not just its own README — in [`MIGRATION_PLAN.md` §1 and §2](MIGRATION_PLAN.md#1-current-implementation-inventory).

## Architecture

```
presentation/   screens, mobile-specific widgets (bottom nav / rail shell, cards, sheets)
application/    Riverpod providers & notifiers — one controller per feature,
                 plus derived providers (dashboard metrics, filtered/narrowed lists)
domain/         plain Dart models, enums, and pure ported business-rule functions
                 (version bump, deadline thresholds, pass-rate math, CSV header
                 matching, status normalization) — unit-testable with no Flutter
                 or database dependency
repository/     interfaces + Drift-backed implementations, one per collection,
                 exposing reactive Stream<List<T>> queries plus a DB-paginated
                 query for the Test Case table
services/       import/export, Excel/CSV import, activity logging, theming,
                 share/backup
data/           Drift database, table definitions, schema migrations
```

Full reasoning for every technology and layering choice — including alternatives considered and rejected — is in [`MIGRATION_PLAN.md` §4](MIGRATION_PLAN.md#4-architecture-proposal).

## Technology Stack

| Concern | Choice |
|---|---|
| Language / framework | Dart / Flutter |
| Local database | [Drift](https://drift.simonbinder.eu/) (SQLite) |
| State management | [Riverpod](https://riverpod.dev/) (code-generated) |
| Routing | [go_router](https://pub.dev/packages/go_router) |
| Charts | [fl_chart](https://pub.dev/packages/fl_chart) |
| CSV parsing | [csv](https://pub.dev/packages/csv) (quote/embedded-newline aware, matching the source app's parser) |
| Excel (.xlsx) reading | [excel](https://pub.dev/packages/excel) |
| File import | [file_picker](https://pub.dev/packages/file_picker) |
| Export / share | [share_plus](https://pub.dev/packages/share_plus) |
| App metadata | [package_info_plus](https://pub.dev/packages/package_info_plus) |

No backend SDKs, no analytics SDKs, no network client — by design.

## Folder Structure

```
lib/
├── main.dart
├── app.dart
├── data/
│   ├── database.dart
│   ├── tables/
│   └── daos/
├── domain/
│   ├── models/
│   ├── enums/
│   ├── repositories/          (interfaces)
│   └── rules/                 (pure ported business logic)
├── application/
│   ├── providers/
│   └── notifiers/
├── services/
└── presentation/
    ├── shell/                 (bottom nav / nav rail)
    ├── theme/
    ├── dashboard/
    ├── projects/
    ├── tasks/
    ├── insights/
    ├── releases/
    ├── release_points/
    ├── testcases/
    ├── developers/
    ├── activity/
    ├── settings/
    ├── search/
    └── widgets/common/
test/
integration_test/
```

## Data Models

Clair Mobile's domain models mirror the Chrome Extension's JSON schema field-for-field — see [`MIGRATION_PLAN.md` §1.3](MIGRATION_PLAN.md#13-full-field-inventory-per-collection) for every field, validation rule, and default across all nine collections (Project, Task, Project Insight, Release, Release Point, Developer, Test Case, Module, Activity Entry).

Every model preserves fields it doesn't explicitly know about in an `extra` map, so a JSON record can round-trip through Flutter without ever silently dropping a field — including one added by a future version of either app. See [`MIGRATION_PLAN.md` §4.4](MIGRATION_PLAN.md#44-model-layer-pattern-concrete-example) for the exact pattern.

## Database Architecture

A hybrid schema: a handful of indexed columns for the fields actually filtered, sorted, or grouped by the UI today (status, priority, project/module linkage, dates), plus a complete JSON blob column per row that is the true serialization source of truth. This gives real query performance for the Test Case table's pagination at production scale (the source app's real data includes 1,900+ test cases) without ever risking a normalized schema silently reshaping or dropping a field the JSON contract requires. Full schema in [`MIGRATION_PLAN.md` §4.3](MIGRATION_PLAN.md#43-local-database-schema-drift).

## JSON Import/Export Compatibility

**The Chrome Extension's export format is treated as a frozen public contract.** Clair Mobile:

- Imports any file the Chrome Extension can produce, without modification.
- Exports files the Chrome Extension can import back, without modification.
- Never renames, removes, or reshapes an existing field.
- Preserves unknown/future fields on every model and at the top level.
- Preserves IDs, relationships, and timestamps exactly as received.

The full compatibility specification — field-by-field mapping, enum synonym handling (including a real inconsistency found in the source app between `"Untested"` and `"Not executed"` test case statuses), and the safe, additive way a `schemaVersion` marker is introduced without breaking any existing Chrome export or import — is in [`MIGRATION_PLAN.md` §3](MIGRATION_PLAN.md#3-data-compatibility-specification).

## Migration Strategy

Existing Clair users move their data with: **Chrome Extension → Settings → Export Data → transfer the file to the phone → Clair Mobile → Import**. There is no cloud sync and no account system involved — this mirrors the source app's own local-first design rather than introducing a backend solely to ease migration. Full detail, including the reliability requirements this path must meet, is in [`MIGRATION_PLAN.md` §8](MIGRATION_PLAN.md#8-migration-strategy).

## Navigation Structure

- **Phones**: a 5-item bottom navigation bar (Dashboard, Projects, Tasks, an "Insights+" cluster covering Project Insights/Releases/Release Points/Test Cases, and More for Developers/Activity/Settings).
- **Tablets** (≥600dp): a navigation rail with all 9 destinations directly accessible, closer to the desktop sidebar's flat structure.

Every desktop interaction pattern (modals, hover actions, drag-and-drop Kanban, multi-column layouts, keyboard shortcuts) has an explicit mobile mapping — full table in [`MIGRATION_PLAN.md` §5](MIGRATION_PLAN.md#5-mobile-navigation-proposal).

## Screen Inventory

| Screen | Purpose |
|---|---|
| Dashboard | Metrics, charts, recent activity across the whole workspace |
| Projects (List / Kanban) | Project catalog, lifecycle tracking, release actions |
| Project detail / create-edit | Full project form, redesigned for mobile |
| Tasks (Kanban) | Task execution board |
| Calendar | Month-grid task view |
| Task detail / create-edit | Full task form with project/developer checklists |
| Project Insights | Issue/Enhancement/Note tracking |
| Release Management | Release lifecycle and announcement generation |
| Release Points | Checklist-based release readiness cards |
| Test Case Management | Summary cards, paginated case table, bulk operations |
| Excel/CSV Import | Column-mapping and duplicate-review flow |
| Developers | Registry and project-linking |
| Activity | Chronological audit feed |
| Settings | Appearance, data management, system overview |
| Search | Cross-workspace search |

## Theme System

System / Light / Dark, resolved before the first frame is painted so there is no flash of the wrong theme on launch — the same problem the Chrome Extension solved by resolving its theme in JavaScript rather than via a CSS media query, adapted to Flutter's boot sequence. The preference persists in the same local database as everything else, not a separate preferences store, so a single export/backup captures the whole app state consistently.

## Offline / Local-First Behavior

Every feature works with the device in airplane mode, indefinitely — there is no feature in this app that requires network connectivity. The only interaction that touches anything outside the device is a user-initiated export/share.

## Testing Strategy

Unit tests for every ported business rule (version bumping, deadline thresholds, pass-rate math, CSV header matching, status normalization) against the exact source logic; repository/database tests including transactional rollback; an import/export test suite that runs against **real exported JSON files** from the Chrome Extension, not just synthetic fixtures; widget tests for every major screen; full-workflow integration tests (create → assign → complete, export → wipe → import, theme persistence across restart); and a feature-parity regression checklist run before every release. Full matrix in [`MIGRATION_PLAN.md` §7](MIGRATION_PLAN.md#7-testing-strategy).

## Development Setup

```
flutter --version   # verify a recent stable Flutter SDK is installed
flutter pub get
flutter run
```

_(This section will be filled in with exact SDK version pins and environment setup once Phase 4 of the migration plan scaffolds the project.)_

## Build Instructions

### Android Setup
Release builds are produced via `flutter build appbundle` once Phase 25 of the migration plan completes signing/versioning configuration. See `android/` once it exists.

### iOS Setup
Release builds are produced via `flutter build ipa` once Phase 26 of the migration plan completes provisioning/signing configuration. See `ios/` once it exists.

_(Both sections are placeholders — no build configuration exists yet; this app is in the planning stage.)_

## Known Limitations

- No live sync between the Chrome Extension and Clair Mobile — keeping both in sync during a transition period requires manually re-exporting/re-importing.
- Global search covers projects, tasks, and developers only (matching the Chrome Extension's current scope) — Project Insights, Releases, and Test Cases are not yet searchable from the global search screen.
- The Excel Report export feature present in the Chrome Extension's codebase is deferred past the initial mobile release (see [`MIGRATION_PLAN.md` §9.3](MIGRATION_PLAN.md#93-decisions-needed-before-implementation-consolidated)).
- No license file currently exists for this project.

## Compatibility Notes

- A file exported from Clair Mobile can be imported into the Chrome Extension, and vice versa, for the full lifetime of both apps, as long as neither app's export format changes in a way that isn't additive (see [`MIGRATION_PLAN.md` §3.2](MIGRATION_PLAN.md#32-introducing-a-schemaversion-marker-safely)).
- A handful of small, deliberate behavior corrections relative to the Chrome Extension's current code (not its documented intent) are called out explicitly in [`MIGRATION_PLAN.md` §9.2](MIGRATION_PLAN.md#92-things-requiring-special-handling-real-bugsinconsistencies-found-in-the-source-app--do-not-blindly-replicate) — for example, normalizing the two different literal strings the Chrome Extension currently uses for an "untested" test case.

## Feature Parity With the Chrome Extension

Tracked as a living checklist in [`MIGRATION_PLAN.md` §2 (Feature-Parity Matrix)](MIGRATION_PLAN.md#2-feature-parity-matrix) and re-verified in full at the end of the build (Phase 27, Final Regression & Feature-Parity Audit).

## Future Considerations

Explicitly **out of scope** for this initial mobile port, listed here so they aren't mistaken for oversights:
- Cloud sync / multi-device live sync (would require a backend the source app deliberately doesn't have).
- Direct device-to-device migration transfer (e.g. local network/Bluetooth handoff) beyond the JSON export/import path.
- A "Merge" import mode beyond the default full-replace (planned as a possible later enhancement, not required for compatibility — see [`MIGRATION_PLAN.md` §3.5](MIGRATION_PLAN.md#35-import-validation-and-partialduplicaterollback-behavior)).
- Expanded global search scope (Insights/Releases/Test Cases).

---

<div align="center">
Planned as a local-first, offline-first Flutter application — no backend, no account, no cloud dependency, matching the Chrome Extension it succeeds.
</div>
