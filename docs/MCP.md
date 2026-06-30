# FoFoDo MCP Server

FoFoDo exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so MCP clients — **Claude Code**, **FOREMAN**, and any other standard MCP client — can drive FoFoDo programmatically. It is implemented in `functions/src/mcp.ts` on the `fofodoMcp` Cloud Function.

Every tool routes through the **same** repo / WIP-3 / auth code as the REST API, so MCP clients get **zero backdoors** around the constraints. In particular, `set_active` enforces WIP-3 identically to the API (REQ-MCP-02, G-5).

---

## Endpoints & transports

FoFoDo supports **both** MCP HTTP transports:

| Transport | URL | Notes |
|-----------|-----|-------|
| **Streamable HTTP** (recommended) | `https://fofodo.web.app/mcp` (POST) | Modern, stateless. What Claude/most clients use. Works through the clean hosting URL. |
| **SSE** (legacy) | `https://fofodomcp-2ulse5y3hq-uc.a.run.app/mcp/sse` (GET stream) + `/mcp/messages?sessionId=…` (POST) | For older HTTP+SSE clients. **Must use the direct Cloud Run function URL**, not `fofodo.web.app`, because the Firebase Hosting CDN buffers SSE streams. The `fofodoMcp` function is pinned to one instance so SSE sessions survive between the GET stream and message POSTs. |

`GET /mcp` (no SSE) returns `405` with a hint to use POST or `/mcp/sse`.

---

## Authentication — two ways

### 1. OAuth 2.1 "approve in your browser" (recommended for end users)

FoFoDo is its own OAuth 2.1 authorization server (per the MCP auth spec, 2025-06-18), so adding it as a remote MCP server in a client like Claude is a **one-click approve flow** — no API key to paste:

1. The client hits `/mcp` with no token → `401` + `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`.
2. It reads `/.well-known/oauth-protected-resource` → finds the authorization server, then `/.well-known/oauth-authorization-server`.
3. It dynamically registers (`POST /oauth/register`, RFC 7591) and opens `/oauth/authorize` in a browser.
4. **You see a FoFoDo consent screen, sign in (Google / email), and click "Approve access."**
5. The client exchanges a PKCE auth code at `/oauth/token` for a Bearer access token (1 h, with a rotating refresh token) bound to your account and the `/mcp` audience (RFC 8707).
6. The client calls `/mcp` with `Authorization: Bearer <access-token>`.

Just point your MCP client at `https://fofodo.web.app/mcp` and it will discover and drive this flow automatically.

### 2. API key (good for scripts / FOREMAN)

Send a **FoFoDo API key** (REQ-MCP-03) as either header:

- `X-API-Key: fofodo_...`, or
- `Authorization: Bearer fofodo_...`

Create one via the REST API (`POST /api/keys`) or in the app's **Settings → API keys** (plaintext shown once).

Either method resolves to the same per-user authorization. An invalid/missing credential returns JSON-RPC `code -32001` with HTTP `401` and the `WWW-Authenticate` header above. On hosted, per-key quotas apply.

---

## Connecting a client

### Claude Code

```bash
claude mcp add --transport http fofodo https://fofodo.web.app/mcp \
  --header "X-API-Key: fofodo_xxxxxxxxxxxx_yyyyyyyy..."
```

### Generic MCP client config

```json
{
  "mcpServers": {
    "fofodo": {
      "type": "http",
      "url": "https://fofodo.web.app/mcp",
      "headers": { "X-API-Key": "fofodo_xxxxxxxxxxxx_yyyyyyyy..." }
    }
  }
}
```

Once connected, the client can list and call the nine tools below.

---

## Tools

All tools return their result as a JSON text block (the underlying repo object, pretty-printed). Server identity: `name: "fofodo", version: "1.0.0"`.

| Tool | Inputs | Returns |
| --- | --- | --- |
| **`capture_task`** | `text` (string) | The created task. Quick-captures into the inbox; natural language is parsed deterministically, with optional AI refinement when the user has AI on. |
| **`list_tasks`** | `view?` (string: `today`\|`active`\|`next`\|`inbox`\|`done`\|`snoozed`\|`by_hat`\|`by_project`\|`all`; default `active`), `hatId?`, `projectId?` | `{ tasks: [...] }` filtered by the view (respects paused-project hiding). |
| **`update_task`** | `id` (string), and any of `title?`, `notes?`, `hatId?`, `projectId?` (nullable), `due?` (number, nullable), `status?`, `workStatus?` (`none`\|`in_progress`\|`blocked`\|`waiting`\|`review`) | The updated task. **`status: "active"` is not allowed** — use `set_active`. `workStatus` is the secondary progress label shown on the task. |
| **`complete_task`** | `id` (string) | The task marked `done`. |
| **`set_active`** | `id` (string), `bumpTaskId?` (string) | On success, `{ id, status: "active", activeCount, bumped? }`. **Enforces WIP-3 identically to the API:** if 3 are already active and no `bumpTaskId` is given, returns `{ error: "wip3_limit", message, activeTasks: [...] }`; re-call with `bumpTaskId` set to one of those ids to swap. |
| **`snooze_task`** | `id` (string), `until?` (number, epoch ms) | The snoozed task; it returns to `next` on/after `until`. Increments the avoidance `pushCount`. |
| **`search`** | `query` (string) | `{ tasks: [...], projects: [...] }` — substring match over task titles/notes and project names. |
| **`get_dashboard`** | _(none)_ | The home dashboard: `{ activeBet, yourThree, hatBalance, needsAttention }`. |
| **`add_comment`** | `taskId` (string), `body` (markdown string), `attachments?` (`[{url,name,contentType?,size?}]`) | The created comment. Body is markdown; attachments embed multimedia. |
| **`list_comments`** | `taskId` (string) | `{ comments: [...] }` in chronological order. |
| **`set_reminder`** | `taskId` (string), `fireAt` (number, epoch ms), `channels?` (string[]: `push`/`webhook`), `webhookUrl?` (nullable), `webhookSecret?` (nullable) | The created reminder. When `webhookSecret` is set, the dispatched webhook is signed `x-fofodo-signature: sha256=<hmac>`. |

### WIP-3 over MCP

Because `set_active` calls the same server transaction as `POST /api/tasks/:id/activate`, the 3-active limit is identical across UI, REST, and MCP. A 4th activation without a bump comes back as a structured `wip3_limit` payload listing the current three active tasks — the client (or the model driving it) is expected to pick one to bump and re-call.

---

## Notes

- The MCP surface intentionally exposes the task/dashboard/reminder workflow, not account administration (settings, keys, export/delete) — use the REST API for those.
- Because the transport is stateless, there is no long-lived session; each call is independently authenticated by the API key header.
