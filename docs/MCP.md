# FoFoDo MCP Server

FoFoDo exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so MCP clients — **Claude Code**, **FOREMAN**, and any other standard MCP client — can drive FoFoDo programmatically. It is implemented in `functions/src/mcp.ts` on the `fofodoMcp` Cloud Function.

Every tool routes through the **same** repo / WIP-3 / auth code as the REST API, so MCP clients get **zero backdoors** around the constraints. In particular, `set_active` enforces WIP-3 identically to the API (REQ-MCP-02, G-5).

---

## Endpoint & transport

- **Endpoint (hosted):** `https://fofodo.web.app/mcp`
- **Endpoint (self-host):** `https://<your-site>.web.app/mcp`
- **Transport:** Streamable HTTP, **stateless** (no session id is generated). Each request opens a fresh transport, handles the JSON-RPC body, and closes.
- **Method:** **POST only.** `GET`/`DELETE` to `/mcp` return `405` (`Method not allowed; use POST.`).

---

## Authentication

MCP authenticates with a **FoFoDo API key** (REQ-MCP-03), the same key model as the REST API. Send it as either header:

- `X-API-Key: fofodo_...`, or
- `Authorization: Bearer fofodo_...`

An invalid or missing key returns a JSON-RPC error (`code -32001`, "Invalid or missing FoFoDo API key.") with HTTP `401`. On hosted, per-key quotas apply just as they do on the API.

Create a key first via the REST API (`POST /api/keys`) — the plaintext is shown once.

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
| **`update_task`** | `id` (string), and any of `title?`, `notes?`, `hatId?`, `projectId?` (nullable), `due?` (number, nullable), `status?` | The updated task. **`status: "active"` is not allowed** — use `set_active`. |
| **`complete_task`** | `id` (string) | The task marked `done`. |
| **`set_active`** | `id` (string), `bumpTaskId?` (string) | On success, `{ id, status: "active", activeCount, bumped? }`. **Enforces WIP-3 identically to the API:** if 3 are already active and no `bumpTaskId` is given, returns `{ error: "wip3_limit", message, activeTasks: [...] }`; re-call with `bumpTaskId` set to one of those ids to swap. |
| **`snooze_task`** | `id` (string), `until?` (number, epoch ms) | The snoozed task; it returns to `next` on/after `until`. Increments the avoidance `pushCount`. |
| **`search`** | `query` (string) | `{ tasks: [...], projects: [...] }` — substring match over task titles/notes and project names. |
| **`get_dashboard`** | _(none)_ | The home dashboard: `{ activeBet, yourThree, hatBalance, needsAttention }`. |
| **`set_reminder`** | `taskId` (string), `fireAt` (number, epoch ms), `channels?` (string[]: `push`/`webhook`), `webhookUrl?` (nullable), `webhookSecret?` (nullable) | The created reminder. When `webhookSecret` is set, the dispatched webhook is signed `x-fofodo-signature: sha256=<hmac>`. |

### WIP-3 over MCP

Because `set_active` calls the same server transaction as `POST /api/tasks/:id/activate`, the 3-active limit is identical across UI, REST, and MCP. A 4th activation without a bump comes back as a structured `wip3_limit` payload listing the current three active tasks — the client (or the model driving it) is expected to pick one to bump and re-call.

---

## Notes

- The MCP surface intentionally exposes the task/dashboard/reminder workflow, not account administration (settings, keys, export/delete) — use the REST API for those.
- Because the transport is stateless, there is no long-lived session; each call is independently authenticated by the API key header.
