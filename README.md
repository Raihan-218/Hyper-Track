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
- `GET /api/tasks` — list your tasks
- `POST /api/tasks` — create a task
- `PATCH /api/tasks/:id` — update a task
- `DELETE /api/tasks/:id` — delete a task
- `GET /api/habits` — list your habits
- `POST /api/habits` — create a habit
- `POST /api/habits/:id/completions` — mark a habit complete for a date
- `DELETE /api/habits/:id/completions/:date` — undo a completion for a date

All user-owned records are scoped to the authenticated user. API input is validated on the server.

## MVP implementation order
1. Finish API tests and verify MongoDB connection.
2. Add refresh-token/session strategy and account recovery before public launch.
3. Build task creation/editing and habit creation/editing screens.
4. Add streak/weekly analytics using completion records and the user's timezone.
5. Add notifications, offline behavior, accessibility, and EAS builds.
6. Add a web client once the mobile workflow is stable.

## Important production notes
This is a starter scaffold, not a production launch. JWT access tokens are stored with Expo SecureStore on native devices. Before production, add automated tests, email verification, password reset, token revocation/refresh, request logging, monitoring, backups, and a privacy policy. Configure a restrictive CORS allowlist for the deployed API.
