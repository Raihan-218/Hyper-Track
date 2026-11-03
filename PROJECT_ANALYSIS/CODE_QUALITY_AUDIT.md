# Code Quality, Frontend & Backend Engineering Audit

**Document:** `PROJECT_ANALYSIS/CODE_QUALITY_AUDIT.md`  
**Target:** Monorepo (`apps/mobile`, `apps/api`, `packages/shared`)  
**Auditor:** Senior Principal Full-Stack Engineer & Code Quality Specialist  

---

## 1. Executive Code Quality Rating

| Domain | Rating | Critical Issue Count | Technical Debt Load |
| :--- | :---: | :---: | :--- |
| **Frontend Architecture** | **D+** | 8 | **Severe.** Centralized monolithic state component, massive re-render overhead. |
| **Frontend UI/UX Implementation** | **B** | 3 | **Moderate.** Good semantic styling, but missing skeleton loaders and error boundaries. |
| **Backend Architecture** | **B-** | 5 | **Moderate.** Clean Express routing, but missing controller/service abstraction and transactions. |
| **Backend Code Hygiene** | **B+** | 2 | **Low.** Consistent Zod validation and safe typed interfaces. |
| **Monorepo / Shared Contracts** | **C** | 3 | **Moderate.** Shared package only holds basic interfaces, not validation schemas. |

---

## 2. Frontend Engineering Audit (`apps/mobile`)

### 2.1 The "God Component" Pattern in `apps/mobile/app/index.tsx`
- **Location:** `apps/mobile/app/index.tsx:74-513`
- **Finding:** A single `HomeScreen` React component contains **over 35 individual `useState` hooks**, 5 `useEffect` hooks, and orchestrates authentication, tasks, habits, projects, goals, calendar, profile, notifications, and synchronization.
- **Evidence:**
  ```tsx
  // apps/mobile/app/index.tsx:77-130
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newHabit, setNewHabit] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newProject, setNewProject] = useState("");
  // ... 25 more useState declarations
  ```
- **Consequences:**
  1. **Typing Lag:** Every keystroke into the task title, habit name, or project title updates a state hook on the root `HomeScreen`, triggering a full reconciler cycle down through `AppShell`, `Dashboard`, and `AppNavigation`.
  2. **Severe Prop Drilling:** Functions and drafts (`taskDraft`, `habitDraft`, `onDraftChange`, `onToggle`, `onArchive`) are manually passed down 3 to 4 levels deep to `TaskManagementScreen`, `HabitsScreen`, etc.
  3. **High Cyclomatic Complexity:** The file has a cyclomatic complexity exceeding 65, making unit testing impossible without mounting the entire application.

### 2.2 Cascading Network Storm on Any Mutation
- **Location:** `apps/mobile/app/index.tsx:132-167` (`loadData()`)
- **Finding:** Whenever any entity is created, edited, checked off, or deleted, the application invokes `await loadData()`.
- **Evidence:**
  ```tsx
  // apps/mobile/app/index.tsx:147-153
  const [firstTaskPage, habitData, progressData, goalData, projectData] = await Promise.all([
    api<TaskPage>("/tasks?limit=100"),
    api<{ habits: Habit[] }>("/habits"),
    api<WeeklySummary>("/progress/weekly"),
    api<{ goals: Goal[] }>("/goals"),
    api<{ projects: Project[] }>("/projects")
  ]);
  ```
  After loading the first task page, it computes additional pages and issues further HTTP calls:
  ```tsx
  laterPages = await Promise.all(
    Array.from({ length: Math.max(0, Math.ceil(firstTaskPage.total / firstTaskPage.limit) - 1) },
      (_, index) => api<TaskPage>(`/tasks?limit=${firstTaskPage.limit}&page=${index + 2}`)
    )
  );
  ```
  It then issues calls for focus sessions and gamification summaries.
- **Impact:** Checking off a single task sends **between 7 and 12 HTTP requests** to the server, re-fetching all unarchived projects, goals, habits, weekly progress, and tasks. Under poor mobile connectivity, this exhausts bandwidth and causes UI flicker.

### 2.3 N+1 HTTP Request Pattern on Habits Screen
- **Location:** `apps/mobile/src/components/HabitsScreen.tsx:54-61`
- **Finding:** Upon navigating to the Habits screen, the component loops through every habit in the user's list and fires individual HTTP requests for `/analytics`:
  ```tsx
  void Promise.all(habits.map(async (habit) => {
    try {
      const value = await api<HabitStats>(`/habits/${habit._id}/analytics?from=${from}&to=${today}`);
      return [habit._id, value] as const;
    } catch { return null; }
  }))
  ```
- **Impact:** If a user tracks 15 habits, mounting the screen triggers 15 simultaneous network calls. On the backend, each call executes 5 database queries. A single screen view generates 75 database lookups.
- **Remediation:** Introduce a single batch endpoint `GET /api/habits/analytics?from=...&to=...` returning analytics for all habits in one database aggregation.

