import assert from "node:assert/strict";
import test from "node:test";
import { transformOfflineSnapshot } from "../src/lib/offlineMutations";

const base = { tasksPage: null, habitsData: null, projectsData: null, goalsData: null, profileData: null, focusData: null };

test("offline task completion updates the cached task immediately without inventing an XP event", () => {
  const result = transformOfflineSnapshot("PATCH", "/tasks/task-1", { status: "done" }, {
    ...base,
    tasksPage: { total: 1, tasks: [{ _id: "task-1", title: "Write release notes", status: "todo" }] }
  }, "2026-11-03T12:00:00.000Z");
  assert.ok(result);
  const task = (result.response as { task: Record<string, unknown> }).task;
  assert.equal(task.status, "done");
  assert.equal(task.completedAt, "2026-11-03T12:00:00.000Z");
  assert.deepEqual(result.writes.map((write) => write.cacheKey), ["hyper_track_api_cache:/tasks?limit=100"]);
  assert.equal(JSON.stringify(result).includes("xp_transactions"), false);
});

test("offline habit check-in preserves the local date and avoids duplicate dates", () => {
  const result = transformOfflineSnapshot("POST", "/habits/habit-1/completions", { date: "2026-11-03" }, {
    ...base,
    habitsData: { habits: [{ _id: "habit-1", name: "Walk", completions: ["2026-11-03"] }] }
  });
  assert.ok(result);
  assert.deepEqual((result.response as { habit: { completions: string[] } }).habit.completions, ["2026-11-03"]);
});

test("offline project archive also removes project assignment from cached tasks", () => {
  const result = transformOfflineSnapshot("DELETE", "/projects/project-1", {}, {
    ...base,
    projectsData: { projects: [{ _id: "project-1", name: "Launch", status: "active" }] },
    tasksPage: { total: 1, tasks: [{ _id: "task-1", project: { _id: "project-1", name: "Launch" } }] }
  }, "2026-11-03T12:00:00.000Z");
  assert.ok(result);
  assert.equal(result.writes.length, 2);
  const taskPage = result.writes.find((write) => write.cacheKey.includes("/tasks?"))?.cacheValue as { tasks: Array<{ project: unknown }> };
  assert.equal(taskPage.tasks[0].project, null);
});

test("offline goal milestone updates require a real cached milestone", () => {
  const absent = transformOfflineSnapshot("PATCH", "/goals/goal-1/milestones/missing", { completed: true }, {
    ...base, goalsData: { goals: [{ _id: "goal-1", milestones: [] }] }
  });
  assert.equal(absent, null);
});

test("offline task and project creation use server-compatible stable identifiers", () => {
  const project = transformOfflineSnapshot("POST", "/projects", { name: "Launch" }, { ...base, projectsData: { projects: [] } });
  assert.ok(project);
  const localProject = (project.response as { project: Record<string, unknown> }).project;
  assert.match(String(localProject._id), /^[a-f\d]{24}$/i);
  assert.equal(localProject.localOnly, true);
  const task = transformOfflineSnapshot("POST", "/tasks", { title: "Ship", projectId: localProject._id }, { ...base, tasksPage: { tasks: [], total: 0 } });
  assert.ok(task);
  const localTask = (task.response as { task: Record<string, unknown> }).task;
  assert.match(String(localTask._id), /^[a-f\d]{24}$/i);
  assert.equal(localTask.projectId, localProject._id);
  assert.equal(localTask.localOnly, true);
});
