# Hyper Track

A cross-platform productivity app. Initial target: Android and iOS; web can be added after the mobile MVP.

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
    api/       Express REST API
    mobile/    Expo Android/iOS app
  packages/
    shared/   Shared TypeScript types
```

## Requirements
- Node.js 20.19+ (or a currently supported LTS release)
- npm 10+
- MongoDB local instance or MongoDB Atlas URI
- Expo Go on your phone for a quick development preview; native builds can use EAS later

## 1. Install dependencies
From the repository root:

```bash
npm install
```

## 2. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

Set `MONGODB_URI` and a long random `JWT_SECRET` in `apps/api/.env`. Never commit `.env`.

Start MongoDB locally, then run:

```bash
npm run dev:api
```

API health check: `http://localhost:4000/health`

## 3. Configure the mobile app

Create `apps/mobile/.env` based on `apps/mobile/.env.example`.

Set `EXPO_PUBLIC_API_URL` to an address the device can reach:
- Android emulator: `http://10.0.2.2:4000/api`
- iOS simulator: `http://localhost:4000/api`
- Physical phone: `http://YOUR_COMPUTER_LAN_IP:4000/api` (phone and computer on the same Wi-Fi)

Then run:

```bash
npm run dev:mobile
```

Scan the Expo QR code using Expo Go. If a physical device cannot reach the API, check the computer firewall and LAN IP.

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

The main mobile route remains a large screen component; the design primitives are reusable, but the light palette has not yet been applied throughout every legacy screen style. Release credentials and signing need to be configured for the target app. The checked-in root Android project still has a different application ID from the Expo app config and uses debug signing for release builds; do not ship that native project until its identity and signing are reconciled.

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
