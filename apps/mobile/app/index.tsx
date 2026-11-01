import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api, clearOfflineApiData, isApiOffline } from "../src/lib/api";
import { clearToken, getToken, saveRefreshToken, saveToken } from "../src/lib/auth";
import { clearAllTaskReminders, clearTaskReminder, configureNotifications, ensureTaskReminder, setTaskReminder } from "../src/lib/notifications";
import type { AuthUserDTO, DailyProgressDTO, GoalDTO, HabitDTO, ProjectDTO, TaskDTO } from "@hyper-track/shared";
import { useAppTheme, type ThemeMode } from "../src/theme/theme";
import { ProgressBar } from "../src/components/ui";
import type { AppDestination } from "../src/components/AppNavigation";
import { AppShell } from "../src/components/AppShell";
import { Dashboard } from "../src/components/Dashboard";
import { TaskManagementScreen, type TaskDraft, type TaskEditorKey, type TaskRecord } from "../src/components/TaskManagementScreen";
import { ProjectsScreen } from "../src/components/ProjectsScreen";
import { HabitsScreen, type HabitDraft } from "../src/components/HabitsScreen";
import { GoalsScreen } from "../src/components/GoalsScreen";
import { CalendarScreen } from "../src/components/CalendarScreen";

type User = AuthUserDTO;
type Task = Omit<TaskDTO, "project" | "parentTask"> & {
  project?: { _id: string; name: string } | null;
  parentTask?: { _id: string; title: string } | null;
  archivedAt?: string | null;
};
type Habit = HabitDTO;
type Goal = GoalDTO;
type Project = ProjectDTO;
type AuthResponse = { user: User; token: string; refreshToken: string };
type WeeklySummary = { timezone: string; days: DailyProgressDTO[]; totals: { tasksCompleted: number; habitCompletions: number } };
type FocusDTO = { _id: string; startedAt: string; plannedMinutes: number; status: "active" | "completed" | "cancelled" };
type GameSummary = { totalXp: number; level: number; levelName: string; currentLevelXp: number; nextLevelXp: number; progress: number; currentStreak: number; longestStreak: number; achievements: Array<{ id: string; name: string; description: string; unlocked: boolean }>; challenges: Array<{ title: string; description: string; progress: number; target: number; completed: boolean }>; recentTransactions?: Array<{ localDate: string; amount: number }> };
type TaskPage = { tasks: Task[]; total: number; limit: number; page: number };

const today = (timezone?: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

const dateParts = (date: Date, timezone?: string) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));

const dateAtTimezone = (date: string, time: string, timezone?: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let guess = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = dateParts(new Date(guess), timezone);
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    guess += desired - represented;
  }
  const result = new Date(guess);
  const verified = dateParts(result, timezone);
  if (Number(verified.year) !== year || Number(verified.month) !== month || Number(verified.day) !== day || Number(verified.hour) !== hour || Number(verified.minute) !== minute) {
    throw new Error("That date and time is not valid in your timezone.");
  }
  return result;
};

