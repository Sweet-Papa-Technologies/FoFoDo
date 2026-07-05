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
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { resolveApiKey } from "./apikeys";
import { resolveOAuthToken, wwwAuthenticate } from "./oauth";
import { setActive, Wip3Error, NotFoundError, ValidationError } from "./wip3";
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
    { description: "Update a task's title, notes, hat, project, due, lifecycle status (not 'active' — use set_active), or workStatus (none|in_progress|blocked|waiting|review).",
      inputSchema: { id: z.string(), title: z.string().optional(), notes: z.string().optional(),
        hatId: z.string().optional(), projectId: z.string().nullable().optional(),
        due: z.number().nullable().optional(), status: z.string().optional(),
        workStatus: z.string().optional() } },
    async (args: any) => json(await repo.updateTask(uid, args.id, args as any)));

  (server as any).registerTool("complete_task",
    { description: "Mark a task done.", inputSchema: { id: z.string() } },
    async ({ id }: any) => json(await repo.completeTask(uid, id)));

  (server as any).registerTool("delete_task",
    { description: "Permanently delete a task (and its comments). This cannot be undone.", inputSchema: { id: z.string() } },
    async ({ id }: any) => json(await repo.deleteTask(uid, id)));

  (server as any).registerTool("set_active_bet",
    { description: "Set, update, or clear the Active Bet (Top Priority) — the single project pinned on the dashboard, with an optional free-text 'leading indicator' (success signal). Pass projectId to set/update it (optionally with leadingIndicator), or clear:true to remove the Active Bet.",
      inputSchema: { projectId: z.string().optional(), leadingIndicator: z.string().nullable().optional(), clear: z.boolean().optional() } },
    async ({ projectId, leadingIndicator, clear }: any) => {
      if (clear || !projectId) return json(await repo.clearActiveBet(uid));
      return json(await repo.setActiveBet(uid, projectId, leadingIndicator ?? null));
    });

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

  (server as any).registerTool("add_comment",
    { description: "Add a markdown comment to a task. Optional attachments are [{url,name,contentType?,size?}].",
      inputSchema: { taskId: z.string(), body: z.string(),
        attachments: z.array(z.object({ url: z.string(), name: z.string(), contentType: z.string().optional(), size: z.number().optional() })).optional() } },
    async ({ taskId, body, attachments }: any) => json(await repo.addComment(uid, taskId, body, attachments || [], "mcp")));

  (server as any).registerTool("list_comments",
    { description: "List the markdown comments on a task (chronological).", inputSchema: { taskId: z.string() } },
    async ({ taskId }: any) => json({ comments: await repo.listComments(uid, taskId) }));

  (server as any).registerTool("set_reminder",
    { description: "Attach a reminder to a task. fireAt is epoch ms; channels are 'push' and/or 'webhook'.",
      inputSchema: { taskId: z.string(), fireAt: z.number(), channels: z.array(z.string()).optional(),
        webhookUrl: z.string().nullable().optional(), webhookSecret: z.string().nullable().optional() } },
    async (args: any) => {
      try {
        return json(await repo.setReminder(uid, args as any));
      } catch (e) {
        if (e instanceof ValidationError) return json({ error: "invalid_request", message: (e as Error).message });
        throw e;
      }
    });

  return server;
}

export const mcpApp = express();
mcpApp.use(express.json({ limit: "1mb" }));

/**
 * Resolve the caller to a uid via EITHER an API key (X-API-Key or
 * Bearer fofodo_...) OR an OAuth 2.1 access token (Bearer ...). Returns null if
 * unauthenticated/invalid.
 */
async function resolvePrincipal(req: Request): Promise<{ uid: string } | null> {
  const apiKeyHeader = (req.header("x-api-key") || "").trim();
  const bearer = (req.header("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (apiKeyHeader) {
    const r = await resolveApiKey(apiKeyHeader);
    if (r) return { uid: r.uid };
  }
  if (bearer) {
    if (bearer.startsWith("fofodo_")) {
      const r = await resolveApiKey(bearer);
      if (r) return { uid: r.uid };
    } else {
      const r = await resolveOAuthToken(bearer); // OAuth access token
      if (r) return r;
    }
  }
  return null;
}

function unauthorized(res: Response) {
  // RFC 9728: point clients at our protected-resource metadata so they can start
  // the OAuth "approve in a screen" flow.
  res.set("WWW-Authenticate", wwwAuthenticate());
  return res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Authorization required. Connect with OAuth (approve in browser) or a FoFoDo API key." }, id: null });
}

// ---- Streamable HTTP transport (modern, stateless) ------------------------
mcpApp.post(["/mcp", "/mcp/"], async (req: Request, res: Response) => {
  const principal = await resolvePrincipal(req);
  if (!principal) return unauthorized(res);
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

// ---- SSE transport (legacy; for clients that speak HTTP+SSE) --------------
// Stateful: the GET opens the event stream, POSTs carry messages keyed by
// sessionId. The MCP function is pinned to a single instance (see index.ts) so
// the in-memory session map survives between the two requests.
const sseSessions: Record<string, { transport: SSEServerTransport; server: McpServer }> = {};

mcpApp.get(["/mcp/sse", "/sse"], async (req: Request, res: Response) => {
  const principal = await resolvePrincipal(req);
  if (!principal) return unauthorized(res);
  const transport = new SSEServerTransport("/mcp/messages", res);
  const server = buildServer(principal.uid);
  sseSessions[transport.sessionId] = { transport, server };
  res.on("close", () => { delete sseSessions[transport.sessionId]; server.close(); });
  await server.connect(transport);
});

mcpApp.post(["/mcp/messages", "/messages"], async (req: Request, res: Response) => {
  const sessionId = String(req.query.sessionId || "");
  const session = sseSessions[sessionId];
  if (!session) return res.status(404).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unknown or expired SSE session." }, id: null });
  await session.transport.handlePostMessage(req, res, req.body);
});

// Plain GET /mcp (no SSE) → hint clients toward POST/SSE.
mcpApp.get(["/mcp", "/mcp/"], (_req, res) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Use POST for Streamable HTTP, or GET /mcp/sse for SSE." }, id: null }));
