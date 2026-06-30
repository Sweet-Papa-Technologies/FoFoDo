/**
 * MCP server (REQ-MCP-01/02/03) — Streamable-HTTP, stateless, on the same
 * Cloud Functions surface. Authenticates with a FoFoDo API key and routes every
 * tool through the SAME repo/WIP-3 code as the REST API, so MCP clients
 * (Claude Code / FOREMAN) get zero backdoors around the constraints (G-5).
 */
import express, { Request, Response } from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { resolveApiKey } from "./apikeys";
import { setActive, Wip3Error, NotFoundError } from "./wip3";
import { captureTask } from "./capture";
import { userRef } from "./firebase";
import { aiEnabledFor } from "./ai";
import * as repo from "./repo";

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

function buildServer(uid: string): McpServer {
  const server = new McpServer({ name: "fofodo", version: "1.0.0" });

  (server as any).registerTool("capture_task",
    { description: "Quick-capture a task into the inbox. Natural language is parsed (e.g. 'call Jamie tomorrow 3pm #distribution').", inputSchema: { text: z.string() } },
    async ({ text }: any) => {
      const settings = (await userRef(uid).get()).data()?.settings;
      return json(await captureTask(uid, text, { aiEnabled: aiEnabledFor(settings) }));
    });

  (server as any).registerTool("list_tasks",
    { description: "List tasks by view (today|active|next|inbox|done|snoozed|by_hat|by_project|all).",
      inputSchema: { view: z.string().optional(), hatId: z.string().optional(), projectId: z.string().optional() } },
    async ({ view, hatId, projectId }: any) =>
      json({ tasks: await repo.listTasks(uid, (view as repo.View) || "active", { hatId, projectId }) }));

  (server as any).registerTool("update_task",
    { description: "Update a task's title, notes, hat, project, due, or status (not 'active' — use set_active).",
      inputSchema: { id: z.string(), title: z.string().optional(), notes: z.string().optional(),
        hatId: z.string().optional(), projectId: z.string().nullable().optional(),
        due: z.number().nullable().optional(), status: z.string().optional() } },
    async (args: any) => json(await repo.updateTask(uid, args.id, args as any)));

  (server as any).registerTool("complete_task",
    { description: "Mark a task done.", inputSchema: { id: z.string() } },
    async ({ id }: any) => json(await repo.completeTask(uid, id)));

  (server as any).registerTool("set_active",
    { description: "Commit a task to active. Enforces WIP-3: if 3 are already active, pass bumpTaskId (one of the active task ids) to make room, or omit it to receive the current 3.",
      inputSchema: { id: z.string(), bumpTaskId: z.string().optional() } },
    async ({ id, bumpTaskId }: any) => {
      try {
        return json(await setActive(uid, id, bumpTaskId || null));
      } catch (e) {
        if (e instanceof Wip3Error) {
          return json({ error: "wip3_limit", message: "You already have 3 active tasks. Re-call set_active with bumpTaskId set to one of these to swap.", activeTasks: e.activeTasks });
        }
        if (e instanceof NotFoundError) return json({ error: "not_found", message: (e as Error).message });
        throw e;
      }
    });

  (server as any).registerTool("snooze_task",
    { description: "Snooze a task with an optional wake time (epoch ms). It returns to 'next' on/after that time.",
      inputSchema: { id: z.string(), until: z.number().optional() } },
    async ({ id, until }: any) => json(await repo.snoozeTask(uid, id, until ?? null)));

  (server as any).registerTool("search",
    { description: "Search task titles/notes and project names.", inputSchema: { query: z.string() } },
    async ({ query }: any) => json(await repo.search(uid, query)));

  (server as any).registerTool("get_dashboard",
    { description: "Get the home dashboard: Active Bet, your 3 active tasks, hat balance this week, needs-attention.", inputSchema: {} },
    async () => json(await repo.getDashboard(uid)));

  (server as any).registerTool("set_reminder",
    { description: "Attach a reminder to a task. fireAt is epoch ms; channels are 'push' and/or 'webhook'.",
      inputSchema: { taskId: z.string(), fireAt: z.number(), channels: z.array(z.string()).optional(),
        webhookUrl: z.string().nullable().optional(), webhookSecret: z.string().nullable().optional() } },
    async (args: any) => json(await repo.setReminder(uid, args as any)));

  return server;
}

export const mcpApp = express();
mcpApp.use(express.json({ limit: "1mb" }));

mcpApp.post(["/mcp", "/mcp/"], async (req: Request, res: Response) => {
  const key = (req.header("x-api-key") || (req.header("authorization") || "").replace(/^Bearer\s+/i, "")).trim();
  const principal = await resolveApiKey(key);
  if (!principal) {
    return res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Invalid or missing FoFoDo API key." }, id: null });
  }
  const server = buildServer(principal.uid);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
  res.on("close", () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("MCP error:", e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
  }
});

// MCP Streamable HTTP uses POST; GET/DELETE not needed in stateless mode.
mcpApp.get(["/mcp", "/mcp/"], (_req, res) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed; use POST." }, id: null }));