const localDateOf = (value: string, timezone?: string) => {
  const parts = dateParts(new Date(value), timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const toLocalDateTimeInput = (value?: string | null, timezone?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = dateParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

export default function HomeScreen() {
  const { colors, mode, setMode } = useAppTheme();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskCoveragePartial, setTaskCoveragePartial] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newHabit, setNewHabit] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [goalTargetDate, setGoalTargetDate] = useState("");
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [newProject, setNewProject] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [newMilestone, setNewMilestone] = useState("");
  const [milestoneGoalId, setMilestoneGoalId] = useState<string | null>(null);
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null);
  const [taskParentId, setTaskParentId] = useState<string | null>(null);
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPlannedDate, setTaskPlannedDate] = useState("");
  const [taskReminderAt, setTaskReminderAt] = useState("");
  const [taskRecurrence, setTaskRecurrence] = useState<"none" | "daily" | "weekly">("none");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<"all" | "low" | "medium" | "high">("all");
  const [habitFrequency, setHabitFrequency] = useState<"daily" | "weekly">("daily");
  const [habitTarget, setHabitTarget] = useState(3);
  const [habitDays, setHabitDays] = useState<number[]>([]);
  const [habitCategory, setHabitCategory] = useState("Personal");
  const [habitDifficulty, setHabitDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editingHabit, setEditingHabit] = useState<string | null>(null);
  const [tab, setTab] = useState<AppDestination>("overview");
  const [profileSection, setProfileSection] = useState<"progress" | "settings">("settings");
  const [selectedDate, setSelectedDate] = useState(today());
  const [focusSession, setFocusSession] = useState<FocusDTO | null>(null);
  const [gameSummary, setGameSummary] = useState<GameSummary | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<"day" | "week" | "month">("week");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [, setClockTick] = useState(0);
  const [profileName, setProfileName] = useState("");
  const [profileTimezone, setProfileTimezone] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isOffline, setIsOffline] = useState(false);

  async function loadData() {
    const [firstTaskPage, habitData, progressData, goalData, projectData] = await Promise.all([
      api<TaskPage>("/tasks?limit=100"), api<{ habits: Habit[] }>("/habits"), api<WeeklySummary>("/progress/weekly"), api<{ goals: Goal[] }>("/goals"), api<{ projects: Project[] }>("/projects")
    ]);
    let laterPages: TaskPage[] = [];
    setTaskCoveragePartial(false);
    try {
      laterPages = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(firstTaskPage.total / firstTaskPage.limit) - 1) }, (_, index) => api<TaskPage>(`/tasks?limit=${firstTaskPage.limit}&page=${index + 2}`)));
    } catch (error) {
      if (!isApiOffline()) throw error;
      setTaskCoveragePartial(firstTaskPage.total > firstTaskPage.limit);
    }
    const allTasks = [ ...firstTaskPage.tasks, ...laterPages.flatMap((page) => page.tasks) ];
    setTasks(allTasks); setHabits(habitData.habits); setWeekly(progressData); setGoals(goalData.goals); setProjects(projectData.projects);
    try { const focus = await api<{ active: FocusDTO | null }>("/focus"); setFocusSession(focus.active); } catch { /* Focus is optional when offline. */ }
    try { setGameSummary(await api<GameSummary>("/gamification")); } catch { /* Keep the core dashboard usable if rewards are temporarily unavailable. */ }
    await Promise.all(allTasks.filter((task) => !task._id.startsWith("local-") && task.reminderAt).map((task) => ensureTaskReminder(task._id, task.title, task.reminderAt).catch(() => undefined)));
    setIsOffline(isApiOffline());
  }

  function resetTaskForm() {
    setNewTask(""); setEditingTask(null); setTaskDueDate(""); setTaskPlannedDate(""); setTaskReminderAt(""); setTaskProjectId(null); setTaskParentId(null); setTaskPriority("medium"); setTaskRecurrence("none");
  }

  function resetHabitForm() {
    setNewHabit(""); setEditingHabit(null); setHabitFrequency("daily"); setHabitTarget(3); setHabitDays([]); setHabitCategory("Personal"); setHabitDifficulty("medium");
  }

  function updateTaskDraft(key: TaskEditorKey, value: TaskDraft[TaskEditorKey]) {
    if (key === "title") setNewTask(value as string);
    else if (key === "priority") setTaskPriority(value as TaskDraft["priority"]);
    else if (key === "dueDate") setTaskDueDate(value as string);
    else if (key === "plannedDate") setTaskPlannedDate(value as string);
    else if (key === "reminderAt") setTaskReminderAt(value as string);
    else if (key === "recurrence") setTaskRecurrence(value as TaskDraft["recurrence"]);
    else if (key === "projectId") setTaskProjectId(value as string | null);
    else if (key === "parentTaskId") setTaskParentId(value as string | null);
  }

  function updateHabitDraft(key: keyof HabitDraft, value: HabitDraft[keyof HabitDraft]) {
    if (key === "name") setNewHabit(value as string);
    else if (key === "category") setHabitCategory(value as string);
    else if (key === "frequency") setHabitFrequency(value as HabitDraft["frequency"]);
    else if (key === "target") setHabitTarget(value as number);
    else if (key === "days") setHabitDays(value as number[]);
    else if (key === "difficulty") setHabitDifficulty(value as HabitDraft["difficulty"]);
  }

  function beginEditTask(task: Task) {
    setEditingTask(task._id); setNewTask(task.title); setTaskPriority(task.priority); setTaskPlannedDate(task.plannedDate ?? "");
    setTaskDueDate(task.dueDate ? localDateOf(task.dueDate, user?.timezone) : ""); setTaskReminderAt(toLocalDateTimeInput(task.reminderAt, user?.timezone));
    setTaskRecurrence(task.recurrence ?? "none"); setTaskProjectId(task.project?._id ?? null); setTaskParentId(task.parentTask?._id ?? null);
  }

  function beginEditHabit(habit: Habit) {
    setEditingHabit(habit._id); setNewHabit(habit.name); setHabitFrequency(habit.frequency); setHabitTarget(habit.targetPerWeek);
    setHabitDays(habit.daysOfWeek ?? []); setHabitCategory(habit.category ?? "Personal"); setHabitDifficulty(habit.difficulty ?? "medium");
  }

  useEffect(() => {
    void configureNotifications().catch(() => undefined);
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const result = await api<{ user: User }>("/auth/me");
          setUser(result.user);
          setSelectedDate(today(result.user.timezone));
          setProfileName(result.user.name); setProfileTimezone(result.user.timezone ?? "UTC");
          await loadData();
        }
      } catch { await clearToken(); await clearOfflineApiData(); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!user || tab !== "profile" || profileSection !== "progress") return;
    const end = today(user.timezone); const date = new Date(`${end}T12:00:00Z`);
    if (analyticsRange === "week") date.setUTCDate(date.getUTCDate() - 6);
    if (analyticsRange === "month") date.setUTCDate(1);
    const from = date.toISOString().slice(0, 10);
    void api<WeeklySummary>(`/progress/summary?from=${from}&to=${end}`).then(setWeekly).catch((e) => showError(e));
  }, [user, tab, profileSection, analyticsRange]);
  useEffect(() => { if (!focusSession) return; const timer = setInterval(() => setClockTick(Date.now()), 1000); return () => clearInterval(timer); }, [focusSession]);

  async function startFocus() {
    try { const result = await api<{ session: FocusDTO }>("/focus", { method: "POST", body: JSON.stringify({ plannedMinutes: focusMinutes }) }); setFocusSession(result.session); }
    catch (e) { showError(e); }
  }
  async function finishFocus(status: "completed" | "cancelled") {
    if (!focusSession) return;
    try { await api(`/focus/${focusSession._id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setFocusSession(null); }
    catch (e) { showError(e); }
  }

  async function submitAuth() {
    setBusy(true); setError(""); setNotice("");
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const result = await api<AuthResponse>(`/auth/${authMode}`, {
        method: "POST", body: JSON.stringify(authMode === "register" ? { name, email, password, timezone } : { email, password })
      });
      await Promise.all([saveToken(result.token), saveRefreshToken(result.refreshToken)]); setUser(result.user); setProfileName(result.user.name); setProfileTimezone(result.user.timezone ?? "UTC"); setPassword(""); await loadData();
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  }

  async function addTask() {
    if (!newTask.trim()) return;
    try {
      if (taskDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(taskDueDate)) throw new Error("Enter the due date as YYYY-MM-DD.");
      const dueDate = taskDueDate ? dateAtTimezone(taskDueDate, "12:00", user?.timezone).toISOString() : null;
      if (taskPlannedDate && !/^\d{4}-\d{2}-\d{2}$/.test(taskPlannedDate)) throw new Error("Enter the plan date as YYYY-MM-DD.");
      if (taskPlannedDate) dateAtTimezone(taskPlannedDate, "12:00", user?.timezone);
      const plannedDate = taskPlannedDate || (tab === "calendar" && !editingTask ? selectedDate : tab === "overview" && !editingTask ? today(user?.timezone) : null);
      if (taskReminderAt && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(taskReminderAt)) throw new Error("Enter a reminder as YYYY-MM-DD HH:mm.");
      const reminderDate = taskReminderAt ? dateAtTimezone(...taskReminderAt.split(" ") as [string, string], user?.timezone) : null;
      if (reminderDate && reminderDate.getTime() <= Date.now()) throw new Error("Choose a reminder time in the future.");
      const reminderAt = reminderDate?.toISOString() ?? null;
      const input = { title: newTask.trim(), priority: taskPriority, dueDate, plannedDate, reminderAt, recurrence: taskRecurrence, projectId: taskProjectId, parentTaskId: taskParentId };
      const result = editingTask
        ? await api<{ task: Task }>(`/tasks/${editingTask}`, { method: "PATCH", body: JSON.stringify(input) })
        : await api<{ task: Task }>("/tasks", { method: "POST", body: JSON.stringify(input) });
      if (result.task._id.startsWith("local-")) {
        if (reminderAt) showError("Task saved for sync. Its reminder will be scheduled once the task reaches the server.");
      } else {
        try { await setTaskReminder(result.task._id, result.task.title, reminderAt); } catch (e) { showError(e); }
      }
      resetTaskForm(); await loadData();
    }
    catch (e) { showError(e); }
  }

  async function deleteTask(task: Task) {
    try { await api(`/tasks/${task._id}`, { method: "DELETE" }); await Promise.all([task, ...tasks.filter((item) => item.parentTask?._id === task._id)].map((item) => clearTaskReminder(item._id))); if (editingTask === task._id) { setEditingTask(null); setNewTask(""); } await loadData(); }
    catch (e) { showError(e); }
  }

  async function toggleTask(task: Task) {
    try {
      await api(`/tasks/${task._id}`, { method: "PATCH", body: JSON.stringify({ status: task.status === "done" ? "todo" : "done" }) });
      if (task.status === "done") {
        if (task.reminderAt && new Date(task.reminderAt).getTime() > Date.now()) await setTaskReminder(task._id, task.title, task.reminderAt);
      } else await clearTaskReminder(task._id);
      await loadData();
    }
    catch (e) { showError(e); }
  }

  async function addHabit() {
    if (!newHabit.trim()) return;
    try {
      const input = { name: newHabit.trim(), category: habitCategory.trim() || "Personal", difficulty: habitDifficulty, frequency: habitFrequency, targetPerWeek: habitFrequency === "daily" ? 7 : habitTarget, daysOfWeek: habitFrequency === "daily" ? [] : habitDays };
      if (editingHabit) await api(`/habits/${editingHabit}`, { method: "PATCH", body: JSON.stringify(input) });
      else await api("/habits", { method: "POST", body: JSON.stringify(input) });
      resetHabitForm(); await loadData();
    }
    catch (e) { showError(e); }
  }

  async function deleteHabit(habit: Habit) {
    try { await api(`/habits/${habit._id}`, { method: "DELETE" }); if (editingHabit === habit._id) { setEditingHabit(null); setNewHabit(""); } await loadData(); }
    catch (e) { showError(e); }
  }

  async function saveProfile() {
    try {
      const result = await api<{ user: User }>("/auth/me", { method: "PATCH", body: JSON.stringify({ name: profileName.trim(), timezone: profileTimezone.trim() }) });
      setUser(result.user); setError(""); setNotice("Profile saved."); await loadData();
    } catch (e) { showError(e); }
  }

  async function createGoal() {
    if (!newGoal.trim()) return;
    try {
      if (goalTargetDate && !/^\d{4}-\d{2}-\d{2}$/.test(goalTargetDate)) throw new Error("Enter the goal date as YYYY-MM-DD.");
      const targetDate = goalTargetDate ? dateAtTimezone(goalTargetDate, "12:00", user?.timezone).toISOString() : null;
      const payload = JSON.stringify({ title: newGoal.trim(), targetDate });
      if (editingGoalId) await api(`/goals/${editingGoalId}`, { method: "PATCH", body: payload });
      else await api("/goals", { method: "POST", body: payload });
      setNewGoal(""); setGoalTargetDate(""); setEditingGoalId(null); await loadData();
    }
    catch (e) { showError(e); }
  }

  async function createProject() {
    if (!newProject.trim()) return;
    try {
      const body = JSON.stringify({ name: newProject.trim() });
      if (editingProjectId) await api(`/projects/${editingProjectId}`, { method: "PATCH", body });
      else await api("/projects", { method: "POST", body });
      setNewProject(""); setEditingProjectId(null); await loadData();
    }
    catch (e) { showError(e); }
  }

  async function updateProjectStatus(project: Project, status: "active" | "completed") {
    try { await api(`/projects/${project._id}`, { method: "PATCH", body: JSON.stringify({ status }) }); await loadData(); }
    catch (e) { showError(e); }
  }

  async function archiveProject(project: Project) {
    try { await api(`/projects/${project._id}`, { method: "DELETE" }); await loadData(); }
    catch (e) { showError(e); }
  }

  async function toggleGoalStatus(goal: Goal) {
    try { await api(`/goals/${goal._id}`, { method: "PATCH", body: JSON.stringify({ status: goal.status === "completed" ? "active" : "completed" }) }); await loadData(); }
    catch (e) { showError(e); }
  }

  async function archiveGoal(goal: Goal) {
    try { await api(`/goals/${goal._id}`, { method: "DELETE" }); await loadData(); }
    catch (e) { showError(e); }
  }

  async function addMilestone(goalId: string) {
    if (!newMilestone.trim()) return;
    try { await api(`/goals/${goalId}/milestones`, { method: "POST", body: JSON.stringify({ title: newMilestone.trim() }) }); setNewMilestone(""); setMilestoneGoalId(null); await loadData(); }
    catch (e) { showError(e); }
  }

  async function toggleMilestone(goal: Goal, milestone: Goal["milestones"][number]) {
    try { await api(`/goals/${goal._id}/milestones/${milestone._id}`, { method: "PATCH", body: JSON.stringify({ completed: !milestone.completedAt }) }); await loadData(); }
    catch (e) { showError(e); }
  }

  async function toggleHabit(habit: Habit) {
    const done = habit.completions.includes(today(user?.timezone));
    try {
      if (done) await api(`/habits/${habit._id}/completions/${today(user?.timezone)}`, { method: "DELETE" });
      else await api(`/habits/${habit._id}/completions`, { method: "POST", body: JSON.stringify({ date: today(user?.timezone) }) });
      await loadData();
    } catch (e) { showError(e); }
  }

  async function showHabitAnalytics(habit: Habit) {
    const end = today(user?.timezone);
    const startDate = new Date(`${end}T12:00:00Z`); startDate.setUTCDate(1);
    try {
      const stats = await api<{ totalCompletions: number; completionPercent: number | null; currentStreak: number | null; bestWeekday: string | null; missedScheduledDays: string[] }>(`/habits/${habit._id}/analytics?from=${startDate.toISOString().slice(0, 10)}&to=${end}`);
      Alert.alert(`${habit.name} · this month`, `${stats.totalCompletions} check-ins · ${stats.completionPercent ?? 0}% scheduled days${stats.currentStreak === null ? "" : ` · ${stats.currentStreak} day streak`}${stats.bestWeekday ? ` · best day: ${stats.bestWeekday}` : ""}${stats.missedScheduledDays.length ? ` · ${stats.missedScheduledDays.length} missed scheduled days` : ""}`);
    } catch (e) { showError(e); }
  }

  function showError(e: unknown) {
    setNotice("");
    const message = e instanceof Error ? e.message : "Something went wrong";
    if (Platform.OS === "web") setError(message); else Alert.alert("Hyper Track", message);
  }

  async function logout() { try { await api("/auth/logout", { method: "POST" }); } catch { /* Local sign out should work offline. */ } await clearAllTaskReminders(); await clearOfflineApiData(); await clearToken(); setIsOffline(false); setUser(null); setTasks([]); setHabits([]); setWeekly(null); setGoals([]); setProjects([]); }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#A5B4FC" /><Text style={styles.muted}>Loading Hyper Track…</Text></View>;

  if (!user) return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.authWrap} keyboardShouldPersistTaps="handled">
      <View style={styles.logo}><Text style={styles.logoText}>H</Text></View>
      <Text style={styles.brand}>HYPER TRACK</Text>
      <Text style={styles.heading}>{authMode === "login" ? "Welcome back." : "Build your momentum."}</Text>
      <Text style={styles.muted}>Make every day count.</Text>
      {authMode === "register" && <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor="#727B95" style={styles.input} autoCapitalize="words" />}
      <TextInput value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor="#727B95" style={styles.input} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <TextInput value={password} onChangeText={setPassword} placeholder="Password (8+ characters)" placeholderTextColor="#727B95" style={styles.input} secureTextEntry autoComplete={authMode === "login" ? "current-password" : "new-password"} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!notice && <Text style={styles.success}>{notice}</Text>}
      <Pressable onPress={submitAuth} disabled={busy || !email.trim() || password.length < 8 || (authMode === "register" && name.trim().length < 2)} style={({ pressed }) => [styles.primary, pressed && styles.pressed, busy && styles.disabled]}>
        {busy ? <ActivityIndicator color="#0B1020" /> : <Text style={styles.primaryText}>{authMode === "login" ? "Sign in" : "Create account"}</Text>}
      </Pressable>
      <Pressable onPress={() => { setAuthMode(authMode === "login" ? "register" : "login"); setError(""); }} style={styles.switchAuth}>
        <Text style={styles.muted}>{authMode === "login" ? "New here? " : "Already have an account? "}<Text style={[styles.link, { color: colors.primary }]}>{authMode === "login" ? "Create account" : "Sign in"}</Text></Text>
      </Pressable>
    </ScrollView>
  </KeyboardAvoidingView>;

  const filteredTasks = tasks.filter((task) => (!taskSearch.trim() || task.title.toLowerCase().includes(taskSearch.trim().toLowerCase())) && (taskPriorityFilter === "all" || task.priority === taskPriorityFilter));
  const localToday = today(user?.timezone);
  const completedHabits = habits.filter((habit) => habit.completions.includes(localToday)).length;
  const greetingHour = Number(dateParts(new Date(), user?.timezone).hour);
  const timeGreeting = greetingHour < 12 ? "Good morning" : greetingHour < 17 ? "Good afternoon" : "Good evening";

  const taskDraft: TaskDraft = { title: newTask, priority: taskPriority, dueDate: taskDueDate, plannedDate: taskPlannedDate, reminderAt: taskReminderAt, recurrence: taskRecurrence, projectId: taskProjectId, parentTaskId: taskParentId };
  const habitDraft: HabitDraft = { name: newHabit, category: habitCategory, frequency: habitFrequency, target: habitTarget, days: habitDays, difficulty: habitDifficulty };
  const selectDestination = (destination: AppDestination) => { setTab(destination); if (destination === "profile") setProfileSection("settings"); resetTaskForm(); resetHabitForm(); setNewGoal(""); setGoalTargetDate(""); setEditingGoalId(null); };
  return <AppShell active={tab} onSelect={selectDestination} name={user.name} email={user.email}>
    <ScrollView contentContainerStyle={tab === "overview" || tab === "tasks" || tab === "projects" || tab === "habits" || tab === "goals" ? { flexGrow: 1 } : styles.page} keyboardShouldPersistTaps="handled">
      {tab === "overview" ? <Dashboard
        name={user.name}
        today={localToday}
        timezone={user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
        tasks={tasks}
        taskCoveragePartial={taskCoveragePartial}
        habits={habits}
        weekly={weekly}
        game={gameSummary}
        isOffline={isOffline}
        onTaskToggle={(id) => { const task = tasks.find((item) => item._id === id); if (task) void toggleTask(task); }}
        onHabitToggle={(id) => { const habit = habits.find((item) => item._id === id); if (habit) void toggleHabit(habit); }}
        onNavigate={selectDestination}
        onAddTask={() => { selectDestination("tasks"); setTaskPlannedDate(localToday); }}
        focus={focusSession}
        focusRemaining={focusSession ? Math.max(0, Math.ceil((focusSession.plannedMinutes * 60 - (Date.now() - new Date(focusSession.startedAt).getTime()) / 1000) / 60)) : null}
        focusMinutes={focusMinutes}
        onFocusMinutes={setFocusMinutes}
        onStartFocus={() => void startFocus()}
        onFinishFocus={(status) => void finishFocus(status)}
      /> : tab === "tasks" ? <TaskManagementScreen tasks={tasks} projects={projects} timezone={user.timezone || "UTC"} today={localToday} draft={taskDraft} editingId={editingTask} error={error} onDraftChange={updateTaskDraft} onSubmit={() => void addTask()} onReset={resetTaskForm} onEdit={(task) => beginEditTask(task as Task)} onToggle={(task) => void toggleTask(task as Task)} onArchive={(task) => void deleteTask(task as Task)} />
        : tab === "projects" ? <ProjectsScreen projects={projects} tasks={tasks} timezone={user.timezone || "UTC"} today={localToday} editingId={editingProjectId} name={newProject} onNameChange={setNewProject} onSave={() => void createProject()} onCancelEdit={() => { setEditingProjectId(null); setNewProject(""); }} onEdit={(project) => { setEditingProjectId(project._id); setNewProject(project.name); }} onStatusChange={(project, status) => void updateProjectStatus(project, status)} onArchive={(project) => void archiveProject(project)} error={error} />
          : tab === "habits" ? <HabitsScreen habits={habits} today={localToday} timezone={user.timezone || "UTC"} draft={habitDraft} editingId={editingHabit} error={error} onDraftChange={updateHabitDraft} onSave={() => void addHabit()} onCancelEdit={resetHabitForm} onToggle={(habit) => void toggleHabit(habit as Habit)} onArchive={(habit) => void deleteHabit(habit as Habit)} onEdit={(habit) => beginEditHabit(habit as Habit)} />
            : tab === "goals" ? <GoalsScreen goals={goals} timezone={user.timezone || "UTC"} title={newGoal} targetDate={goalTargetDate} editingId={editingGoalId} newMilestone={newMilestone} milestoneGoalId={milestoneGoalId} error={error} onTitleChange={setNewGoal} onTargetDateChange={setGoalTargetDate} onMilestoneChange={setNewMilestone} onSave={() => void createGoal()} onCancelEdit={() => { setEditingGoalId(null); setNewGoal(""); setGoalTargetDate(""); }} onEdit={(goal) => { setEditingGoalId(goal._id); setNewGoal(goal.title); setGoalTargetDate(goal.targetDate ? localDateOf(goal.targetDate, user?.timezone) : ""); }} onToggleGoal={(goal) => void toggleGoalStatus(goal as Goal)} onArchive={(goal) => void archiveGoal(goal as Goal)} onAddMilestone={(goalId) => void addMilestone(goalId)} onSelectMilestoneGoal={setMilestoneGoalId} onToggleMilestone={(goal, milestone) => void toggleMilestone(goal as Goal, milestone)} /> : <>
      <View style={styles.topRow}>
        <View><Text style={styles.brandSmall}>HYPER TRACK</Text><Text style={[styles.greeting, { color: colors.text }]}>{timeGreeting}, {user.name.split(" ")[0]} 👋</Text><Text style={styles.statLabel}>{new Date(`${localToday}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</Text></View>
        <Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>Log out</Text></Pressable>
      </View>
      {isOffline && <Text style={styles.offlineNotice}>Offline · new tasks and habits will sync when you reconnect. Other changes need a connection.</Text>}
      {tab === "calendar" && <CalendarScreen today={localToday} timezone={user.timezone || "UTC"} tasks={tasks} initialDate={selectedDate} onDateChange={setSelectedDate} onCreateTask={(date) => { resetTaskForm(); setTaskPlannedDate(date); setTab("tasks"); }} onEditTask={(task) => { setTab("tasks"); beginEditTask(task as Task); }} onToggleTask={(task) => toggleTask(task as Task)} onOpenProject={() => selectDestination("projects")} />}
      {tab === "profile" && <View style={styles.section}><View style={styles.optionRow}>{(["progress", "settings"] as const).map((value) => <Pressable key={value} onPress={() => setProfileSection(value)} style={[styles.optionPill, profileSection === value && styles.optionPillActive]}><Text style={[styles.optionPillText, profileSection === value && styles.optionPillTextActive]}>{value}</Text></Pressable>)}</View><View style={[styles.optionRow, { marginTop: 10 }]}>{(["projects", "goals"] as const).map((destination) => <Pressable key={destination} accessibilityRole="button" onPress={() => selectDestination(destination)} style={styles.optionPill}><Text style={styles.optionPillText}>{destination}</Text></Pressable>)}</View></View>}
      {tab === "profile" && profileSection === "progress" && <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.text }]}>Insights</Text><View style={styles.optionRow}>{(["day", "week", "month"] as const).map((value) => <Pressable key={value} onPress={() => setAnalyticsRange(value)} style={[styles.optionPill, analyticsRange === value && styles.optionPillActive]}><Text style={[styles.optionPillText, analyticsRange === value && styles.optionPillTextActive]}>{value}</Text></Pressable>)}</View><Text style={[styles.progressTotals, { color: colors.textMuted }]}>{weekly?.totals.tasksCompleted ?? 0} tasks completed · {weekly?.totals.habitCompletions ?? 0} habit check-ins</Text>{weekly?.days.map((day) => { const intensity = Math.min(1, (day.tasksCompleted + day.habitsCompleted) / 6); const date = new Date(`${day.date}T12:00:00Z`); const label = analyticsRange === "day" ? "Today" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }); return <View key={day.date} style={styles.dayRow}><Text style={styles.dayLabel}>{label}</Text><View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(4, intensity * 100)}%` }]} /></View><Text style={styles.dayCount}>{day.tasksCompleted + day.habitsCompleted}</Text></View>; })}</View>}
      {tab === "profile" && profileSection === "progress" && gameSummary && <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.text }]}>Challenges & achievements</Text>{gameSummary.challenges.map((challenge) => <View key={challenge.title} style={styles.goalCard}><Text style={[styles.itemTitle, { color: colors.text }]}>{challenge.completed ? "✓  " : "○  "}{challenge.title}</Text><Text style={[styles.itemMeta, { color: colors.textMuted }]}>{challenge.description} · {challenge.progress}/{challenge.target}</Text><ProgressBar value={challenge.progress / challenge.target * 100} /></View>)}{gameSummary.achievements.map((achievement) => <View key={achievement.id} style={styles.milestoneRow}><Text style={styles.milestoneMark}>{achievement.unlocked ? "🏅" : "○"}</Text><View><Text style={[styles.itemTitle, { color: colors.text }]}>{achievement.name}</Text><Text style={[styles.itemMeta, { color: colors.textMuted }]}>{achievement.description}</Text></View></View>)}</View>}
      {tab === "profile" && profileSection === "settings" && <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.text }]}>Profile & settings</Text><Text style={styles.optionLabel}>Appearance</Text><View style={styles.optionRow}>{(["system", "light", "dark"] as ThemeMode[]).map((value) => <Pressable key={value} onPress={() => setMode(value)} accessibilityState={{ selected: mode === value }} style={[styles.optionPill, mode === value && styles.optionPillActive]}><Text style={[styles.optionPillText, mode === value && styles.optionPillTextActive]}>{value}</Text></Pressable>)}</View><Text style={styles.optionLabel}>Name</Text><TextInput value={profileName} onChangeText={setProfileName} placeholder="Your name" placeholderTextColor="#727B95" style={styles.input} /><Text style={[styles.optionLabel, { marginTop: 16 }]}>Timezone (IANA name)</Text><TextInput value={profileTimezone} onChangeText={setProfileTimezone} placeholder="e.g. Asia/Kolkata" placeholderTextColor="#727B95" style={styles.input} autoCapitalize="none" /><Text style={[styles.settingsEmail, { color: colors.textMuted }]}>{user.email}</Text><Pressable onPress={saveProfile} style={styles.primary}><Text style={styles.primaryText}>Save profile</Text></Pressable></View>}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.footer}>ONE DAY AT A TIME · KEEP GOING</Text>
      </>}
    </ScrollView>
  </AppShell>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1020" }, center: { flex: 1, backgroundColor: "#0B1020", alignItems: "center", justifyContent: "center", gap: 14 },
  authWrap: { flexGrow: 1, justifyContent: "center", padding: 26, paddingTop: 56 }, logo: { width: 54, height: 54, borderRadius: 18, backgroundColor: "#A5B4FC", alignItems: "center", justifyContent: "center", marginBottom: 20 }, logoText: { color: "#0B1020", fontSize: 28, fontWeight: "900" },
  brand: { color: "#A5B4FC", letterSpacing: 3, fontSize: 12, fontWeight: "800", marginBottom: 30 }, heading: { color: "#F4F6FF", fontSize: 32, fontWeight: "800", letterSpacing: -1, marginBottom: 8 }, muted: { color: "#929BB4", fontSize: 14, lineHeight: 22 }, input: { backgroundColor: "#151C30", borderColor: "#29324A", borderWidth: 1, borderRadius: 14, color: "#F4F6FF", paddingHorizontal: 15, paddingVertical: 14, fontSize: 15, marginTop: 14 },
  primary: { backgroundColor: "#A5B4FC", borderRadius: 14, alignItems: "center", justifyContent: "center", padding: 16, marginTop: 22, minHeight: 54 }, primaryText: { color: "#0B1020", fontWeight: "800", fontSize: 15 }, pressed: { opacity: 0.8 }, disabled: { opacity: 0.5 }, switchAuth: { alignItems: "center", marginTop: 22 }, link: { color: "#C7D2FE", fontWeight: "700" }, error: { color: "#FDA4AF", marginTop: 12, lineHeight: 20 }, success: { color: "#86EFAC", marginTop: 12, lineHeight: 20 }, offlineNotice: { color: "#FCD34D", fontSize: 12, padding: 12, backgroundColor: "#2A2518", borderRadius: 12, lineHeight: 18 },
  page: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 42, maxWidth: 1200, width: "100%", alignSelf: "center" }, topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }, brandSmall: { color: "#A5B4FC", letterSpacing: 2, fontSize: 10, fontWeight: "900", marginBottom: 7 }, greeting: { color: "#F4F6FF", fontSize: 25, fontWeight: "800", letterSpacing: -0.6 }, logout: { borderColor: "#303A54", borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 }, logoutText: { color: "#B7C0D7", fontSize: 12, fontWeight: "700" },
  hero: { backgroundColor: "#1B2440", borderRadius: 24, padding: 22, borderWidth: 1, borderColor: "#2D3A60", overflow: "hidden" }, eyebrow: { color: "#B8C3FF", letterSpacing: 2, fontSize: 9, fontWeight: "900", marginBottom: 12 }, heroTitle: { color: "#F4F6FF", fontSize: 31, fontWeight: "900", lineHeight: 35, letterSpacing: -1 }, heroSub: { color: "#AEB9D6", fontSize: 13, lineHeight: 20, marginTop: 12 }, heroStats: { flexDirection: "row", alignItems: "center", gap: 24, marginTop: 24, paddingTop: 18, borderTopColor: "#394666", borderTopWidth: 1 }, statNumber: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" }, statLabel: { color: "#AEB9D6", fontSize: 11, marginTop: 4 }, statDivider: { width: 1, height: 34, backgroundColor: "#394666" },
  tabs: { backgroundColor: "#131A2D", borderRadius: 13, padding: 4, marginTop: 22, marginBottom: 6, maxHeight: 44 }, tabContent: { flexDirection: "row", gap: 3 }, tab: { minWidth: 64, alignItems: "center", paddingVertical: 11, paddingHorizontal: 8, borderRadius: 10 }, activeTab: { backgroundColor: "#293456" }, tabText: { color: "#8F9AB5", fontSize: 12, fontWeight: "700" }, activeTabText: { color: "#DDE2FF" }, section: { marginTop: 22 }, sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, sectionTitle: { color: "#F4F6FF", fontSize: 19, fontWeight: "800", letterSpacing: -0.4 }, sectionCount: { color: "#929BB4", fontSize: 11 }, addRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8 }, addInput: { flex: 1, marginTop: 0, paddingVertical: 12 }, addButton: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#A5B4FC", alignItems: "center", justifyContent: "center" }, addButtonText: { color: "#0B1020", fontSize: 26, fontWeight: "500", marginTop: -2 },
  empty: { color: "#78839F", fontSize: 13, lineHeight: 20, paddingVertical: 18, paddingHorizontal: 4 }, listItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#11182A", borderColor: "#202A42", borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 8 }, check: { width: 22, height: 22, borderRadius: 8, borderWidth: 1.5, borderColor: "#586482", alignItems: "center", justifyContent: "center" }, checked: { backgroundColor: "#A5B4FC", borderColor: "#A5B4FC" }, checkMark: { color: "#0B1020", fontSize: 14, fontWeight: "900" }, itemTextWrap: { flex: 1 }, itemTitle: { color: "#E8EBF7", fontSize: 14, fontWeight: "600" }, struck: { textDecorationLine: "line-through", color: "#8792AE" }, itemMeta: { color: "#7985A3", fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginTop: 5 }, chevron: { color: "#7F8BA8", fontSize: 20 }, deleteText: { color: "#FDA4AF", fontSize: 22, paddingHorizontal: 4 }, cancelButton: { width: 40, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#202A42" }, cancelText: { color: "#DDE2FF", fontSize: 24 }, formOptions: { padding: 12, backgroundColor: "#11182A", borderRadius: 14, gap: 10, marginBottom: 8 }, optionRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }, optionLabel: { color: "#929BB4", fontSize: 12, width: 100 }, optionPill: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, backgroundColor: "#202A42" }, optionPillActive: { backgroundColor: "#A5B4FC" }, optionPillText: { color: "#B7C0D7", fontSize: 12, textTransform: "capitalize" }, optionPillTextActive: { color: "#0B1020", fontWeight: "700" }, optionInput: { marginTop: 0, paddingVertical: 10 }, targetNumber: { color: "#F4F6FF", fontSize: 14, minWidth: 20, textAlign: "center" }, progressTotals: { color: "#929BB4", fontSize: 13, marginTop: 8, marginBottom: 18 }, dayRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 7 }, dayLabel: { color: "#929BB4", width: 38, fontSize: 12 }, barTrack: { flex: 1, backgroundColor: "#202A42", borderRadius: 6, height: 12, overflow: "hidden" }, barFill: { height: "100%", backgroundColor: "#A5B4FC", borderRadius: 6 }, dayCount: { color: "#DDE2FF", width: 22, textAlign: "right", fontSize: 12 }, settingsEmail: { color: "#929BB4", fontSize: 13, marginTop: 16 }, goalCard: { backgroundColor: "#11182A", borderColor: "#202A42", borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 10 }, goalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, milestoneRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9 }, milestoneMark: { color: "#A5B4FC", fontSize: 18 }, addMilestone: { paddingTop: 8 }, footer: { color: "#56617B", fontSize: 9, letterSpacing: 2, fontWeight: "800", textAlign: "center", marginTop: 34 }
});
