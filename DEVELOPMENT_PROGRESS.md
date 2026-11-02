# Hyper Track 2.0 development progress

Updated 2026-11-02

## Milestone delivery status

| Milestone | Status | Delivery |
| --- | --- | --- |
| 1. Design system and navigation foundation | Complete | Semantic tokens, shared UI primitives, and responsive app shell. |
| 2. Dashboard and EXP redesign | Complete | Responsive productivity dashboard using the existing progression and XP data. |
| 3. Tasks, projects, habits, and goals redesign | Complete | Dedicated responsive screens with existing workflows and additive archive/streak support. |
| 4. Calendar redesign | Implementation complete; awaiting approval | Responsive month, week, and day views with event-backed activity, timezone-aware dates, task actions, and selected-day agenda. |
| 5. Monorepo and build workflow reorganization | Partially complete | Root command interface, one Expo configuration root, centralized dependencies, docs, and CI validation are in place. The canonical Android project now builds and installs with the Windows CMake/Ninja fix. The legacy root Android tree and APK remain preserved as requested. |

## Phase status

| Phase | Status | Delivered in this pass | Remaining work |
| --- | --- | --- | --- |
| 0. Product audit | Complete | Repository, UX, API/data model, risk, and phased roadmap assessment presented before implementation. | None for the initial assessment. |
| 1. Design system and UI | Foundation and dashboard delivered | Semantic color palette and shared spacing/type/radius/motion tokens; responsive `AppShell`; extracted responsive dashboard with authoritative XP progress, current-state day metrics, priority/deadline/habit panels, and event-backed weekly activity; animated XP and completion feedback. | Apply tokens across legacy non-dashboard screens; progressively extract remaining screens; add loading skeletons; review layouts and accessibility on devices. |
| 2. Calendar and history | Calendar redesign delivered | Month/week/day calendar with selected-day agenda, current/future task deadline indicators, task/habit completion state, plan/schedule snapshot history, and timezone-aware date keys. | Existing project records do not have deadline fields. The old schema cannot recover prior task due-date changes or pre-migration task cycles and habit schedule changes. Historical task deadlines are therefore not shown. Run migration on a database backup and verify against real accounts. |
| 3. Gamification | Core loop in place | Backend XP ledger, duplicate-safe awards, undo reversals, level thresholds, milestone rewards, achievement criteria, daily challenge summary, profile gallery. | Configurable reward storage, daily completion bonuses, schedule-aware overall streak, persisted unlock dates, broader achievement/challenge catalog, and lightweight celebrations/haptics. |
| 4. Habit and task enhancements | Partial | Habit categories/difficulty and schedule-aware individual analytics; task text/priority filters; recurrence keeps local wall time across DST. | Kanban, templates, notes/duration, category filters, full habit calendar/heatmap, reminders/reflections, richer project detail and task links. |
| 5. Analytics and insights | Partial | Event-backed day/week/month totals, productive-day data, progress bars, daily/weekly/month range selector. | Dedicated charts/heatmap, consistency denominators for flexible weekly targets, richer weekly review and trend comparisons. |
| 6. Additional features | Selected features implemented | Focus session API/mobile timer and JSON/CSV export endpoints. | Native file save/share flow, focus breaks/history/task linking, journal, widgets, theme accents, and contextual smart notifications were evaluated and deferred. |
| 7. QA and release prep | Checks and docs in place; not release-ready | TypeScript checks, API unit tests, Expo public-config validation, migration instructions, CI Expo validation step, security/ownership review of new routes. | No MongoDB-backed integration or mobile device tests exist yet. Configure and verify store signing credentials. |

## Validation run

Milestone 1 validation on 2026-11-01: `npm run typecheck`, `npm run test:api` (11 passed), and `npm run validate:expo` all passed. The new shell and navigation compile; no device-level visual review has been performed yet.

Milestone 2 validation on 2026-11-01: `npm run typecheck`, `npm run test:api` (11 passed), `npm run validate:expo`, and Expo web export (860 modules) all passed. No phone/tablet/desktop screenshot review was available in this pass.

- `npm run typecheck`
- `npm run test:api`
- `npm run validate:expo`
- `npm exec --workspace=@hyper-track/mobile -- expo export --platform web --output-dir .expo/export`
- `npm run build -w @hyper-track/api`

All five commands passed; the Expo web bundle completed for 857 modules. The API suite currently uses mocked route handlers plus pure date/XP tests; it does not prove MongoDB transaction or index behavior. No database or native-device environment was configured for this pass.

Milestone 4 validation on 2026-11-02: `npm run typecheck`, `npm run test:api` (16 passed), `npm run validate:expo`, and `npm exec --workspace=@hyper-track/mobile -- expo export --platform web --output-dir .expo/milestone4-export` passed. The web bundle completed for 865 modules. Calendar views have not been visually reviewed on native phone/tablet devices or with a live account.

