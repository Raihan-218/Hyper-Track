import mongoose from "mongoose";
import { connectDatabase } from "../config/db.js";
import { Habit } from "../models/Habit.js";
import { HabitCompletion } from "../models/HabitCompletion.js";
import { Task } from "../models/Task.js";
import { TaskCompletion } from "../models/TaskCompletion.js";
import { User } from "../models/User.js";
import { TaskPlanSnapshot } from "../models/TaskPlanSnapshot.js";
import { HabitScheduleSnapshot } from "../models/HabitScheduleSnapshot.js";

function localDate(date: Date, timezone: string): string {
  const fields = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

async function main() {
  await connectDatabase();
  let taskEvents = 0; let habitEvents = 0; let habitSchedules = 0;
  let planSnapshots = 0;
  for await (const task of Task.find({ plannedDate: { $type: "string" } }).select("user title priority plannedDate createdAt").cursor()) {
    if (await TaskPlanSnapshot.exists({ user: task.user, task: task._id })) continue;
    await TaskPlanSnapshot.create({ user: task.user, task: task._id, title: task.title, priority: task.priority, plannedDate: task.plannedDate, assignedAt: new Date(), source: "migration" });
    planSnapshots += 1;
  }
  for await (const task of Task.find({ status: "done", completedAt: { $type: "date" } }).select("user title priority completedAt").cursor()) {
    const existing = await TaskCompletion.exists({ user: task.user, task: task._id });
    if (existing || !task.completedAt) continue;
    const user = await User.findById(task.user).select("timezone").lean();
    const timezone = user?.timezone || "UTC";
    await TaskCompletion.create({ user: task.user, task: task._id, title: task.title, priority: task.priority, completedAt: task.completedAt, localDate: localDate(task.completedAt, timezone), timezone, source: "migration" });
    taskEvents += 1;
  }
  for await (const habit of Habit.find({ archivedAt: null }).select("user name completions frequency targetPerWeek daysOfWeek").cursor()) {
    if (!await HabitScheduleSnapshot.exists({ user: habit.user, habit: habit._id })) {
      await HabitScheduleSnapshot.create({ user: habit.user, habit: habit._id, name: habit.name, frequency: habit.frequency, targetPerWeek: habit.targetPerWeek, daysOfWeek: habit.daysOfWeek, validFromAt: new Date(), source: "migration" });
      habitSchedules += 1;
    }
    for (const date of habit.completions) {
      const existing = await HabitCompletion.exists({ user: habit.user, habit: habit._id, localDate: date });
      if (existing) continue;
      // Old records contain only a date. Keep completedAt and timezone null rather than inventing a time.
      await HabitCompletion.create({ user: habit.user, habit: habit._id, name: habit.name, localDate: date, completedAt: null, timezone: null });
      habitEvents += 1;
    }
  }
  console.log(`Backfill complete: ${taskEvents} task events, ${habitEvents} habit events, ${planSnapshots} current planned-date snapshots, ${habitSchedules} current habit schedules.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); });
