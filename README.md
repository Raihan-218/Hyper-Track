# Hyper Track

A cross-platform productivity app. Android, iOS, and web share one Expo application in `apps/mobile`.

## Stack
- Mobile: Expo + React Native + Expo Router + TypeScript
- API: Node.js + Express + TypeScript
- Database: MongoDB + Mongoose
- Auth: bcrypt password hashing + JWT access token
- Validation/security: Zod, Helmet, CORS, rate limiting

## Project layout

```text
hyper-track/
  apps/
    api/       Express REST API and tests
    mobile/    Expo Router app and its Android native project
  packages/
    shared/    Shared TypeScript types
  scripts/     Root development and cleanup helpers
  package.json Root command interface and npm workspace definition
  package-lock.json  Authoritative lockfile for all workspaces
```

`apps/mobile` is the only Expo project root and the canonical Android project. Run commands from the repository root; root scripts explicitly target their workspace. Open `apps/mobile/android` in Android Studio. A stale root `android/` tree and its debug APK are retained temporarily as a rollback artifact because the canonical Android app has not yet passed a full install-and-launch check on this Windows environment; do not use that root tree for new builds.

## Requirements
- Node.js 20.19+ (or a currently supported LTS release)
- npm 10+
- Java 17 and Android Studio with Android SDK Platform Tools for Android builds
- MongoDB local instance or MongoDB Atlas URI
- Android emulator or a USB-debugging-enabled Android device for `npm run android`

## 1. Install dependencies
From the repository root:

```bash
npm install
```

## 2. Configure the API

Create `apps/api/.env` from `apps/api/.env.example` (PowerShell: `Copy-Item apps/api/.env.example apps/api/.env`; Bash: `cp apps/api/.env.example apps/api/.env`).

Set `MONGODB_URI` and a long random `JWT_SECRET` in `apps/api/.env`. Never commit `.env`.

Start MongoDB locally, then run:

```bash
npm run dev:api
```

API health check: `http://localhost:4000/health`

## 3. Configure the mobile app

Create `apps/mobile/.env` from `apps/mobile/.env.example`. The root `.env.example` is a reference; Expo loads the mobile workspace file and the API loads `apps/api/.env`.

Set `EXPO_PUBLIC_API_URL` to an address the device can reach:
- Android emulator: `http://10.0.2.2:4000/api`
- iOS simulator: `http://localhost:4000/api`
- Physical phone: `http://YOUR_COMPUTER_LAN_IP:4000/api` (phone and computer on the same Wi-Fi)

Start only the mobile development server:

```bash
npm run dev:mobile
```

The root command runs Expo with `apps/mobile` as its working project, so Expo Router resolves `expo-router/entry`. For the API and mobile server together, use `npm run dev`. For the API alone, use `npm run dev:api`.

### Android build and APK

Start an Android emulator or connect a device, then run from the repository root:

```bash
npm run android
```

This runs Expo’s Android development build from `apps/mobile`, then installs and launches the app and connects to Metro when native compilation succeeds. The debug APK is generated at:

