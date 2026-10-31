export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "done";

export interface TaskDTO {
  _id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HabitDTO {
  _id: string;
  name: string;
  description?: string;
  frequency: "daily" | "weekly";
  targetPerWeek: number;
  completions: string[];
  createdAt: string;
}

export interface AuthUserDTO {
  id: string;
  name: string;
  email: string;
}