Monorepo restructuring validation on 2026-11-02: root `npm install` lock/workspace resolution, `npm run typecheck`, `npm run test:api` (16 passed), `npm run validate:expo`, `npm run doctor`, and `npm run export:web` all passed. Expo entry resolution from the mobile workspace selects `expo-router/entry.js`; Metro bundled the mobile app. Root scripts now route to explicit workspaces, and CI also checks Expo compatibility and web export.

Android native build troubleshooting on 2026-11-02: the original Reanimated failure was caused by the SDK's default CMake 3.22.1 bundling Ninja 1.10.2, which cannot create the deeply nested object directory formed from Reanimated's absolute Windows source path (`CMakeFiles/reanimated.dir/D_/Project/.../CSS/common/filters`). Windows long paths are enabled (`LongPathsEnabled=1`), CMake's object path limit was 1024, and the failure occurred in Ninja's directory creation before C++ compilation; this was not an Expo/RN/Reanimated compatibility failure. Installed versions are Expo 58.0.22, React Native 0.88.1, Reanimated 4.7.1 (peer range supports RN 0.86–0.88), Android Gradle Plugin 9.2.1, and Gradle 9.4.1.

The mobile Android project now selects CMake 3.31.6 through `android.cmakeVersion` in `apps/mobile/android/gradle.properties`; its bundled Ninja is 1.12.1. No application dependency was changed, and the legacy root Android project/APK were not touched. `npm run android` completed Gradle successfully, including Reanimated CMake compilation. The generated APK is `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (89,865,872 bytes). `adb install -r` returned `Success`; `pm path com.hypertrack.app` found the installed package; `com.hypertrack.app/.MainActivity` launched. Metro served `node_modules/expo-router/entry.js` (1,363 modules), and React Native logged `Running "main"`.

The emulator's first-run Expo development-client prompt remained visible in UI automation, and synthetic taps did not advance it; screenshots were black despite the app activity and JS runtime starting. ADB transport resets also dropped the reverse tunnel during early attempts; after re-establishing `adb reverse tcp:8081 tcp:8081`, device reachability to Metro was confirmed and Metro delivered the Router bundle. The build, install, activity launch, and JS bundle are verified, but an interactive route-screen visual check remains unconfirmed in this emulator. The legacy APK remains at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Runtime bug and mobile UX audit — 2026-11-02

The mobile task editor's nullable optional task fields and weekly habit schedule payload match the API request schemas. The current app also keeps one shared task/habit state for Dashboard, Tasks, Calendar, and Habits; successful mutations reload that shared state. A latest-request guard now prevents stale overlapping data loads from replacing newer results. For writes with uncertain outcomes (server errors or persistence validation errors), the app reloads current server state instead of assuming that the write failed. Bootstrap now retains stored authentication on transient API/network failures and only clears it on an explicit 401.

The reported generic `Validation failed` was traced to the API error middleware translating every Mongoose `ValidationError` into that message. Existing logs did not identify the real originating request, route, or field, so the specific historical failure cannot be attributed to a particular editor input. Error responses now include safe field-level details and distinguish request validation from persistence validation; server diagnostics include method, route, and field names while excluding submitted values. Regression tests cover the task editor's nullable payload, weekly habit payload, completion-event XP path, and validation response. The exact original bad payload remains unconfirmed pending reproduction with the affected account or equivalent test data.

Tasks and Habits screens received narrow-width layout improvements for their controls, editor fields, and schedules. On the Android emulator, both screens were visually checked at phone dimensions; controls wrapped without clipping or overlap. A read-only comparison showed task/habit completion values consistent across Dashboard, Tasks, and Habits. No real account data was created, edited, completed, deleted, or archived during the audit.

Cold-start logs exposed a missing SDK-matched `expo-splash-screen` native module: Dev Launcher attempted to load `expo.modules.splashscreen.SplashScreenManager`, which was absent from the APK. Added Expo SDK 58-compatible `expo-splash-screen` (`~58.0.12`) and its config plugin. This changes only the mobile dependency/config and root lockfile; Expo, React Native, New Architecture, package identifier, API, and Android CMake selection are unchanged. After rebuilding and reinstalling, fresh cold-start logs show the app loading the Metro bundle and `ReactNativeJS: Running "main"`; the SplashScreenManager class error was absent from the fresh startup log.

Audit validation on 2026-11-02: `npm run typecheck`, `npm run test:api` (20 passed), `npm run validate:expo`, and `npm run doctor` passed. Doctor used Expo's local bundled dependency map because network access was disabled. `npm run android` completed successfully in 2m23s, compiling Reanimated CMake/Ninja and producing `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`; Expo installed and opened it on the emulator, Metro served the app, and the JS entry ran. API `/health` returned `ok`. The earlier API route/field causing the original validation message could not be recovered. No MongoDB-backed integration run or full authentication/write-flow test was performed; the app bundle startup is verified, while detailed interactive route behavior on a real device remains unverified.

## Missing user reference in XP transactions — 2026-11-02

The Mongoose model producing `user: Path `user` is required.` is `XPTransaction`. The shared `awardXp` service accepted the authenticated owner as `userId` and passed the entire service input directly to `XPTransaction.create`, while the model requires the field `user`. Mongoose's strict schema ignores the extra `userId` field, leaving `user` unset. This occurred after an authenticated completion interaction, not during dashboard reads: task completion (`PATCH /api/tasks/:id`, and also task creation initially marked done), habit check-in (`POST /api/habits/:id/completions`), and goal milestone completion (`PATCH /api/goals/:id/milestones/:milestoneId`) all share this service. The exact endpoint for the reported incident cannot be distinguished because no API request log from that occurrence was available; the validation error alone does not identify the caller.

Authentication is intact. `requireAuth` verifies the access-token JWT, validates its `sub` as a MongoDB ObjectId, and assigns it to `req.userId` (`AuthRequest` does not define `req.user`). Task/habit/goal routes pass that context to `awardXp`; task/habit completion and primary document writes already persist `user: req.userId`. The user reference was lost only at the service/model field-name boundary. Other `XPTransaction` writes, including XP reversals, already use `user`; no other shared model creation path with this mismatch was found.

`awardXp` now rejects absent/invalid authenticated user IDs before persistence and maps `userId` explicitly to the XP transaction's `user` field. The same authenticated ID remains the owner filter and upsert value for `UserGamification`. No client-supplied owner is used, no schema validation was weakened, and no database/API contract changes were made. Route regression tests verify authenticated task/habit document creation and completion ownership, invalid/missing JWT context, client owner spoofing rejection, and owner-scoped updates. Service tests validate real `XPTransaction` model documents for task, habit, and milestone awards and confirm missing context causes no write.

Validation on 2026-11-02: `npm run test:api` (25 passed), `npm run typecheck` (API and mobile), and `npm run validate:expo` passed. The API started, connected to its configured MongoDB, and returned `{\"status\":\"ok\",\"service\":\"hyper-track-api\"}` from `/health`; the Android application process was present on the emulator. The configured database is remote, and no isolated test account/database was available, so no task/habit completion was submitted against it. The Android app was not interactively signed in or navigated through the affected action in this pass. End-to-end mutation verification remains outstanding; do not treat compilation/unit tests or health status as confirmation that the remote runtime error has stopped.

## Calendar duplicate-key warning — 2026-11-02

The warning key `6ae85d7f98bba294180df89b-done` came from `CalendarScreen`'s completion-record list. Its key combined the task ID with `reversedAt`, substituting the same `done` suffix for every active event. Task completion history is event-based: a task can have multiple legitimate completion records on one local date after being reopened and completed again. The calendar day API returns those records as documents with distinct Mongo `_id` values; this was a frontend key-identity collision, not evidence of duplicate task rows or a database duplication issue. No task completion events were removed.

Calendar history rows now use each completion record's `_id` as the stable key. The client also collapses repeated copies with the exact same event `_id` in the returned list, while preserving distinct event IDs even when they refer to the same task. The calendar day route has a single history query and the frontend does not merge multiple completion sources; no API/database changes were needed.

Regression tests in `apps/mobile/test/calendar-event-keys.test.ts` cover distinct completed tasks, repeated completion events for one task, a repeated copy of the same event, stable keys across rerenders/reordering, and separate task/history sections. Validation on 2026-11-02: mobile TypeScript typecheck passed, mobile regression tests (3) passed, API tests (20) passed, Expo config validation passed, and `npm run android` built and installed the canonical app successfully. Fresh emulator logs confirmed `ReactNativeJS: Running "main"` and contained no duplicate-key warning during startup. This emulator session did not expose the embedded device screen to UI automation, so an interactive Calendar navigation with the affected account data could not be confirmed; the calendar key path is covered by the regression tests.

## Required rollout order

1. Back up MongoDB.
2. Deploy the API models/routes and run `npm run migrate:completion-history -w @hyper-track/api` once (the script is idempotent).
3. Deploy the mobile app after checking Expo/EAS app identity and signing configuration.
4. Verify a sample of task timestamps, habit date-only records, schedule snapshots, timezone boundaries, undo/reward balances, and exports against real user data.

Legacy migration rows keep provenance. Task completion local dates use the account's current timezone because the previous schema did not store the timezone at completion; habit date-only records do not receive invented timestamps. Calendar responses state that pre-rollout history is partial.