```text
apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

The Android Studio project is `apps/mobile/android`. The app ID is `com.hypertrack.app`, matching `apps/mobile/app.json`. Release builds still require production signing credentials; the checked-in Gradle release variant currently uses the debug signing config and is not suitable for store distribution.

### Web, diagnostics, and cleanup

```bash
npm run export:web     # Export the mobile app for web into apps/mobile/dist
npm run doctor         # Validate Expo config and SDK package compatibility
npm run clean          # Remove generated Expo/API/mobile Android build outputs
```

`npm run clean` preserves source files, dependencies, `.env` files, Android `local.properties`, and the legacy root Android APK while cleaning only its explicit generated-output allowlist.

### Root command reference

```bash
npm install
npm run dev:api
npm run dev:mobile
npm run dev
npm run android
npm run typecheck
npm run test:api
npm run validate:expo
npm run doctor
npm run export:web
npm run clean
```

`npm run dev` starts both services; press Ctrl+C to stop them. For Android troubleshooting, confirm `adb devices` lists the emulator/device, USB debugging is enabled, and the device can reach the API URL. The app’s Metro/Expo commands always execute in the mobile workspace; do not run `expo` or Gradle from the repository root.

## API endpoints in this starter

- `GET /health` — API status
- `POST /api/auth/register` — create an account
- `POST /api/auth/login` — log in
- `GET /api/auth/me` — current account (JWT required)
- `PATCH /api/auth/me` — update name and timezone
- `POST /api/auth/refresh` — rotate a refresh session
- `POST /api/auth/logout` — revoke account sessions
- `GET /api/tasks` — list your tasks
- `POST /api/tasks` — create a task
- `PATCH /api/tasks/:id` — update a task
- `DELETE /api/tasks/:id` — archive a task (and its subtasks)
- `GET /api/habits` — list your habits
- `POST /api/habits` — create a habit
- `PATCH /api/habits/:id` — update a habit
- `DELETE /api/habits/:id` — archive a habit
- `POST /api/habits/:id/completions` — mark a habit complete for a date
- `DELETE /api/habits/:id/completions/:date` — undo a completion for a date
- `GET /api/progress/weekly` — seven-day task and habit summary
- `GET /api/progress/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` — event-based daily totals, up to 366 days
- `GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` — calendar activity markers, up to 63 days
- `GET /api/calendar/day/:date` — selected date plans, completion history, habit summary, and XP
- `GET /api/habits/:id/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` — habit history and scheduled-day metrics
- `GET /api/gamification` — XP, level, streak summary, achievements, challenge, and recent ledger entries
- `GET|POST /api/focus` — read focus history or start a focus session; `PATCH /api/focus/:id` finishes or cancels it
- `GET /api/data-export?format=json|csv` — authenticated export of tasks, habits, history, and rewards
- `GET|POST /api/goals` — list or create goals
- `PATCH|DELETE /api/goals/:id` — update or archive a goal
- `POST /api/goals/:id/milestones` — add a goal milestone
- `PATCH /api/goals/:id/milestones/:milestoneId` — complete or reopen a milestone
- `GET|POST /api/projects` — list or create projects
- `PATCH|DELETE /api/projects/:id` — update or archive a project

Task creation/update accepts priority, due date, planned date, local reminder time, recurrence, project, and parent task fields. Habit schedules support daily or weekly goals and optional preferred weekdays, category, icon, color, and difficulty. Task lists are user-scoped and accept `page`, `limit`, `status`, `priority`, `projectId`, `q`, and `plannedDate` query parameters.

All user-owned records are scoped to the authenticated user. API input is validated on the server.

## Hyper Track 2.0 rollout

The implementation now includes a five-destination mobile shell, system/light/dark theme preference, month/week/day calendar navigation, append-only task and habit completion records, planned-date snapshots, server-owned XP ledger and reversals, levels, achievement criteria, task filters, habit metadata/analytics, date-range summaries, focus sessions, and authenticated JSON/CSV export.

Before deploying the API, run the idempotent completion-history backfill against the configured MongoDB database:

```bash
npm run migrate:completion-history -w @hyper-track/api
```

The migration preserves known task completion timestamps. For those legacy task events, the local date is derived using the account's current timezone because the original schema did not retain the completion-time timezone; events are marked `source: migration`. Legacy habit check-ins contain only a local date, so their backfilled `completedAt` and `timezone` stay null. Existing task plans and habit schedules are seeded as migration baselines and are not used to claim past scheduling. Past plan changes, schedule changes, and older task completion cycles were not recorded by the original schema. Calendar responses expose `historyCoverage` as partial for dates before this rollout. New records retain local dates and immutable event data.

Current streaks and badges are an initial consistency model. Individual habit analytics are schedule-aware for daily and explicitly selected weekdays; flexible weekly-target streaks and weekly/monthly challenge configuration remain future work. XP rewards default to 10/15/10/50 and can be changed with the validated XP_REWARD_* API environment values. Daily all-habits/all-tasks bonuses, persisted unlock timestamps, celebration animations, and a broader badge gallery are not yet implemented.

The focus timer records sessions but does not yet implement break scheduling, task linking in the mobile UI, or background notifications. CSV/JSON export endpoints are available to authenticated clients; a native share/save flow is still needed in the app. Widgets and a private journal were deferred because they require native platform work and additional privacy controls.

The main mobile route remains a large screen component; the design primitives are reusable, but the light palette has not yet been applied throughout every legacy screen style. Release credentials and signing need to be configured for the target app. The canonical Android release variant currently uses the debug signing config and is not suitable for store distribution until production signing is configured.

Run `npm run typecheck`, `npm run test:api`, and `npm run validate:expo` from the repository root. MongoDB-backed migration, API integration, and Android/iOS device-flow verification must run in a configured environment before a store release.

## Product implementation notes
- Task reminders are scheduled locally on the device. They do not require a push service, but local notification permission must be granted. A development build is needed for testing native notification behavior consistently.
- Offline mode caches previously loaded API responses and queues new task and habit creation. Queued creates carry idempotency keys and sync on the next successful authenticated request. Editing and completion changes still require connectivity.
- Refresh tokens are rotated and stored as hashes in MongoDB. Existing accounts with only an old access token may need to sign in again after upgrading.
- Email verification and password recovery are not enabled; add a mail provider and recovery workflow before a public launch.
- The goals and projects flows are an initial expansion. Validate their usefulness with users before investing in calendar sync, AI planning, challenges, or broader analytics.
- Run `npm run test:api` for route validation and ownership tests, and `npm run typecheck` for API and mobile type checks. Add database-backed API integration and mobile flow tests before public release.

## Important production notes
This is a starter scaffold, not a production launch. JWT access tokens are stored with Expo SecureStore on native devices. Before production, add automated tests, email verification, password reset, token revocation/refresh, request logging, monitoring, backups, and a privacy policy. Configure a restrictive CORS allowlist for the deployed API.
