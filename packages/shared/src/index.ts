export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskRecurrence = "none" | "daily" | "weekly";

export interface TaskDTO {
  _id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  recurrence?: TaskRecurrence;
  dueDate?: string | null;
  plannedDate?: string | null;
  reminderAt?: string | null;
  project?: string | { _id: string; name: string } | null;
  parentTask?: string | { _id: string; title: string } | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface HabitDTO {
  _id: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  difficulty?: "easy" | "medium" | "hard";
  frequency: "daily" | "weekly";
  targetPerWeek: number;
  daysOfWeek?: number[];
  completions: string[];
  createdAt: string;
}

export interface AuthUserDTO {
  id: string;
  name: string;
  email: string;
  timezone: string;
}

export interface GoalDTO {
  _id: string;
  title: string;
  description?: string;
  targetDate?: string | null;
  status: "active" | "completed";
  milestones: { _id: string; title: string; completedAt?: string | null }[];
}

export interface ProjectDTO {
  _id: string;
  name: string;
  description?: string;
  status: "active" | "completed";
}

export interface DailyProgressDTO {
  date: string;
  tasksCompleted: number;
  habitsCompleted: number;
}