### 2.4 Lack of Error Boundaries
- **Finding:** No React `ErrorBoundary` exists in `apps/mobile/app/_layout.tsx` or `app/index.tsx`.
- **Impact:** Any unhandled JavaScript error or malformed payload in date parsing (`dateParts`, `dateAtTimezone`) causes the entire mobile application to crash to the home screen with a white screen.

---

## 3. Backend Engineering Audit (`apps/api`)

### 3.1 Controller / Service / Repository Separation
- **Finding:** Route handlers in `apps/api/src/routes/*.ts` directly instantiate Mongoose queries, parse request bodies, execute business logic, call third-party services, and format HTTP responses.
- **Example (`apps/api/src/routes/tasks.routes.ts:61-88`):**
  - Performs Zod validation.
  - Queries `Task.findOne` for idempotency.
  - Queries `Project.exists` and `Task.exists` for foreign key checks.
  - Inserts `Task.create`.
  - Inserts `TaskPlanSnapshot.create`.
  - Queries `User.findById` for timezone.
  - Inserts `TaskCompletion.create`.
  - Calls `awardXp`.
  - Formats HTTP response.
- **Weakness:** Route logic cannot be reused or unit-tested in isolation without mocking the entire Express request/response pipeline and Mongoose model prototypes.
- **Remediation:** Separate into:
  1. `Controllers`: Extract HTTP params, validate with Zod, send HTTP status.
  2. `Services`: Pure business logic (e.g. `TaskService.createTask`, `HabitService.checkIn`).
  3. `Repositories`: Mongoose database access and transaction coordination.

### 3.2 Error Handling Anti-Pattern in Global Middleware
- **Location:** `apps/api/src/middleware/errors.ts:22-25`
- **Code:**
  ```ts
  if (error && typeof error === "object" && "code" in error && error.code === 11000) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }
  ```
- **Finding:** MongoDB error code `11000` is the generic duplicate key error code for *any* unique index violation across the entire database.
- **Impact:** When a unique index constraint fails on `HabitCompletion` (`{ user: 1, habit: 1, localDate: 1 }`), `Task` (`clientMutationId`), or `XPTransaction` (`eventKey`), the API reports to the client that "An account with this email already exists". This obscures the real error and confuses the user interface.
- **Remediation:** Inspect `(error as any).keyPattern` or `(error as any).keyValue`:
  ```ts
  if (error && typeof error === "object" && "code" in error && error.code === 11000) {
    const keyPattern = (error as { keyPattern?: Record<string, number> }).keyPattern;
    if (keyPattern?.email) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    res.status(409).json({ error: "Duplicate entity or transaction detected.", details: keyPattern });
    return;
  }
  ```

### 3.3 Missing Database Transactions (Atomicity Failure)
- **Location:**
  - `apps/api/src/routes/tasks.routes.ts:115-125`
  - `apps/api/src/routes/habits.routes.ts:146-163`
  - `apps/api/src/services/gamification.ts:13-14`
- **Finding:** Operations that modify multiple documents are executed as sequential independent queries without a session transaction (`mongoose.startSession()`).
- **Impact:** In `awardXp`:
  ```ts
  await XPTransaction.create({ ...transaction, user: userId });
  await UserGamification.updateOne({ user: userId }, { $inc: { totalXp: input.amount } }, { upsert: true });
  ```
  If the process crashes or MongoDB connectivity drops between line 13 and line 14, the XP transaction is recorded, but the user's cumulative level/XP is never incremented.

---

## 4. Technical Debt & Code Smells Inventory

| Item ID | Location | Smell / Debt Description | Recommended Refactoring |
| :--- | :--- | :--- | :--- |
| **DEBT-01** | `apps/mobile/app/index.tsx:515-524` | Massive StyleSheet definition (10 lines of densely minified CSS-in-JS rules). | Extract styles to dedicated module `styles/home.styles.ts` or component-level stylesheets. |
| **DEBT-02** | `apps/api/src/services/dateMetrics.ts:30, 56` | Magic iterative approximation loop (5 attempts) to resolve timezone offsets using `Intl.DateTimeFormat`. | Add clear inline documentation and unit tests covering all known edge-case offsets (e.g. Lord Howe Island +10:30/+11:00). |
| **DEBT-03** | `apps/mobile/src/lib/api.ts:18` | Hardcoded cache prefixes `"hyper_track_api_cache:"` scattered across multiple files (`localStore.native.ts`, `offlineMutations.ts`). | Consolidate into a central constants configuration file. |
| **DEBT-04** | `apps/api/src/routes/tasks.routes.ts:126-129` | Inverted boolean condition `undone === false && input.status && input.status !== "done"` triggers duplicate `reverseXp` lookups on non-done status transitions. | Simplify status transition state machine (explicitly check `current.status === 'done' && input.status !== 'done'`). |
| **DEBT-05** | `apps/mobile/src/database/localStore.ts` | Dead Node.js mock fallback that throws "No local-store platform adapter is available". | Replace with an in-memory SQLite (`better-sqlite3` or memory adapter) for headless unit testing. |

