/**
 * FoFoDo Cloud Functions (2nd gen) — one surface for REST API, MCP, and the
 * scheduled reminder engine (architecture §7). All scale to zero (NFR-3).
 * Functions are `fofodo`-prefixed so they never collide with sibling apps on
 * the shared FoFoApps project.
 */
import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { app } from "./api";
import { mcpApp } from "./mcp";
import { runReminderTick } from "./reminders";
import { CONFIG } from "./config";

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

/** REST API (REQ-API-01). Hosting rewrites /api/** here. */
export const fofodoApi = onRequest({ cors: true, memory: "256MiB" }, app);

/** MCP server (REQ-MCP-01). Hosting rewrites /mcp here. */
export const fofodoMcp = onRequest({ cors: true, memory: "256MiB" }, mcpApp);

/** Reminder dispatch tick (REQ-REM-03) — every 5 minutes (OPEN-QUESTIONS Q6). */
export const fofodoScheduler = onSchedule(
  { schedule: CONFIG.REMINDER_SCHEDULE, memory: "256MiB", timeoutSeconds: 120 },
  async () => {
    const result = await runReminderTick();
    console.log("reminder tick", result);
  }
);
