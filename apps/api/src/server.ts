import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/db.js";
import { authRouter } from "./routes/auth.routes.js";
import { tasksRouter } from "./routes/tasks.routes.js";
import { habitsRouter } from "./routes/habits.routes.js";
import { errorHandler, notFound } from "./middleware/errors.js";

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((value) => value.trim()), credentials: false }));
app.use(express.json({ limit: "100kb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));
app.get("/health", (_req, res) => res.json({ status: "ok", service: "hyper-track-api" }));
app.use("/api/auth", authRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/habits", habitsRouter);
app.use(notFound);
app.use(errorHandler);

const start = async () => {
  await connectDatabase();
  app.listen(env.PORT, "0.0.0.0", () => console.log(`Hyper Track API listening on port ${env.PORT}`));
};
start().catch((error: unknown) => { console.error("Failed to start API", error); process.exit(1); });
